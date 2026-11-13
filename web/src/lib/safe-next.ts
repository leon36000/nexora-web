/**
 * Retour après connexion : seule une page de reprise contrôlée peut être demandée dans `?next=` :
 * - la page d'autorisation d'un appareil Nexora Code (`/code/device`, avec ou sans `user_code`, en
 *   français ou en anglais) ;
 * - l'autorisation OIDC d'un client natif de bureau (`/oauth/authorize?...`), dont la query est
 *   revalidée champ par champ (`client_id`, `redirect_uri`, `scope`, PKCE S256, `state`, `nonce`).
 * Tout le reste est refusé (jamais de redirection ouverte).
 */
const DEVICE_CODE = /^(?:\/en)?\/code\/device(?:\?user_code=[A-Za-z0-9%-]{1,40})?$/;
const OAUTH_AUTHORIZE = /^\/oauth\/authorize\?[A-Za-z0-9._~%=&+-]+$/;

const NATIVE_CLIENTS = ["lifecode-desktop", "creative-studio-desktop"];
const OAUTH_PARAMS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "code_challenge",
  "code_challenge_method",
  "state",
  "nonce",
] as const;

/** `redirect_uri` d'un client natif : boucle locale en `http://`, port explicite, chemin `/callback`. */
function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    const port = Number(url.port);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1" ||
        url.hostname === "[::1]") &&
      /^\d+$/.test(url.port) &&
      port >= 1024 &&
      port <= 65535 &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.search === "" &&
      url.pathname.startsWith("/callback")
    );
  } catch {
    return false;
  }
}

/** `/oauth/authorize?...` : la query est revalidée ; une valeur douteuse annule la reprise. */
function safeOAuthAuthorize(value: string): string | null {
  if (!OAUTH_AUTHORIZE.test(value)) return null;
  const params = new URLSearchParams(value.slice("/oauth/authorize?".length));
  for (const name of params.keys())
    if (!(OAUTH_PARAMS as readonly string[]).includes(name)) return null;
  for (const name of OAUTH_PARAMS) if (params.getAll(name).length > 1) return null;

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  if (!NATIVE_CLIENTS.includes(clientId)) return null;
  if (!isLoopbackRedirectUri(redirectUri)) return null;
  if (params.get("response_type") !== "code") return null;
  if (params.get("code_challenge_method") !== "S256") return null;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) return null;
  if (!(params.get("scope") ?? "").split(/\s+/).includes("device:grant"))
    return null;
  return value;
}

export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length > 1200) return null;
  if (DEVICE_CODE.test(value)) return value;
  return safeOAuthAuthorize(value);
}
