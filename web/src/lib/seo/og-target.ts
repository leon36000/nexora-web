import { normalizeSlug } from "@/lib/safe-href";
import { type AppRoute, availableAppRoutes } from "./app-routes";

export type OgTarget =
  | { kind: "home" }
  | { kind: "app"; route: AppRoute }
  | { kind: "model"; id: string }
  | { kind: "vps"; code: string }
  | { kind: "agent"; slug: string }
  | { kind: "page"; slug: string };

/** Mêmes formes que les pages `/vps/[application]` et `/agents/[slug]`. */
const VPS_CODE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const AGENT_SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/;

/**
 * Quelle page l'image doit-elle représenter ? L'adresse désigne UNE page publiée ou une route connue ; le texte de
 * l'image vient d'elle (titre), jamais de l'adresse : aucune image-injection possible.
 */
export function resolveOgTarget(
  segments: readonly string[] | undefined,
  routes: readonly AppRoute[] = availableAppRoutes(),
): OgTarget | null {
  const segs = (segments ?? []).filter((s) => s !== "");
  if (segs.length === 0) return { kind: "home" };
  const path = `/${segs.join("/")}`;
  const route = routes.find((r) => r.path === path);
  if (route) return { kind: "app", route };
  if (segs[0] === "modeles" && segs.length > 1) {
    const id = segs.slice(1).map(decodeURIComponent).join("/");
    return MODEL_ID.test(id) ? { kind: "model", id } : null;
  }
  // Fiches de l'application : leur titre vient du catalogue VPS / des agents publiés, jamais de l'adresse.
  if (segs[0] === "vps") {
    const code = segs[1] ?? "";
    return segs.length === 2 && VPS_CODE.test(code)
      ? { kind: "vps", code }
      : null;
  }
  if (segs[0] === "agents") {
    const slug = segs[1] ?? "";
    return segs.length === 2 && AGENT_SLUG.test(slug)
      ? { kind: "agent", slug }
      : null;
  }
  const slug = normalizeSlug([...segs]);
  return slug === null || slug === "" ? null : { kind: "page", slug };
}

/**
 * Titre sans emoji. Le moteur d'images (satori) va chercher chaque emoji sur un CDN tiers (jsdelivr) : flux sortant
 * non déclaré, adresse du serveur divulguée, image cassée si la sortie est filtrée. Le texte ne garde que des lettres,
 * chiffres et ponctuation.
 */
export function ogSafeTitle(title: string): string {
  return title
    .replace(
      /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Retire le suffixe de marque des titres de métadonnées (« Modèles | Nexora » -> « Modèles »). */
export function stripBrand(title: string, siteName: string): string {
  return title.replace(new RegExp(`\\s*[|—-]\\s*${siteName}$`), "").trim();
}
