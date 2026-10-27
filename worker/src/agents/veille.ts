import { z } from "zod";
import type { AgentImpl } from "./context.ts";
import { text } from "./draft-schema.ts";
import { extractFacts, wrapFacts } from "./facts.ts";
import { detectInjectionMarkers } from "./injection.ts";
import { completeJson } from "./llm.ts";
import { VEILLE_SYSTEM } from "./prompts.ts";

const Answer = z.object({
  proposals: z
    .array(
      z.object({
        title: text(120),
        brief: text(600),
        rationale: text(240),
      }),
    )
    .max(5),
});

/** Veille : lit une source fournie et PROPOSE des briefs (stockés dans la sortie de l'exécution). N'écrit rien dans Directus. */
export const veille: AgentImpl = async (ctx) => {
  const fromInput = ctx.run.input.sourceUrl;
  const fromConfig = ctx.agent.config.sourceUrl;
  const url =
    typeof fromInput === "string" && fromInput
      ? fromInput
      : typeof fromConfig === "string"
        ? fromConfig
        : null;
  if (!url) throw new Error("aucune source fournie (URL)");
  const facts = await extractFacts(ctx, url);
  if (facts.facts.length === 0)
    throw new Error("la source ne contient aucun fait exploitable");
  const answer = await completeJson(ctx, Answer, [
    { role: "system", content: VEILLE_SYSTEM },
    { role: "user", content: wrapFacts(facts) },
  ]);
  const proposals = answer.proposals.filter(
    (p) =>
      detectInjectionMarkers(`${p.title} ${p.brief} ${p.rationale}`).length ===
      0,
  );
  ctx.output.proposals = proposals.map((p) => ({ ...p, source: facts.url }));
  ctx.output.source = {
    url: facts.url,
    markers: facts.markers,
    dropped: facts.dropped,
  };
  ctx.event(
    "info",
    `${proposals.length} brief(s) proposé(s) à partir de la source (aucune écriture dans Directus)`,
  );
};
