import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { SIGNAL_MARK } from "@/components/brand/logo";
import { fieldPoints } from "@/components/signal/terrain";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { BRAND } from "@/lib/brand";
import { OG_SIZE } from "@/lib/seo/og";
import { ogSafeTitle, resolveOgTarget, stripBrand } from "@/lib/seo/og-target";
import { getPublicAgents } from "@/server/agents/read";
import { getPage } from "@/server/cms/read";
import { getPublicCatalog } from "@/server/gateway/read";
import { getPublicVps } from "@/server/vps/read";

/**
 * Image Open Graph (1200 × 630) d'une page PUBLIÉE ou d'une route connue : `/og/fr`, `/og/en/opsys-ai`,
 * `/og/fr/modeles/nexora/glm-5-3`. Le titre vient de la page elle-même ; l'adresse ne peut pas injecter de texte.
 * Page inconnue ou non publiée : 404 (aucune image générique qui se ferait passer pour une page).
 * Couleurs : jetons de globals.css (abysse, givre, brume, ion, flare) ; polices : instantanés WOFF locaux (src/fonts/og).
 * Décor (identité « Signal ») : un champ de lumière en perspective sous la ligne d'horizon, une grille de précision.
 */
const ABYSS = "#14171a";
const FROST = "#f4f6f7";
const HAZE = "#9aa4af";
const ION = "#ff6600";
const LINE = "#343a40";
const FLARE = "#ffffff";

/** Champ de lumière figé, en trois couches d'opacité (satori ne connaît pas l'opacité par point). */
const OG_FIELD = (() => {
  const tiers = ["", "", ""];
  for (const [x, y, size, a] of fieldPoints({
    w: 1200,
    h: 630,
    cols: 120,
    horizon: 0.5,
    relief: 0.16,
  })) {
    const k = a > 0.55 ? 2 : a > 0.25 ? 1 : 0;
    const d = Math.max(1.2, size * 1.4).toFixed(1);
    tiers[k] += `M${x.toFixed(1)} ${y.toFixed(1)}h${d}v${d}h-${d}z`;
  }
  return tiers;
})();

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
  const rawTitle = await titleOf(lang, slug);
  if (!rawTitle) return new Response("Not found", { status: 404 });
  const title = ogSafeTitle(rawTitle) || BRAND.name;

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
        background: ABYSS,
        padding: "64px 72px",
        position: "relative",
        fontFamily: fonts ? "Inter" : "sans-serif",
      }}
    >
      {/* Champ de lumière : décor pur, rendu en PNG par satori (jamais du texte). */}
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: dessin rendu en PNG par satori, jamais dans le DOM */}
      <svg
        width={1200}
        height={630}
        viewBox="0 0 1200 630"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        {[96, 192, 288, 384, 480, 576].map((y) => (
          <path key={y} d={`M0 ${y}H1200`} stroke={LINE} strokeWidth={1} />
        ))}
        <path
          d="M0 315H1200"
          stroke={ION}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        {OG_FIELD.map((d, k) => (
          <path
            key={`t${String(k)}`}
            d={d}
            fill={ION}
            fillOpacity={[0.18, 0.45, 0.85][k]}
          />
        ))}
        <circle cx={880} cy={402} r={5} fill={FLARE} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          backgroundImage:
            "linear-gradient(90deg, rgba(20,23,26,0.95) 0%, rgba(20,23,26,0.8) 48%, rgba(20,23,26,0) 85%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* biome-ignore lint/a11y/noSvgWithoutTitle: dessin rendu en PNG par satori, jamais dans le DOM */}
        <svg width={52} height={52} viewBox={SIGNAL_MARK.viewBox}>
          <path
            d={SIGNAL_MARK.brackets}
            fill="none"
            stroke={FROST}
            strokeWidth={2.25}
          />
          <path
            d={SIGNAL_MARK.scan}
            stroke={ION}
            strokeWidth={2.25}
            strokeOpacity={0.6}
          />
          <circle
            cx={SIGNAL_MARK.point.cx}
            cy={SIGNAL_MARK.point.cy}
            r={SIGNAL_MARK.point.r}
            fill={ION}
          />
        </svg>
        <div
          style={{
            display: "flex",
            fontFamily: fonts ? "Geist" : "sans-serif",
            fontWeight: 500,
            fontSize: 38,
            letterSpacing: -1,
            color: FROST,
          }}
        >
          {BRAND.name}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontFamily: fonts ? "Geist" : "sans-serif",
          fontWeight: 500,
          fontSize: size,
          lineHeight: 1.08,
          color: FROST,
          maxWidth: 900,
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
          width: 700,
          color: HAZE,
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
