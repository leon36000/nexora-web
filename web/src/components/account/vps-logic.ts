import type { VpsStep } from "@nexora/db";
import type { Lang } from "@/i18n/config";
import type { AccountVpsInstance, AccountVpsOrder } from "@/server/vps/account";

/**
 * Règles pures de l'espace « Mes VPS » : accès SSH, libellé d'état, progression, visibilité des
 * actions, rafraîchissement. Aucune dépendance au navigateur : tout est testé sans rendu.
 */

type Role = "owner" | "member";
type Status = AccountVpsInstance["status"];

// ─── Accès SSH ──────────────────────────────────────────────────────────────────

/** Fichier d'accès écrit sur la VM à l'installation (mots de passe et jetons générés). */
export const ACCESS_FILE = "~/nexora-acces.txt";

const SSH_USER = /^[a-z_][a-z0-9_-]{0,31}$/;
const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

const validTarget = (user: string, ip: string) =>
  SSH_USER.test(user) && IPV4.test(ip);

/** `ssh <utilisateur>@<ip>`, ou null si l'un des deux n'a pas la forme attendue (rien n'est affiché). */
export function sshCommand(user: string, ip: string | null): string | null {
  if (!ip || !validTarget(user, ip)) return null;
  return `ssh ${user}@${ip}`;
}

/** Tunnel vers une application qui écoute sur 127.0.0.1 de la VM : même numéro de port des deux côtés. */
export function tunnelCommand(
  user: string,
  ip: string | null,
  port: number,
): string | null {
  if (!ip || !validTarget(user, ip)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  return `ssh -N -L ${port}:127.0.0.1:${port} ${user}@${ip}`;
}

/** Modèle de tunnel quand l'application ne déclare aucun port : le client remplace `<port>`. */
export function genericTunnelCommand(user: string, ip: string | null) {
  if (!ip || !validTarget(user, ip)) return null;
  return `ssh -N -L <port>:127.0.0.1:<port> ${user}@${ip}`;
}

/** Ports d'application joignables par tunnel (pas ceux que le pare-feu ouvre), triés. */
export function tunnelPorts(instance: Pick<AccountVpsInstance, "ports">) {
  return instance.ports
    .filter((p) => p.exposure === "tunnel" && p.proto === "tcp")
    .sort((a, b) => a.port - b.port);
}

// ─── État et progression ────────────────────────────────────────────────────────

export type StateKey =
  | "provisioning"
  | "reinstalling"
  | "running"
  | "stopped"
  | "active"
  | "starting"
  | "stopping"
  | "rebooting"
  | "suspended"
  | "canceled"
  | "failed"
  | "deleted";

type Stateful = Pick<AccountVpsInstance, "status" | "power" | "pendingAction">;

/** Libellé d'état d'un VPS : le statut, précisé par l'alimentation et l'action en attente quand il est actif. */
export function stateKey(i: Stateful): StateKey {
  switch (i.status) {
    case "active":
      if (i.pendingAction === "start") return "starting";
      if (i.pendingAction === "stop") return "stopping";
      if (i.pendingAction === "reboot") return "rebooting";
      if (i.power === "running") return "running";
      if (i.power === "stopped") return "stopped";
      return "active";
    case "provisioning":
    case "reinstalling":
    case "suspended":
    case "canceled":
    case "failed":
    case "deleted":
      return i.status;
  }
}

/** Couleur du badge : jamais seule, le libellé est toujours écrit à côté. */
export function stateTone(key: StateKey): "success" | "accent" | "muted" {
  switch (key) {
    case "running":
      return "success";
    case "provisioning":
    case "reinstalling":
    case "starting":
    case "stopping":
    case "rebooting":
    case "suspended":
    case "failed":
      return "accent";
    default:
      return "muted";
  }
}

/** Étapes affichées à l'écran (le provisionnement en compte dix, dont deux invisibles pour le client). */
export const PROGRESS_STEPS = [
  "placement",
  "clone",
  "configure",
  "firewall",
  "start",
  "await_agent",
  "install",
  "verify",
] as const;
export type ProgressStep = (typeof PROGRESS_STEPS)[number];

export interface Progress {
  /** Rang (de 0) de l'étape en cours ; égal à `total` quand tout est terminé. */
  index: number;
  total: number;
  percent: number;
  done: boolean;
}

/** Étape du moteur -> progression. `snapshot` (réinstallation) précède le clonage : elle compte comme la préparation. */
export function stepProgress(step: VpsStep): Progress {
  const total = PROGRESS_STEPS.length;
  if (step === "done") return { index: total, total, percent: 100, done: true };
  const index =
    step === "snapshot"
      ? 0
      : Math.max(0, PROGRESS_STEPS.indexOf(step as ProgressStep));
  return {
    index,
    total,
    percent: Math.round((index / total) * 100),
    done: false,
  };
}

/** État d'une étape de la liste, d'après l'étape en cours. */
export function stageState(
  stage: ProgressStep,
  step: VpsStep,
): "done" | "current" | "todo" {
  const { index } = stepProgress(step);
  const at = PROGRESS_STEPS.indexOf(stage);
  return at < index ? "done" : at === index ? "current" : "todo";
}

// ─── Actions ────────────────────────────────────────────────────────────────────

const VPS_ACTIONS = ["start", "stop", "reboot", "reinstall", "cancel"] as const;
export type VpsAction = (typeof VPS_ACTIONS)[number];

export interface ActionState {
  visible: boolean;
  enabled: boolean;
}

/**
 * Qui voit et peut faire quoi. Démarrer, arrêter et redémarrer : tout membre, sur un VPS actif
 * (désactivés mais visibles quand il est suspendu). Réinstaller et résilier : le propriétaire
 * seulement, les boutons ne sont même pas rendus pour un membre. Le serveur refait chaque contrôle.
 */
export function actionStates(input: {
  role: Role;
  status: Status;
  power: AccountVpsInstance["power"];
  pendingAction: string | null;
  cancelAtPeriodEnd: boolean;
}): Record<VpsAction, ActionState> {
  const { role, status, power, pendingAction, cancelAtPeriodEnd } = input;
  const owner = role === "owner";
  const active = status === "active";
  const idle = active && !pendingAction;
  const live = status === "active" || status === "suspended";
  return {
    start: { visible: live, enabled: idle && power !== "running" },
    stop: { visible: live, enabled: idle && power !== "stopped" },
    // Redémarrer une VM arrêtée échoue côté moteur : le bouton reste grisé.
    reboot: { visible: live, enabled: idle && power !== "stopped" },
    reinstall: { visible: owner && live, enabled: idle },
    cancel: { visible: owner && live && !cancelAtPeriodEnd, enabled: live },
  };
}

// ─── Rafraîchissement ───────────────────────────────────────────────────────────

/** Intervalle d'actualisation tant qu'une opération est en cours. */
export const REFRESH_MS = 5000;

const IN_FLIGHT_ORDERS: readonly AccountVpsOrder["status"][] = [
  "paid",
  "provisioning",
];

/**
 * Faut-il actualiser la page ? Un VPS en préparation ou en réinstallation, une action en attente,
 * une commande payée dont l'instance n'existe pas encore, ou un retour de paiement
 * (`?commande=ok`) dont le webhook n'a pas encore marqué la commande.
 */
export function needsRefresh(input: {
  instances: Pick<AccountVpsInstance, "status" | "pendingAction">[];
  orders: Pick<AccountVpsOrder, "status">[];
  justOrdered: boolean;
}): boolean {
  const { instances, orders, justOrdered } = input;
  if (
    instances.some(
      (i) =>
        i.status === "provisioning" ||
        i.status === "reinstalling" ||
        (i.pendingAction !== null &&
          (i.status === "active" || i.status === "suspended")),
    )
  )
    return true;
  if (orders.some((o) => IN_FLIGHT_ORDERS.includes(o.status))) return true;
  return justOrdered && orders.some((o) => o.status === "awaiting_payment");
}

export interface StateChange {
  id: string;
  hostname: string;
  state: StateKey;
}

/** Instances dont l'état affiché a changé depuis le dernier rendu (annoncé par `aria-live`). */
export function stateChanges(
  previous: ReadonlyMap<string, StateKey>,
  instances: readonly (Stateful & { id: string; hostname: string })[],
): StateChange[] {
  const out: StateChange[] = [];
  for (const i of instances) {
    const state = stateKey(i);
    const before = previous.get(i.id);
    if (before !== undefined && before !== state)
      out.push({ id: i.id, hostname: i.hostname, state });
  }
  return out;
}

// ─── Présentation ───────────────────────────────────────────────────────────────

const locale = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

/** Mémoire vive en Go (1 décimale au plus) à partir de Mo. */
export function formatRamGb(lang: Lang, ramMb: number): string {
  return new Intl.NumberFormat(locale(lang), {
    maximumFractionDigits: 1,
  }).format(ramMb / 1024);
}

/** Date et heure locales du Québec, pour le journal. */
export function formatDateTime(lang: Lang, date: Date): string {
  return new Intl.DateTimeFormat(locale(lang), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Toronto",
  }).format(date);
}

/** Identifiant de requête (clé d'idempotence côté serveur) ; repli hors contexte sécurisé. */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
