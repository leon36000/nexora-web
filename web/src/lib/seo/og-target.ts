import { normalizeSlug } from "@/lib/safe-href";
import { type AppRoute, availableAppRoutes } from "./app-routes";

export type OgTarget =
  | { kind: "home" }
  | { kind: "app"; route: AppRoute }
  | { kind: "model"; id: string }
  | { kind: "page"; slug: string };

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
  const slug = normalizeSlug([...segs]);
  return slug === null || slug === "" ? null : { kind: "page", slug };
}

/** Retire le suffixe de marque des titres de métadonnées (« Modèles | Nexora » -> « Modèles »). */
export function stripBrand(title: string, siteName: string): string {
  return title.replace(new RegExp(`\\s*[|—-]\\s*${siteName}$`), "").trim();
}
