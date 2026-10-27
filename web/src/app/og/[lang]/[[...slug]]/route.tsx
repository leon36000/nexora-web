import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { LOGO } from "@/components/brand/logo-geometry";
import { mosaicLayers } from "@/components/brand/mosaic";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { OG_SIZE } from "@/lib/seo/og";
import { resolveOgTarget, stripBrand } from "@/lib/seo/og-target";
import { getPublicAgents } from "@/server/agents/read";
import { getPage } from "@/server/cms/read";
import { getPublicCatalog } from "@/server/gateway/read";
import { getPublicVps } from "@/server/vps/read";

/**
 * Image Open Graph (1200 × 630) d'une page PUBLIÉE ou d'une route connue : `/og/fr`, `/og/en/opsys-ai`,
 * `/og/fr/modeles/nexora/glm-5-3`. Le titre vient de la page elle-même ; l'adresse ne peut pas injecter de texte.
 * Page inconnue ou non publiée : 404 (aucune image générique qui se ferait passer pour une page).
 * Couleurs : jetons de globals.css (ink-950, bone, ember-400, ember-500) ; polices : instantanés WOFF locaux (src/fonts/og).
 * Décor : la mosaïque braise (la même que sur le site) qui se dissout vers la gauche, hors de la zone du titre.
 */
const INK = "#0a0a0e";
const BONE = "#f5f4ef";
const MIST = "#a8a8b6";
const EMBER = "#ff7a45";
const LINE = "#2b2b38";
const EMBER_FILL = "#ff5a1f";

/** 40 × 21 cellules de 30 px : la mosaïque couvre l'image, sans toucher la colonne du titre (colonnes 0 à 26). */
const OG_LAYERS = mosaicLayers({
  cols: 40,
  rows: 21,
  seed: 11,
  toward: "right",
  fade: 1,
  palette: "braise",
  gap: 0.08,
  keep: (c) => c.col >= 27,
});

async function loadFonts() {
  const dir = join(process.cwd(), "src", "fonts", "og");
  try {
    const [geist, inter] = await Promise.all([
      readFile(join(dir, "geist-latin-500-normal.woff")),
      readFile(join(dir, "inter-latin-400-normal.woff")),
    ]);
    return [
      {
        name: "Geist",
        data: geist,
        weight: 500 as const,
        style: "normal" as const,
      },
      {
        name: "Inter",
        data: inter,
        weight: 400 as const,
        style: "normal" as const,
      },
    ];
  } catch {
    return undefined; // police par défaut de next/og : l'image reste servie
  }
}

async function titleOf(
  lang: "fr" | "en",
  segments: string[] | undefined,
): Promise<string | null> {
  const dict = getDictionary(lang);
  const target = resolveOgTarget(segments);
  if (!target) return null;
  if (target.kind === "home") {
    const home = await getPage(lang, "");
    return home.status === "ok" ? home.page.title : dict.meta.siteName;
  }
  if (target.kind === "app") {
    const meta = target.route.meta(lang);
    return meta
      ? stripBrand(meta.title, dict.meta.siteName)
      : dict.meta.siteName;
  }
  if (target.kind === "model") {
    const catalog = await getPublicCatalog();
    return catalog.models.find((m) => m.id === target.id)?.name ?? null;
  }
  if (target.kind === "vps") {
    const vps = await getPublicVps();
    return vps.apps.find((a) => a.code === target.code)?.name ?? null;
  }
  if (target.kind === "agent") {
    const { agents } = await getPublicAgents();
    const agent = agents.find((a) => a.slug === target.slug);
    return agent ? (lang === "fr" ? agent.nameFr : agent.nameEn) : null;
  }
  const result = await getPage(lang, target.slug);
  return result.status === "ok" && result.preview === null
    ? result.page.title
    : null;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ lang: string; slug?: string[] }> },
) {
  await connection();
  const { lang, slug } = await ctx.params;
  if (!isLang(lang)) return new Response("Not found", { status: 404 });
  const title = await titleOf(lang, slug);
  if (!title) return new Response("Not found", { status: 404 });

  const clipped = title.length > 110 ? `${title.slice(0, 107)}…` : title;
  const size = clipped.length > 70 ? 56 : clipped.length > 40 ? 68 : 84;
  const fonts = await loadFonts();

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        padding: "64px 72px",
        position: "relative",
        fontFamily: fonts ? "Inter" : "sans-serif",
      }}
    >
      {/* Mosaïque braise : décor pur, rendu en PNG par satori (jamais du texte, aucune police). */}
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: dessin rendu en PNG par satori, jamais dans le DOM */}
      <svg
        width={1200}
        height={630}
        viewBox="0 0 40 21"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {OG_LAYERS.map((layer) => (
          <path key={layer.tier} fill={layer.color} d={layer.d} />
        ))}
      </svg>
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: dessin rendu en PNG par satori, jamais dans le DOM */}
        <svg
          width={Math.round(56 * LOGO.lockupRatio)}
          height={56}
          viewBox={LOGO.lockupBox}
        >
          <path fill={BONE} d={LOGO.bars} />
          <path fill={EMBER_FILL} d={LOGO.passage} />
          <path fill={BONE} d={LOGO.nexora} />
          <path fill={EMBER} d={LOGO.ai} />
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: fonts ? "Geist" : "sans-serif",
          fontWeight: 500,
          fontSize: size,
          lineHeight: 1.08,
          color: BONE,
          maxWidth: 740,
        }}
      >
        {clipped}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderTop: `2px solid ${LINE}`,
          paddingTop: 24,
          color: MIST,
          fontSize: 28,
        }}
      >
        {lang === "fr" ? "fr-CA" : "en-CA"}
      </div>
    </div>,
    {
      ...OG_SIZE,
      ...(fonts ? { fonts } : {}),
      headers: {
        "cache-control":
          "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
