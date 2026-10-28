import { z } from "zod";
import type { AgentImpl } from "./context.ts";
import {
  createDraftTool,
  DRAFT_POLICIES,
  DraftRejected,
} from "./create-draft.ts";
import { NewPageInput } from "./draft-schema.ts";
import { extractFacts, wrapFacts } from "./facts.ts";
import type { ToolDefinition } from "./gateway-client.ts";
import { completeWithTool, ModelOutputError } from "./llm.ts";
import { REDACTEUR_SYSTEM } from "./prompts.ts";

/** Paramètres de l'outil présentés au modèle : le mode et le type d'approbation sont fixés par le code. */
const ToolInput = NewPageInput.omit({ mode: true, approvalKind: true });

function toolDefinition(
  schema: z.ZodType,
  name: string,
  description: string,
): ToolDefinition {
  const json = z.toJSONSchema(schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  delete json.$schema;
  return {
    type: "function",
    function: { name, description, parameters: json },
  };
}

export const redacteur: AgentImpl = async (ctx) => {
  const brief = String(ctx.run.input.brief ?? "").trim();
  if (brief.length < 10) throw new Error("brief manquant ou trop court");
  if (!ctx.directus) throw new Error("client Directus absent");
  const sourceUrl =
    typeof ctx.run.input.sourceUrl === "string" && ctx.run.input.sourceUrl
      ? ctx.run.input.sourceUrl
      : null;

  const facts = sourceUrl ? await extractFacts(ctx, sourceUrl) : null;
  const tool = createDraftTool({
    policy: DRAFT_POLICIES.redacteur,
    directus: ctx.directus,
    runId: ctx.run.id,
  });
  const definition = toolDefinition(
    ToolInput,
    tool.name,
    "Enregistre un BROUILLON de nouvelle page (fr-CA) et demande son approbation. Ne publie rien.",
  );
  const messages = [
    { role: "system" as const, content: REDACTEUR_SYSTEM },
    {
      role: "user" as const,
      content: `<brief_equipe>\n${brief.replace(/[<>]/g, "")}\n</brief_equipe>${facts ? `\n\n${wrapFacts(facts)}` : ""}\n\nAppelle l'outil create_draft.`,
    },
  ];

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let args: unknown;
    try {
      args = await completeWithTool(
        ctx,
        definition,
        attempt === 0
          ? messages
          : [
              ...messages,
              {
                role: "user",
                content: `Ton appel précédent a été refusé (${lastProblem}). Appelle de nouveau create_draft avec des arguments conformes.`,
              },
            ],
      );
    } catch (e) {
      if (!(e instanceof ModelOutputError)) throw e;
      lastProblem = e.message;
      continue;
    }
    try {
      // Le mode et le type d'approbation sont ceux du CODE, jamais ceux du modèle.
      const result = await tool.execute({
        ...(args as Record<string, unknown>),
        mode: "new_page",
        approvalKind: "contenu",
      });
      ctx.event(
        "info",
        `brouillon créé : page ${result.pageId}, version ${result.versionKey}, approbation ${result.approvalId}${result.flags ? ` (${result.flags} point(s) à vérifier signalé(s))` : ""}`,
      );
      ctx.output.drafts = [
        {
          pageId: result.pageId,
          versionId: result.versionId,
          versionKey: result.versionKey,
          approvalId: result.approvalId,
          title: result.title,
        },
      ];
      if (facts)
        ctx.output.source = {
          url: facts.url,
          markers: facts.markers,
          dropped: facts.dropped,
        };
      return;
    } catch (e) {
      if (
        !(e instanceof DraftRejected) ||
        e.reason === "directus" ||
        e.reason === "policy"
      )
        throw e;
      lastProblem = e.message;
      ctx.event("warn", `create_draft refusé : ${e.message}`);
    }
  }
  throw new Error(`aucun brouillon accepté (${lastProblem})`);
};
