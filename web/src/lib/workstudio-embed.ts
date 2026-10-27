/**
 * Bulle WorkStudio sur le site (S7) : validation des réglages et politique de sécurité du contenu (CSP).
 * Fonctions pures, sans accès réseau ni base : elles servent à l'API d'administration, au proxy et au composant.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Origine d'une instance WorkStudio : `https://hôte[:port]`, sans chemin, identifiant ni joker. `http` n'est
 * accepté que pour un hôte local (développement). Renvoie null si l'entrée est invalide.
 */
export function normalizeEmbedOrigin(input: string): string | null {
  const value = input.trim();
  if (value.length === 0 || value.length > 200 || value.includes("*"))
    return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (!/^https?:$/.test(url.protocol)) return null;
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) return null;
  return url.origin;
}

/** Chemin du site (sans langue) : `/agents`, `/solutions/courriels`. Pas de requête ni de joker. */
export function normalizeEmbedPage(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/\/+$/, "");
  if (value === "") return "/";
  return /^\/[a-z0-9][a-z0-9/-]{0,80}$/.test(value) && !value.includes("//")
    ? value
    : null;
}

/** Identifiant du chat public d'un agent WorkStudio (minuscules, chiffres, tirets). */
export const isChatIdentifier = (v: string) =>
  /^[a-z0-9][a-z0-9-]{0,80}$/.test(v);

export const isHexColor = (v: string) =>
  /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);

/** Retire le préfixe de langue (`/en`) d'un chemin public. */
export function stripLangPrefix(pathname: string): string {
  const stripped = pathname.replace(/^\/en(?=\/|$)/, "");
  const clean = stripped.replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

/** La bulle s'affiche-t-elle sur ce chemin (avec ou sans préfixe de langue) ? */
export function embedAppliesTo(
  pages: readonly string[],
  pathname: string,
): boolean {
  return pages.includes(stripLangPrefix(pathname));
}

/**
 * Politique de sécurité du contenu d'une page qui accueille la bulle. Elle n'ouvre QUE l'origine configurée
 * (script, cadre, connexions), n'ajoute aucun joker et interdit les objets et la base d'URL étrangère. Le site ne
 * déclare pas de politique ailleurs : sans bulle, aucun en-tête n'est ajouté.
 * `'unsafe-inline'` reste nécessaire aux scripts de démarrage de Next.js (aucun nonce avec les pages statiques) ;
 * `'unsafe-eval'` n'est ajouté qu'en développement (rechargement à chaud).
 */
export function embedCsp(
  origin: string,
  options: { dev?: boolean } = {},
): string {
  const dev = options.dev === true;
  return [
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} ${origin}`,
    `frame-src ${origin}`,
    `connect-src 'self' ${origin}${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

export interface EmbedScriptConfig {
  origin: string;
  chatIdentifier: string;
  position: "right" | "left";
  color: string | null;
}

/** Attributs `data-*` de la balise `<script src="…/embed.js">` (voir le guide d'intégration de WorkStudio). */
export function embedScriptAttributes(
  config: EmbedScriptConfig,
  label: string,
): Record<string, string> {
  return {
    "data-nexora-chat": config.chatIdentifier,
    "data-position": config.position,
    "data-label": label,
    ...(config.color && isHexColor(config.color)
      ? { "data-color": config.color }
      : {}),
  };
}
