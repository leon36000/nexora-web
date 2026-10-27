import {
  and,
  type Database,
  desc,
  eq,
  inArray,
  isNull,
  or,
  osTemplates,
  type Region,
  type SubscriptionStatus,
  subscriptions,
  type VpsInstanceStatus,
  type VpsOrderStatus,
  type VpsPowerState,
  type VpsStep,
  type VpsTerm,
  vpsEvents,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import { scrubString } from "@nexora/log";
import { getCatalogVersionById, type VpsCatalogSnapshot } from "@nexora/vps";

/**
 * Lecture des VPS d'UNE organisation pour l'espace client (`/compte/vps`). L'appelant a déjà
 * confronté l'organisation de la session aux adhésions ; cette fonction ne lit rien d'une autre.
 *
 * Ce qui sort d'ici est destiné au navigateur : aucun bail, aucun identifiant de VM ou de serveur
 * Proxmox, aucune clé SSH complète (seulement des empreintes), aucun courriel, aucun message
 * d'erreur technique. Les colonnes sont choisies une à une : une colonne ajoutée plus tard à
 * `vps_instances` ne devient jamais visible par accident.
 */

/** Nombre d'événements du journal rendus par VPS. */
export const ACCOUNT_VPS_EVENT_LIMIT = 15;
/** Les VPS supprimés ou en échec ne restent affichés que pendant ce délai. */
const RECENT_DAYS = 90;
const MAX_CLOSED = 5;
const MAX_ORDERS = 10;
/** Utilisateur cloud-init de repli quand le gabarit n'est plus lisible. */
export const DEFAULT_SSH_USER = "debian";

export interface AccountVpsEvent {
  id: string;
  kind: string;
  /** Message nettoyé ; vide pour les événements dont le texte d'origine est technique. */
  message: string;
  actor: string;
  createdAt: Date;
}

export interface AccountVpsPort {
  port: number;
  proto: "tcp" | "udp";
  /** `tunnel` : lié à 127.0.0.1 sur la VM, joignable par tunnel SSH ; `public` : ouvert au pare-feu. */
  exposure: "tunnel" | "public";
  labelFr: string;
  labelEn: string;
}

export interface AccountVpsInstance {
  id: string;
  status: VpsInstanceStatus;
  step: VpsStep;
  power: VpsPowerState;
  pendingAction: string | null;
  plan: {
    code: string;
    name: string;
    vcpu: number;
    ramMb: number;
    diskGb: number;
  };
  app: { code: string; name: string; version: string };
  ipv4: string | null;
  region: Region;
  hostname: string;
  sshUser: string;
  /** Empreinte de la clé publique SSH du client (jamais la clé elle-même). */
  sshKeyFingerprint: string;
  /** Empreinte de la clé d'hôte de la VM, quand l'installation l'a relevée. */
  hostKeyFingerprint: string | null;
  ports: AccountVpsPort[];
  createdAt: Date;
  activatedAt: Date | null;
  suspendedAt: Date | null;
  canceledAt: Date | null;
  retentionEndsAt: Date | null;
  deletedAt: Date | null;
  billing: {
    term: VpsTerm;
    priceCents: number;
    currency: string;
    /** Fin de la période en cours de l'abonnement Stripe (prochaine échéance). */
    nextDueAt: Date | null;
    cancelAtPeriodEnd: boolean;
    subscriptionStatus: SubscriptionStatus | null;
  };
  events: AccountVpsEvent[];
}

export interface AccountVpsOrder {
  id: string;
  status: VpsOrderStatus;
  planCode: string;
  planName: string;
  appCode: string;
  appName: string;
  term: VpsTerm;
  priceCents: number;
  currency: string;
  region: Region;
  hostname: string;
  createdAt: Date;
}

export interface AccountVps {
  instances: AccountVpsInstance[];
  /** Commandes qui n'ont pas (encore) d'instance : paiement attendu, expirée, échouée… */
  orders: AccountVpsOrder[];
}

/**
 * Événements dont le texte d'origine peut contenir un détail technique (nom de serveur, instantané,
 * erreur d'étape) : le libellé traduit du type d'événement suffit, le texte n'est pas rendu.
 */
export const OPAQUE_MESSAGE_KINDS: ReadonlySet<string> = new Set([
  "step_error",
  "provision_failed",
  "reinstall_failed",
  "cleanup_failed",
  "no_capacity",
  "placed",
  "old_vm_retained",
]);

/** Message public d'un événement : nettoyé, borné, vide pour les types opaques. */
export function publicEventMessage(kind: string, message: string): string {
  if (OPAQUE_MESSAGE_KINDS.has(kind)) return "";
  return scrubString(message).replace(/\s+/g, " ").trim().slice(0, 200);
}

type Pinned = VpsCatalogSnapshot | null;

/** Versions de catalogue lues une seule fois par appel ; une version illisible donne `null`. */
function snapshotLoader(db: Database) {
  const cache = new Map<string, Promise<Pinned>>();
  return (versionId: string): Promise<Pinned> => {
    let hit = cache.get(versionId);
    if (!hit) {
      hit = getCatalogVersionById(db, versionId)
        .then((v) => v.snapshot)
        .catch(() => null);
      cache.set(versionId, hit);
    }
    return hit;
  };
}

const daysAgo = (now: Date, days: number) =>
  new Date(now.getTime() - days * 86_400_000);

export async function loadAccountVps(
  db: Database,
  organizationId: string,
  options: { now?: Date } = {},
): Promise<AccountVps> {
  const now = options.now ?? new Date();
  const pinned = snapshotLoader(db);

  const rows = await db
    .select({
      id: vpsInstances.id,
      orderId: vpsInstances.orderId,
      status: vpsInstances.status,
      step: vpsInstances.step,
      power: vpsInstances.power,
      pendingAction: vpsInstances.pendingAction,
      vcpu: vpsInstances.vcpu,
      ramMb: vpsInstances.ramMb,
      diskGb: vpsInstances.diskGb,
      planCode: vpsInstances.planCode,
      appCode: vpsInstances.appCode,
      appVersion: vpsInstances.appVersion,
      catalogVersionId: vpsInstances.catalogVersionId,
      serverId: vpsInstances.serverId,
      ipv4: vpsInstances.ipv4,
      hostKeyFingerprint: vpsInstances.sshHostKeyFingerprint,
      createdAt: vpsInstances.createdAt,
      activatedAt: vpsInstances.activatedAt,
      suspendedAt: vpsInstances.suspendedAt,
      canceledAt: vpsInstances.canceledAt,
      retentionEndsAt: vpsInstances.retentionEndsAt,
      deletedAt: vpsInstances.deletedAt,
      hostname: vpsOrders.hostname,
      region: vpsOrders.region,
      sshKeyFingerprint: vpsOrders.sshKeyFingerprint,
      term: vpsOrders.term,
      priceCents: vpsOrders.priceCents,
      currency: vpsOrders.currency,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      subscriptionStatus: subscriptions.status,
    })
    .from(vpsInstances)
    .innerJoin(vpsOrders, eq(vpsOrders.id, vpsInstances.orderId))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.stripeSubscriptionId, vpsOrders.stripeSubscriptionId),
        eq(subscriptions.organizationId, vpsOrders.organizationId),
      ),
    )
    .where(eq(vpsInstances.organizationId, organizationId))
    .orderBy(desc(vpsInstances.createdAt), desc(vpsInstances.id))
    .limit(100);

  // Vivants d'abord ; supprimés ou en échec ensuite, seulement les récents.
  const isClosed = (s: VpsInstanceStatus) => s === "deleted" || s === "failed";
  const cutoff = daysAgo(now, RECENT_DAYS);
  const live = rows.filter((r) => !isClosed(r.status));
  const closed = rows
    .filter((r) => isClosed(r.status) && r.createdAt >= cutoff)
    .slice(0, MAX_CLOSED);
  const shown = [...live, ...closed];

  // Utilisateur SSH : colonne `ci_user` du gabarit du serveur qui héberge la VM, trouvé par le
  // code de gabarit du plan dans la version de catalogue de la commande.
  const serverIds = [
    ...new Set(shown.map((r) => r.serverId).filter((s): s is string => !!s)),
  ];
  const templates = serverIds.length
    ? await db
        .select({
          serverId: osTemplates.serverId,
          code: osTemplates.code,
          ciUser: osTemplates.ciUser,
        })
        .from(osTemplates)
        .where(inArray(osTemplates.serverId, serverIds))
    : [];
  const ciUser = new Map(
    templates.map((tpl) => [`${tpl.serverId}|${tpl.code}`, tpl.ciUser]),
  );

  const instances = await Promise.all(
    shown.map(async (r): Promise<AccountVpsInstance> => {
      const snapshot = await pinned(r.catalogVersionId);
      const plan = snapshot?.plans.find((p) => p.code === r.planCode);
      const app = snapshot?.apps.find((a) => a.code === r.appCode);
      const user =
        (r.serverId && plan
          ? ciUser.get(`${r.serverId}|${plan.templateCode}`)
          : undefined) || DEFAULT_SSH_USER;
      const events = await db
        .select({
          id: vpsEvents.id,
          kind: vpsEvents.kind,
          message: vpsEvents.message,
          actor: vpsEvents.actor,
          createdAt: vpsEvents.createdAt,
        })
        .from(vpsEvents)
        .where(
          and(
            eq(vpsEvents.organizationId, organizationId),
            or(
              eq(vpsEvents.instanceId, r.id),
              eq(vpsEvents.orderId, r.orderId),
            ),
          ),
        )
        .orderBy(desc(vpsEvents.createdAt), desc(vpsEvents.id))
        .limit(ACCOUNT_VPS_EVENT_LIMIT);
      return {
        id: r.id,
        status: r.status,
        step: r.step,
        power: r.power,
        pendingAction: r.pendingAction,
        plan: {
          code: r.planCode,
          name: plan?.name ?? r.planCode,
          vcpu: r.vcpu,
          ramMb: r.ramMb,
          diskGb: r.diskGb,
        },
        app: {
          code: r.appCode,
          name: app?.name ?? r.appCode,
          version: r.appVersion,
        },
        ipv4: r.ipv4,
        region: r.region,
        hostname: r.hostname,
        sshUser: user,
        sshKeyFingerprint: r.sshKeyFingerprint,
        hostKeyFingerprint: r.hostKeyFingerprint,
        ports: (app?.ports ?? []).map((p) => ({
          port: p.port,
          proto: p.proto,
          exposure: p.exposure,
          labelFr: p.labelFr,
          labelEn: p.labelEn,
        })),
        createdAt: r.createdAt,
        activatedAt: r.activatedAt,
        suspendedAt: r.suspendedAt,
        canceledAt: r.canceledAt,
        retentionEndsAt: r.retentionEndsAt,
        deletedAt: r.deletedAt,
        billing: {
          term: r.term,
          priceCents: r.priceCents,
          currency: r.currency,
          nextDueAt: r.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: r.cancelAtPeriodEnd ?? false,
          subscriptionStatus: r.subscriptionStatus ?? null,
        },
        events: events.map((e) => ({
          id: e.id,
          kind: e.kind,
          message: publicEventMessage(e.kind, e.message),
          actor: e.actor,
          createdAt: e.createdAt,
        })),
      };
    }),
  );

  // Commandes sans instance. Les états finaux anciens (expirée, annulée, échouée) disparaissent.
  const orderRows = await db
    .select({
      id: vpsOrders.id,
      status: vpsOrders.status,
      planCode: vpsOrders.planCode,
      appCode: vpsOrders.appCode,
      term: vpsOrders.term,
      priceCents: vpsOrders.priceCents,
      currency: vpsOrders.currency,
      region: vpsOrders.region,
      hostname: vpsOrders.hostname,
      catalogVersionId: vpsOrders.catalogVersionId,
      createdAt: vpsOrders.createdAt,
    })
    .from(vpsOrders)
    .leftJoin(vpsInstances, eq(vpsInstances.orderId, vpsOrders.id))
    .where(
      and(
        eq(vpsOrders.organizationId, organizationId),
        isNull(vpsInstances.id),
      ),
    )
    .orderBy(desc(vpsOrders.createdAt), desc(vpsOrders.id))
    .limit(MAX_ORDERS * 2);
  const orderCutoff = daysAgo(now, 30);
  const finalStates: readonly VpsOrderStatus[] = [
    "expired",
    "canceled",
    "failed",
  ];
  const orders = await Promise.all(
    orderRows
      .filter(
        (o) => !finalStates.includes(o.status) || o.createdAt >= orderCutoff,
      )
      .slice(0, MAX_ORDERS)
      .map(async (o): Promise<AccountVpsOrder> => {
        const snapshot = await pinned(o.catalogVersionId);
        return {
          id: o.id,
          status: o.status,
          planCode: o.planCode,
          planName:
            snapshot?.plans.find((p) => p.code === o.planCode)?.name ??
            o.planCode,
          appCode: o.appCode,
          appName:
            snapshot?.apps.find((a) => a.code === o.appCode)?.name ?? o.appCode,
          term: o.term,
          priceCents: o.priceCents,
          currency: o.currency,
          region: o.region,
          hostname: o.hostname,
          createdAt: o.createdAt,
        };
      }),
  );

  return { instances, orders };
}
