/**
 * Interface entre le panneau « Mes outils » et l'environnement Nexora Code hébergé (chantier C : dépôt `NexoraCode` et
 * pilote d'approvisionnement, décision 10 de la conception du 30/10/2026). Un environnement PAR PERSONNE, dans un
 * conteneur isolé sur nos serveurs, dont le volume compte dans le quota (`recordStorageUsage(orgId, "code", …)`).
 * Le panneau ne connaît que cette interface ; il est testé avec un faux (`test-support.ts`). Contrat complet :
 * `docs/panneau-mes-outils.md`.
 */

/** `stopped` : arrêté ; `starting` : en démarrage ; `ready` : prêt (adresse d'ouverture connue) ; `error` : échec du démarrage. */
export type CodeWorkspaceStatus = "stopped" | "starting" | "ready" | "error";

export interface CodeWorkspaceState {
  status: CodeWorkspaceStatus;
  /** Volume occupé par l'environnement de la personne, en octets. */
  usedBytes: number;
  /** Adresse d'ouverture (https, ou http sur la machine locale en développement) ; null tant que l'environnement n'est pas prêt. */
  openUrl: string | null;
}

export type CodeStartFailure = "quota_exceeded" | "unavailable";

export interface CodeCliInfo {
  /** Commande qui installe le CLI sur le poste ; null tant que la sortie n'est pas publiée. */
  installCommand: string | null;
  /** Commande de connexion au compte Nexora. */
  loginCommand: string;
}

export interface CodeWorkspaceService {
  /** État de l'environnement de CETTE personne dans CETTE organisation. */
  getState(input: { orgId: string; userId: string }): Promise<CodeWorkspaceState>;
  /** Démarre l'environnement (le crée au premier appel). Refuse si l'espace de l'offre manque. */
  start(input: { orgId: string; userId: string }): Promise<
    | { ok: true; state: CodeWorkspaceState }
    | { ok: false; reason: CodeStartFailure }
  >;
  cli(): CodeCliInfo;
}

/** Adresse d'ouverture sûre : https, ou http vers la machine locale (développement) ; sans identifiants. */
export function safeOpenUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "https:" || (url.protocol === "http:" && local))
    return url.href;
  return null;
}

/**
 * Normalise l'état rendu par le service avant de l'afficher : « prêt » exige une adresse d'ouverture sûre, sinon
 * l'environnement est encore « en démarrage » (on ne montre jamais un bouton qui ne mène nulle part).
 */
export function normalizeWorkspace(state: CodeWorkspaceState): CodeWorkspaceState {
  const openUrl = safeOpenUrl(state.openUrl);
  const usedBytes =
    Number.isFinite(state.usedBytes) && state.usedBytes > 0
      ? state.usedBytes
      : 0;
  if (state.status === "ready" && !openUrl)
    return { status: "starting", usedBytes, openUrl: null };
  return {
    status: state.status,
    usedBytes,
    openUrl: state.status === "ready" ? openUrl : null,
  };
}

export type CodePanelModel =
  | { kind: "soon" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "ready"; workspace: CodeWorkspaceState; cli: CodeCliInfo };

/** État de la page Nexora Code (mêmes règles que `loadRagPanel`). */
export async function loadCodeWorkspacePanel(input: {
  enabled: boolean;
  service: CodeWorkspaceService | null;
  orgId: string;
  userId: string;
}): Promise<CodePanelModel> {
  if (!input.enabled) return { kind: "soon" };
  if (!input.service) return { kind: "unavailable" };
  try {
    const state = await input.service.getState({
      orgId: input.orgId,
      userId: input.userId,
    });
    return {
      kind: "ready",
      workspace: normalizeWorkspace(state),
      cli: input.service.cli(),
    };
  } catch {
    return { kind: "error" };
  }
}
