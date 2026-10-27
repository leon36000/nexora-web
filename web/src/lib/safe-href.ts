/**
 * Liens et slugs provenant du CMS : tout est traité comme une entrée non fiable.
 *
 * - `safeHref` ne laisse passer que les chemins du site, les ancres, http(s), mailto et tel.
 *   Les schémas dangereux (javascript:, data:, vbscript:, file:), les URL relatives au
 *   protocole (`//hôte`) et les astuces d'espaces ou de contrôles (`java\tscript:`) sont refusés.
 * - `normalizeSlug` refuse tout segment qui n'est pas en minuscules, chiffres et tirets.
 */

/** Contrôles, espaces (y compris insécables et séparateurs de ligne) : jamais dans une URL. */
function hasForbiddenChar(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || (c >= 0x7f && c <= 0xa0) || c === 0x2028 || c === 0x2029)
      return true;
  }
  return false;
}

/** `/x/` -> `/x` ; `/x/?a=1#b` -> `/x?a=1#b` ; `/` reste `/`. */
function stripTrailingSlash(path: string): string {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return `${clean === "" ? "/" : clean}${rest}`;
}

export function safeHref(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (href === "") return null;
  if (hasForbiddenChar(href)) return null;

  if (href.startsWith("#")) return href;
  if (href.startsWith("/")) {
    if (href.startsWith("//") || href.includes("\\")) return null;
    return stripTrailingSlash(href);
  }
  if (href.includes("\\")) return null;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  switch (url.protocol) {
    case "http:":
    case "https:":
      return url.hostname === "" ? null : url.href;
    case "mailto:":
    case "tel:":
      return href;
    default:
      return null;
  }
}

/** Lien qui quitte le site (à ouvrir avec `rel="noopener noreferrer"`). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Segments d'URL -> slug Directus (`""` pour l'accueil). `null` si un segment n'est pas propre :
 * la page est alors un 404 sans même interroger le CMS.
 */
export function normalizeSlug(
  segments: readonly string[] | undefined,
): string | null {
  if (!segments || segments.length === 0) return "";
  for (const s of segments) if (!SLUG_SEGMENT.test(s)) return null;
  return segments.join("/");
}
