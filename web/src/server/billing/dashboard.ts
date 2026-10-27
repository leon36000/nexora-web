import {
  type Account,
  and,
  billingCustomers,
  creditEntries,
  type Database,
  desc,
  type EntryKind,
  eq,
  getAccount,
  organizations,
  type SubscriptionStatus,
  sql,
  subscriptions,
} from "@nexora/db";
import { type AccessLevel, accessLevel } from "./subscription-state";

export interface DashboardEntry {
  id: string;
  kind: EntryKind;
  source: string;
  /** Variation du solde (négative pour un retrait). */
  amountMicro: bigint;
  balanceAfterMicro: bigint;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface DashboardSubscription {
  id: string;
  planCode: string | null;
  status: SubscriptionStatus;
  access: AccessLevel;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

export interface DashboardData {
  organization: { id: string; name: string };
  account: Account;
  entries: DashboardEntry[];
  subscriptions: DashboardSubscription[];
  hasStripeCustomer: boolean;
}

/**
 * Données du tableau de bord d'UNE organisation. L'appelant a déjà confronté l'identifiant aux
 * adhésions de l'utilisateur (`resolveOrgContext`) ; cette fonction ne lit rien d'une autre organisation.
 * Les écritures internes de réservation et de libération (sans effet sur le solde) sont masquées.
 */
export async function loadDashboard(
  db: Database,
  organizationId: string,
  options: { now?: Date; entryLimit?: number } = {},
): Promise<DashboardData> {
  const now = options.now ?? new Date();
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new Error("organisation introuvable");

  const [account, entries, subs, customer] = await Promise.all([
    getAccount(db, organizationId),
    db
      .select()
      .from(creditEntries)
      .where(
        and(
          eq(creditEntries.organizationId, organizationId),
          sql`${creditEntries.balanceDeltaMicro} <> 0`,
        ),
      )
      .orderBy(desc(creditEntries.createdAt), desc(creditEntries.id))
      .limit(options.entryLimit ?? 25),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.createdAt)),
    db
      .select({ id: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.organizationId, organizationId)),
  ]);

  return {
    organization: org,
    account,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      source: e.source,
      amountMicro: e.balanceDeltaMicro,
      balanceAfterMicro: e.balanceAfterMicro,
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
    })),
    subscriptions: subs.map((s) => ({
      id: s.id,
      planCode: s.planCode,
      status: s.status,
      access: accessLevel(
        {
          status: s.status,
          graceEndsAt: s.graceEndsAt,
          canceledAt: s.canceledAt,
          lastEventCreated: s.lastEventCreated,
        },
        now,
      ),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      // Un abonnement résilié ne se renouvelle plus : pas de « prochaine échéance ».
      currentPeriodEnd: s.status === "canceled" ? null : s.currentPeriodEnd,
      graceEndsAt: s.graceEndsAt,
    })),
    hasStripeCustomer: customer.length > 0,
  };
}
