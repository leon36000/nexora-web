import {
  accessLevel,
  type Database,
  type Executor,
  eq,
  getAccount,
  organizationStorage,
  STORAGE_PRODUCTS,
  type StorageProduct,
  sql,
  storageUsage,
  subscriptions,
} from "@nexora/db";
import { getDb } from "../db";
import { billingModeOf } from "../gateway/house";
import { loadWallet } from "./wallet";

export type { StorageProduct };

/**
 * Droits d'une organisation : crédits, offre, espace disque et accès aux modèles. Contrat entre les chantiers
 * (conception `docs/superpowers/specs/2026-10-30-credits-produits-design.md`) : RAG, panneau et Nexora Code le lisent.
 *
 * - **1 crédit = 1 ¢ CA** : le grand livre garde ses micro-CAD (1 CAD = 1 000 000), `credits` les rend en cents,
 *   arrondis vers le bas (une fraction de cent n'est pas un crédit).
 * - **Deux sortes de crédits**, jamais mélangées : `subscription` (versés à chaque période payée, expirent à la
 *   fin de la période : lots de source « subscription ») et `refill` (tous les autres lots : recharges, gestes
 *   commerciaux ; sans expiration). La consommation du grand livre sert d'abord les lots qui expirent le plus tôt,
 *   donc ceux de l'abonnement avant la recharge ; `credits` refait ce partage en lecture seule (voir `wallet.ts`).
 * - `total` = `subscription + refill`, net des montants réservés par les requêtes en cours (ce qui est vraiment
 *   disponible) ; 0 si le solde est négatif (remboursement, litige).
 * - `canUseModels` : au moins 1 crédit, ou organisation « maison » (accès gratuit). Il remplace l'ancienne règle
 *   « exige un abonnement » : une recharge seule suffit.
 */
export type OrgEntitlements = {
  /** Code de l'offre en vigueur (« nexora-base »), `null` sans abonnement actif ni délai de grâce. */
  planCode: string | null;
  interval: "month" | "year" | null;
  /** En crédits (1 crédit = 1 ¢ CA). */
  credits: { subscription: number; refill: number; total: number };
  storage: {
    /** Espace de l'offre, en octets (1 Go = 1 000 000 000 octets). */
    quotaBytes: number;
    /** Go supplémentaires achetés, en octets, en plus de `quotaBytes`. */
    extraBytes: number;
    usedBytes: number;
    byProduct: Record<StorageProduct, number>;
  };
  canUseModels: boolean;
};

/** 1 crédit = 1 ¢ CA = 10 000 micro-CAD. */
const MICRO_PER_CREDIT = 10_000n;

const toCredits = (micro: bigint): number =>
  micro > 0n ? Number(micro / MICRO_PER_CREDIT) : 0;

const emptyByProduct = (): Record<StorageProduct, number> =>
  Object.fromEntries(STORAGE_PRODUCTS.map((p) => [p, 0])) as Record<
    StorageProduct,
    number
  >;

/** Abonnements à une offre qui donnent actuellement droit à l'offre (complet ou délai de grâce). */
async function entitledPlan(
  db: Executor,
  organizationId: string,
  now: Date,
): Promise<{
  planCode: string | null;
  interval: "month" | "year" | null;
  quotaBytes: bigint;
}> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId));
  const entitled = rows
    .filter((s) => {
      if (s.planCode === null) return false;
      const level = accessLevel(
        { status: s.status, graceEndsAt: s.graceEndsAt },
        now,
      );
      return level === "full" || level === "grace";
    })
    // L'offre principale : la plus grande, à égalité la plus ancienne (résultat stable).
    .sort(
      (a, b) =>
        (a.storageQuotaBytes === b.storageQuotaBytes
          ? 0
          : a.storageQuotaBytes > b.storageQuotaBytes
            ? -1
            : 1) || a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const main = entitled[0];
  return {
    planCode: main?.planCode ?? null,
    interval: main?.billingInterval ?? null,
    quotaBytes: entitled.reduce((sum, s) => sum + s.storageQuotaBytes, 0n),
  };
}

async function loadExtraBytes(
  db: Executor,
  organizationId: string,
): Promise<bigint> {
  const [row] = await db
    .select({ extra: organizationStorage.extraBytes })
    .from(organizationStorage)
    .where(eq(organizationStorage.organizationId, organizationId));
  return row?.extra ?? 0n;
}

/** Droits d'une organisation à l'instant `now` (lecture seule : ne touche ni au grand livre ni à l'espace). */
export async function loadOrgEntitlements(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrgEntitlements> {
  const [wallet, account, plan, extra, usage, mode] = await Promise.all([
    loadWallet(db, organizationId, now),
    getAccount(db, organizationId),
    entitledPlan(db, organizationId, now),
    loadExtraBytes(db, organizationId),
    db
      .select()
      .from(storageUsage)
      .where(eq(storageUsage.organizationId, organizationId)),
    billingModeOf(db, organizationId),
  ]);

  // Restant par sorte de lot, puis net des montants réservés : la consommation (donc la réservation) sert
  // d'abord l'abonnement, qui expire en premier.
  let subscriptionMicro = 0n;
  let refillMicro = 0n;
  for (const lot of wallet.lots) {
    if (lot.included) subscriptionMicro += lot.remainingMicro;
    else refillMicro += lot.remainingMicro;
  }
  let held = account.heldMicro;
  const heldOnSubscription =
    held < subscriptionMicro ? held : subscriptionMicro;
  subscriptionMicro -= heldOnSubscription;
  held -= heldOnSubscription;
  refillMicro = held < refillMicro ? refillMicro - held : 0n;
  if (account.blocked) {
    subscriptionMicro = 0n;
    refillMicro = 0n;
  }
  const subscription = toCredits(subscriptionMicro);
  const refill = toCredits(refillMicro);
  const total = subscription + refill;

  const byProduct = emptyByProduct();
  let usedBytes = 0;
  for (const row of usage) {
    const used = Number(row.usedBytes);
    byProduct[row.product] = used;
    usedBytes += used;
  }

  return {
    planCode: plan.planCode,
    interval: plan.interval,
    credits: { subscription, refill, total },
    storage: {
      quotaBytes: Number(plan.quotaBytes),
      extraBytes: Number(extra),
      usedBytes,
      byProduct,
    },
    canUseModels: mode === "house" || total > 0,
  };
}

/**
 * Droit d'appeler les modèles (passerelle, WorkStudio intégré, agents) : au moins 1 crédit, d'abonnement OU de
 * recharge, ou organisation « maison ». Remplace l'ancienne règle « exige un abonnement ».
 */
export async function orgCanUseModels(
  db: Database,
  organizationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  return (await loadOrgEntitlements(db, organizationId, now)).canUseModels;
}

export type StorageUsageResult =
  | { ok: true }
  | { ok: false; reason: "quota_exceeded" };

/**
 * Ajoute (`deltaBytes` > 0) ou libère (< 0) de l'espace pour un produit. Une écriture qui ferait dépasser le quota
 * (espace de l'offre + Go supplémentaires) est refusée sans rien changer ; libérer est toujours permis, même quand
 * l'offre est résiliée (on peut supprimer ses données), et l'usage ne descend jamais sous zéro. L'organisation
 * « maison » n'est pas limitée, mais son usage est compté. Les écritures d'une organisation sont sérialisées
 * (verrou de sa ligne `organization_storage`) : deux écritures simultanées ne dépassent jamais le quota.
 */
export async function recordStorageUsageIn(
  db: Database,
  organizationId: string,
  product: StorageProduct,
  deltaBytes: number,
  now: Date = new Date(),
): Promise<StorageUsageResult> {
  if (!STORAGE_PRODUCTS.includes(product))
    throw new RangeError(`produit d'espace inconnu : ${String(product)}`);
  if (!Number.isSafeInteger(deltaBytes))
    throw new RangeError("deltaBytes : entier attendu");
  if (deltaBytes === 0) return { ok: true };

  return db.transaction(async (tx) => {
    const exec = tx as unknown as Database;
    await exec
      .insert(organizationStorage)
      .values({ organizationId })
      .onConflictDoNothing();
    const [lock] = await exec
      .select({ extra: organizationStorage.extraBytes })
      .from(organizationStorage)
      .where(eq(organizationStorage.organizationId, organizationId))
      .for("update");

    if (
      deltaBytes > 0 &&
      (await billingModeOf(exec, organizationId)) !== "house"
    ) {
      const plan = await entitledPlan(exec, organizationId, now);
      const [used] = await exec
        .select({
          total: sql<string>`COALESCE(SUM(${storageUsage.usedBytes}), 0)::text`,
        })
        .from(storageUsage)
        .where(eq(storageUsage.organizationId, organizationId));
      const quota = plan.quotaBytes + (lock?.extra ?? 0n);
      if (BigInt(used?.total ?? "0") + BigInt(deltaBytes) > quota)
        return { ok: false, reason: "quota_exceeded" } as const;
    }

    await exec
      .insert(storageUsage)
      .values({
        organizationId,
        product,
        usedBytes: deltaBytes > 0 ? BigInt(deltaBytes) : 0n,
      })
      .onConflictDoUpdate({
        target: [storageUsage.organizationId, storageUsage.product],
        set: {
          usedBytes: sql`GREATEST(${storageUsage.usedBytes} + ${deltaBytes.toString()}::bigint, 0)`,
          updatedAt: sql`now()`,
        },
      });
    return { ok: true } as const;
  });
}

/**
 * Fixe les Go supplémentaires d'une organisation (en octets, en plus de l'espace de son offre). À appeler par
 * l'achat de l'offre complémentaire « Go supplémentaire » (pas encore branché au paiement, voir
 * `docs/credits-et-offres.md`) ou par l'équipe.
 */
export async function setExtraStorage(
  db: Database,
  organizationId: string,
  extraBytes: number,
): Promise<void> {
  if (!Number.isSafeInteger(extraBytes) || extraBytes < 0)
    throw new RangeError("extraBytes : entier positif ou nul attendu");
  await db
    .insert(organizationStorage)
    .values({ organizationId, extraBytes: BigInt(extraBytes) })
    .onConflictDoUpdate({
      target: organizationStorage.organizationId,
      set: { extraBytes: BigInt(extraBytes), updatedAt: sql`now()` },
    });
}

/** Contrat des chantiers : droits de l'organisation, lus dans la base du site. */
export function getOrgEntitlements(orgId: string): Promise<OrgEntitlements> {
  return loadOrgEntitlements(getDb(), orgId);
}

/** Contrat des chantiers : compte (ou libère) de l'espace pour un produit, quota vérifié. */
export function recordStorageUsage(
  orgId: string,
  product: StorageProduct,
  deltaBytes: number,
): Promise<StorageUsageResult> {
  return recordStorageUsageIn(getDb(), orgId, product, deltaBytes);
}
