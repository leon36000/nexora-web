import { and, codeWorkspaces, eq } from "@nexora/db";
import { errorJson } from "./http";
import {
  dedicatedOrigin,
  parseDedicatedHost,
  signToken,
  verifyToken,
} from "./ticket";
import {
  handleWorkspaceProxy,
  type ProxyDeps,
  type ProxySession,
} from "./workspace-proxy";

/**
 * Origine dédiée de l'interface web de l'environnement : `https://<proxy_id>.<NEXORA_CODE_HOST_SUFFIX>/…`.
 *
 * Pourquoi : un script servi par l'environnement ne doit jamais s'exécuter dans l'origine du site (il agirait avec la
 * session de la personne). Sur un hôte à part, le cookie de session du site n'est pas envoyé : l'accès passe par un
 * billet d'entrée de 60 s signé par le site (`/api/account/code/open`, session ouverte) puis par un cookie de session de
 * 8 h propre à cet hôte (`nxc_ws`, HttpOnly, sans `Domain`). Chaque requête revérifie l'environnement, son propriétaire,
 * le courriel vérifié et la 2FA du personnel, comme le mandataire sous `/code/ws`.
 */

export const DEDICATED_COOKIE = "nxc_ws";
export const ENTER_TTL_SECONDS = 60;
export const SESSION_TTL_SECONDS = 8 * 3600;
const ENTER_PATH = "/_nexora/enter";

function cookieOf(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name)
      return part.slice(i + 1).trim();
  }
  return null;
}

const denied = () =>
  errorJson(
    403,
    "invalid_ticket",
    "Lien d'ouverture invalide ou expiré. Rouvrez Nexora Code depuis votre compte.",
  );

/** Billet d'entrée vers l'origine dédiée d'un environnement (appelé par `/api/account/code/open`). */
export function enterUrl(
  deps: Pick<ProxyDeps, "siteUrl" | "now" | "dedicated">,
  proxyId: string,
  userId: string,
): string | null {
  if (!deps.dedicated) return null;
  const ticket = signToken(
    deps.dedicated.secret,
    { k: "enter", pid: proxyId, uid: userId },
    ENTER_TTL_SECONDS,
    deps.now(),
  );
  return `${dedicatedOrigin(deps.siteUrl, deps.dedicated.suffix, proxyId)}${ENTER_PATH}?t=${encodeURIComponent(ticket)}`;
}

/**
 * Requête reçue sur l'hôte dédié (réécrite vers `/code/ws/<id>/…` par `next.config.ts`). `null` si l'hôte n'est pas un
 * hôte dédié valide de cette installation (l'appelant répond alors 404).
 */
export async function handleDedicatedProxy(
  request: Request,
  params: { id: string; path?: string[] },
  deps: ProxyDeps,
): Promise<Response | null> {
  const dedicated = deps.dedicated;
  if (!dedicated) return null;
  const pid = parseDedicatedHost(request.headers.get("host"), dedicated.suffix);
  if (!pid || pid !== params.id) return null;
  const origin = dedicatedOrigin(deps.siteUrl, dedicated.suffix, pid);
  const url = new URL(request.url);
  const rest = `/${(params.path ?? []).map(encodeURIComponent).join("/")}`;

  if (rest === ENTER_PATH) {
    if (request.method !== "GET") return denied();
    const claims = verifyToken(
      dedicated.secret,
      url.searchParams.get("t") ?? "",
      "enter",
      deps.now(),
    );
    if (!claims || claims.pid !== pid) return denied();
    const session = signToken(
      dedicated.secret,
      { k: "session", pid, uid: claims.uid },
      SESSION_TTL_SECONDS,
      deps.now(),
    );
    const secure = origin.startsWith("https://") ? "; Secure" : "";
    return new Response(null, {
      status: 302,
      headers: {
        location: "/",
        "set-cookie": `${DEDICATED_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }

  // Identité : le cookie propre à cet hôte, jamais la session du site.
  const getContext = async (): Promise<ProxySession | null> => {
    const token = cookieOf(request, DEDICATED_COOKIE);
    if (!token) return null;
    const claims = verifyToken(dedicated.secret, token, "session", deps.now());
    if (!claims || claims.pid !== pid) return null;
    const [row] = await deps
      .db()
      .select({ organizationId: codeWorkspaces.organizationId })
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.proxyId, pid));
    const user = await dedicated.loadUser(claims.uid);
    if (!row || !user) return null;
    return { userId: claims.uid, organizationId: row.organizationId, ...user };
  };

  return handleWorkspaceProxy(
    request,
    pid,
    {
      ...deps,
      getContext,
      // L'origine attendue des écritures est celle de l'hôte dédié ; les pages y sont admises (origine isolée).
      siteUrl: origin,
      allowSameOriginUi: true,
    },
    { dedicatedPath: rest },
  );
}

/**
 * `GET /api/account/code/open` : adresse d'ouverture de l'interface web (celle que le panneau montre). Session du site
 * obligatoire ; si la personne a un environnement en marche, elle est renvoyée (302) vers son hôte dédié avec un billet
 * d'entrée de 60 s. Aucune écriture : une navigation `GET` suffit, sans contrôle d'origine.
 */
export async function handleCodeOpen(
  request: Request,
  deps: ProxyDeps,
): Promise<Response> {
  if (request.method !== "GET")
    return errorJson(405, "method_not_allowed", "Méthode non permise.", {
      allow: "GET",
    });
  if (!deps.dedicated)
    return errorJson(404, "not_found", "Environnement introuvable.");
  try {
    const session = await deps.getContext(request.headers);
    if (!session)
      return errorJson(
        401,
        "unauthenticated",
        "Connectez-vous pour continuer.",
      );
    if (
      !session.emailVerified ||
      (session.isStaff && !session.twoFactorEnabled)
    )
      return errorJson(403, "forbidden", "Accès refusé.");
    const [row] = await deps
      .db()
      .select({
        proxyId: codeWorkspaces.proxyId,
        desiredStatus: codeWorkspaces.desiredStatus,
      })
      .from(codeWorkspaces)
      .where(
        and(
          eq(codeWorkspaces.organizationId, session.organizationId),
          eq(codeWorkspaces.userId, session.userId),
        ),
      );
    if (!row) return errorJson(404, "not_found", "Environnement introuvable.");
    if (row.desiredStatus !== "running")
      return errorJson(
        409,
        "workspace_stopped",
        "Votre environnement est arrêté. Démarrez-le depuis votre compte (Nexora Code).",
      );
    const location = enterUrl(deps, row.proxyId, session.userId);
    if (!location)
      return errorJson(404, "not_found", "Environnement introuvable.");
    return new Response(null, {
      status: 302,
      headers: {
        location,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    deps.log.error("ouverture Nexora Code : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return errorJson(500, "internal_error", "Erreur interne.");
  }
}
