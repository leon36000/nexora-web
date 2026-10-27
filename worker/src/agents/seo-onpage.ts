import { z } from "zod";
import type { AgentImpl } from "./context.ts";
import { createDraftTool, DRAFT_POLICIES } from "./create-draft.ts";
import { slug as slugSchema, text } from "./draft-schema.ts";
import { completeJson } from "./llm.ts";
import { listPublishedPages, readPage } from "./page-reader.ts";
import { SEO_SYSTEM } from "./prompts.ts";
import { extractStrings } from "./translator-keys.ts";

const UUID = z.uuid();
const Answer = z.object({
  seo_title: text(70),
  seo_description: text(170),
  slug: z.string().nullish(),
  internal_links: z
    .array(
      z.object({
        target_page_id: z.string(),
        anchor: text(80),
        reason: text(160),
      }),
    )
    .max(5)
    .default([]),
  summary: text(500),
});

/**
 * SEO on-page : titre, description, slug (si la page n'est pas publiée) et liens internes SUGGÉRÉS (dans le résumé de
 * l'approbation, jamais écrits dans le contenu). Aucune donnée structurée : le code les génère.
 */
export const seoOnPage: AgentImpl = async (ctx) => {
  const pageId = UUID.safeParse(ctx.run.input.pageId);
  if (!pageId.success) throw new Error("identifiant de page invalide");
  if (!ctx.directus) throw new Error("client Directus absent");
  const page = await readPage(ctx.directus, pageId.data);
  const fr = page.translations.find((t) => t.languages_code === "fr-CA");
  if (!fr) throw new Error("la page n'a pas de version fr-CA");

  const visible = Object.entries(extractStrings(page))
    .filter(([k]) => !k.startsWith("p."))
    .map(([, v]) =>
      v
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("\n")
    .slice(0, 6000);
  const candidates = (await listPublishedPages(ctx.directus, "fr-CA")).filter(
    (p) => p.pageId !== page.id,
  );
  const prompt = [
    `Page : « ${fr.title ?? ""} » (slug actuel : « ${fr.slug ?? ""} », statut : ${page.status}).`,
    `Titre SEO actuel : ${fr.seo_title ?? "(aucun)"}`,
    `Description actuelle : ${fr.seo_description ?? "(aucune)"}`,
    `\nContenu affiché (données) :\n${visible}`,
    `\nPages candidates pour les liens internes (identifiant | slug | titre) :\n${candidates.map((c) => `${c.pageId} | ${c.slug} | ${c.title}`).join("\n") || "(aucune)"}`,
  ].join("\n");
  const answer = await completeJson(ctx, Answer, [
    { role: "system", content: SEO_SYSTEM },
    { role: "user", content: prompt },
  ]);

  const known = new Map(candidates.map((c) => [c.pageId, c]));
  const links = answer.internal_links.flatMap((l) => {
    const target = known.get(l.target_page_id);
    return target
      ? [`- « ${l.anchor} » vers /${target.slug} (${l.reason})`]
      : [];
  });
  const slugParsed = answer.slug ? slugSchema.safeParse(answer.slug) : null;
  const summary = [
    answer.summary,
    links.length
      ? `Liens internes suggérés (à ajouter à la main si pertinents) :\n${links.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 950);

  const tool = createDraftTool({
    policy: DRAFT_POLICIES.seo,
    directus: ctx.directus,
    runId: ctx.run.id,
  });
  const result = await tool.execute({
    mode: "update_seo",
    approvalKind: "seo",
    summary,
    pageId: page.id,
    language: "fr-CA",
    seo_title: answer.seo_title,
    seo_description: answer.seo_description,
    ...(slugParsed?.success ? { slug: slugParsed.data } : {}),
  });
  ctx.event(
    "info",
    `proposition SEO enregistrée : version ${result.versionKey}, approbation ${result.approvalId}`,
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
  ctx.output.notes = result.notes.join(" ");
};
