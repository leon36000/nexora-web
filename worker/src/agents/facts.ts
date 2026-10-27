import { z } from "zod";
import type { AgentContext } from "./context.ts";
import { text } from "./draft-schema.ts";
import { wrapUntrusted } from "./ingest.ts";
import { detectInjectionMarkers } from "./injection.ts";
import { completeJson } from "./llm.ts";
import { EXTRACT_SYSTEM } from "./prompts.ts";

/**
 * ÉTAPE 1, INGESTION : lire une source externe et n'en garder que des faits courts.
 * Le modèle de cette étape n'a AUCUN outil. Sa sortie est un JSON borné ; tout fait qui ressemble à une consigne
 * adressée à une IA est écarté avant de passer à l'étape d'écriture (injection de second ordre).
 */
const Facts = z.object({
  summary: text(600).catch(""),
  facts: z.array(text(240)).max(12).catch([]),
  source_contains_instructions: z.boolean().optional(),
});

export interface ExtractedFacts {
  url: string;
  summary: string;
  facts: string[];
  dropped: number;
  markers: string[];
}

export async function extractFacts(
  ctx: AgentContext,
  url: string,
): Promise<ExtractedFacts> {
  const source = await ctx.ingest(url);
  const markers = detectInjectionMarkers(source.text);
  if (markers.length > 0)
    ctx.event(
      "warn",
      `la source contient des consignes adressées à une IA (${markers.join(", ")}) : traitées comme des données, jamais exécutées`,
    );
  const out = await completeJson(ctx, Facts, [
    { role: "system", content: EXTRACT_SYSTEM },
    { role: "user", content: wrapUntrusted(source) },
  ]);
  const safe = out.facts.filter((f) => detectInjectionMarkers(f).length === 0);
  const summarySafe =
    detectInjectionMarkers(out.summary).length === 0 ? out.summary : "";
  ctx.event(
    "info",
    `source lue (${source.text.length} caractères${source.truncated ? ", tronquée" : ""}) : ${safe.length} fait(s) retenu(s), ${out.facts.length - safe.length} écarté(s)`,
  );
  return {
    url: source.url,
    summary: summarySafe,
    facts: safe,
    dropped: out.facts.length - safe.length,
    markers,
  };
}

/** Faits enveloppés en données pour l'étape d'écriture. */
export function wrapFacts(f: ExtractedFacts): string {
  const lines = f.facts.map((x) => `- ${x.replace(/[<>]/g, "")}`).join("\n");
  return `<faits_extraits source="${f.url.replace(/"/g, "")}">\n${f.summary.replace(/[<>]/g, "")}\n${lines}\n</faits_extraits>`;
}
