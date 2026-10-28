import { z } from "zod";
import type { AgentImpl } from "./context.ts";
import { createDraftTool, DRAFT_POLICIES } from "./create-draft.ts";
import { slug as slugSchema } from "./draft-schema.ts";
import { completeJson } from "./llm.ts";
import { readPage } from "./page-reader.ts";
import { TRADUCTEUR_SYSTEM } from "./prompts.ts";
import { extractStrings } from "./translator-keys.ts";

const UUID = z.uuid();
const Answer = z.record(z.string(), z.string());

/** Regroupe les chaînes par lots dont la taille totale reste sous `maxChars` (une chaîne trop longue forme son propre lot). */
function batchStrings(
  source: Record<string, string>,
  maxChars: number,
): Record<string, string>[] {
  const batches: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  let size = 0;
  for (const [k, v] of Object.entries(source)) {
    if (size > 0 && size + v.length > maxChars) {
      batches.push(current);
      current = {};
      size = 0;
    }
    current[k] = v;
    size += v.length;
  }
  if (Object.keys(current).length) batches.push(current);
  return batches;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/**
 * Traducteur fr-CA -> en-CA. Précondition « sur approbation du français » : la page doit être PUBLIÉE (donc son
 * français a été approuvé et promu). Le modèle ne reçoit que des chaînes ; la structure vient du code.
 */
export const traducteur: AgentImpl = async (ctx) => {
  const pageId = UUID.safeParse(ctx.run.input.pageId);
  if (!pageId.success) throw new Error("identifiant de page invalide");
  if (!ctx.directus) throw new Error("client Directus absent");
  const page = await readPage(ctx.directus, pageId.data);
  if (page.status !== "published")
    throw new Error(
      "la page française n'est pas publiée : la traduction se fait après l'approbation du français",
    );
  const source = extractStrings(page);
  const keys = Object.keys(source);
  if (keys.length === 0) throw new Error("aucune chaîne française à traduire");
  ctx.event("info", `${keys.length} chaîne(s) à traduire`);

  // La sortie d'un appel est plafonnée (raisonnement compris) : on traduit par lots de taille bornée.
  const answer: Record<string, string> = {};
  const batches = batchStrings(
    source,
    Number(ctx.agent.config.batchChars) || 2600,
  );
  ctx.event("info", `${batches.length} lot(s) de traduction`);
  for (const [index, batch] of batches.entries()) {
    const part = await completeJson(
      ctx,
      Answer,
      [
        { role: "system", content: TRADUCTEUR_SYSTEM },
        {
          role: "user",
          content:
            index === 0
              ? JSON.stringify(batch)
              : `${JSON.stringify(batch)}\n(Suite de la même page : n'ajoute pas de clé spéciale.)`,
        },
      ],
      { maxTokens: 4096 },
    );
    for (const [k, v] of Object.entries(part))
      if (k in batch || (index === 0 && (k === "_slug" || k === "_summary")))
        answer[k] = v;
  }
  const { _slug, _summary, ...strings } = answer;
  const title = strings["p.title"] ?? "";
  const slugCandidate = slugSchema.safeParse(_slug ?? "");
  const slug = slugCandidate.success ? slugCandidate.data : slugify(title);
  const {
    "p.title": _t,
    "p.seo_title": seoTitle,
    "p.seo_description": seoDescription,
    ...blockStrings
  } = strings;
  // Les clés « p.* » sont fournies à l'outil par la méta de page ; les autres sont les chaînes de blocs.
  const tool = createDraftTool({
    policy: DRAFT_POLICIES.traducteur,
    directus: ctx.directus,
    runId: ctx.run.id,
  });
  const result = await tool.execute({
    mode: "update_translation",
    approvalKind: "traduction",
    summary:
      (_summary ?? "").replace(/[<>]/g, "").slice(0, 700) ||
      "Traduction en anglais canadien de la page, à relire.",
    pageId: page.id,
    language: "en-CA",
    page: {
      slug,
      title,
      seo_title: seoTitle ?? title,
      seo_description: seoDescription ?? title,
    },
    strings: blockStrings,
  });
  ctx.event(
    "info",
    `brouillon de traduction créé : version ${result.versionKey}, approbation ${result.approvalId}`,
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
};
