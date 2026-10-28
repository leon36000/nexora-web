import {
  and,
  creditPurchases,
  type Database,
  eq,
  isNull,
  ne,
  type PromoScope,
  promoCodes,
  promoRedemptions,
  sql,
  staffAccounts,
  subscriptions,
  users,
  vpsOrders,
} from "@nexora/db";
import { hasDisputeRestriction } from "../billing/disputes";
import { normalizeCode, type PromoRow } from "./promo";

/**
 * Motifs de refus d'un code, du plus générique au plus précis. `unknown` sert aussi pour un code désactivé :
 * la réponse ne permet pas d'énumérer les codes qui existent. Chaque motif a un message dans
 * les dictionnaires du compte (`promo.errors`).
 */
export const PROMO_MESSAGE_KEYS = [
  "unknown",
  "expired",
  "exhausted",
  "wrong_scope",
  "staff_only",
  "two_factor_required",
  "first_order_only",
  "already_used",
  "min_amount",
  "not_ready",
  "covers_all",
  "account_restricted",
] as const;
export type PromoRejection = (typeof PROMO_MESSAGE_KEYS)[number];

export type PromoCheck =
  | {
      ok: true;
      promo: PromoRow /** Don du personnel : aucun passage par Stripe. */;
      gift: boolean;
    }
  | { ok: false; reason: PromoRejection };

export interface ValidatePromoInput {
  code: string;
  scope: PromoScope;
  organizationId: string;
  userId: string;
  /** Montant de l'achat avant taxes et avant rabais (crédits : montant payé). */
  amountCents?: number;
  now: Date;
}

export async function isStaffUser(
  db: Database,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: staffAccounts.userId })
    .from(staffAccounts)
    .where(
      and(eq(staffAccounts.userId, userId), isNull(staffAccounts.revokedAt)),
    );
  return Boolean(row);
}

/**
 * Compte du personnel utilisable pour les privilèges (codes `staff`, dons) : drapeau actif ET double
 * authentification activée (ASVS niveau 3 pour les comptes privilégiés). `needs_two_factor` : drapeau posé, mais le
 * compte n'a pas encore activé sa double authentification (page /compte/securite) ; `none` : pas du personnel.
 */
export async function staffStatus(
  db: Database,
  userId: string,
): Promise<"none" | "needs_two_factor" | "ok"> {
  const [row] = await db
    .select({ twoFactor: users.twoFactorEnabled })
    .from(staffAccounts)
    .innerJoin(users, eq(users.id, staffAccounts.userId))
    .where(
      and(eq(staffAccounts.userId, userId), isNull(staffAccounts.revokedAt)),
    );
  if (!row) return "none";
  return row.twoFactor ? "ok" : "needs_two_factor";
}

/**
 * Le champ « code promo » de la page Stripe est-il sûr ? Stripe applique la date de fin, le nombre maximal
 * d'utilisations et « première commande », mais PAS « un par client » : un code de ce type saisi sur la page de
 * Stripe se réutiliserait à volonté. Tant qu'un tel code est actif, le champ est retiré (le code se saisit dans
 * notre formulaire, où la limite est vérifiée).
 */
export async function stripePageCodesSafe(db: Database): Promise<boolean> {
  const [row] = await db
    .select({ id: promoCodes.id })
    .from(promoCodes)
    .where(
      and(
        eq(promoCodes.status, "active"),
        eq(promoCodes.onePerCustomer, true),
        sql`${promoCodes.kind} IN ('percent', 'amount', 'free')`,
      ),
    )
    .limit(1);
  return !row;
}

/** Cette organisation a-t-elle déjà payé quelque chose ? (don du personnel et commande impayée exclus) */
export async function hasPriorOrder(
  db: Database,
  organizationId: string,
): Promise<boolean> {
  const [credit] = await db
    .select({ id: creditPurchases.id })
    .from(creditPurchases)
    .where(eq(creditPurchases.organizationId, organizationId))
    .limit(1);
  if (credit) return true;
  const [sub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        ne(subscriptions.status, "gifted"),
        ne(subscriptions.status, "incomplete"),
        ne(subscriptions.status, "incomplete_expired"),
      ),
    )
    .limit(1);
  if (sub) return true;
  const [vps] = await db
    .select({ id: vpsOrders.id })
    .from(vpsOrders)
    .where(
      and(
        eq(vpsOrders.organizationId, organizationId),
        sql`${vpsOrders.stripeSubscriptionId} IS NOT NULL AND ${vpsOrders.stripeSubscriptionId} NOT LIKE 'gift\\_%'`,
        sql`${vpsOrders.status} NOT IN ('awaiting_payment', 'expired')`,
      ),
    )
    .limit(1);
  return Boolean(vps);
}

/**
 * Validation SERVEUR d'un code saisi dans un parcours d'achat. Ne fait confiance à rien venu du navigateur :
 * le code est relu en base, la portée, les limites et le statut du compte sont revérifiés ici.
 */
export async function validatePromo(
  db: Database,
  input: ValidatePromoInput,
): Promise<PromoCheck> {
  const reject = (reason: PromoRejection): PromoCheck => ({
    ok: false,
    reason,
  });
  const code = normalizeCode(input.code);
  if (!code) return reject("unknown");
  const [promo] = await db
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.code, code));
  if (!promo || promo.status !== "active") return reject("unknown");
  if (promo.expiresAt && promo.expiresAt <= input.now) return reject("expired");
  if (!promo.scopes.includes(input.scope)) return reject("wrong_scope");

  const gift = promo.kind === "staff";
  if (gift) {
    const status = await staffStatus(db, input.userId);
    // Un code du personnel est invisible pour qui ne l'est pas : même réponse qu'un code qui n'existe pas.
    if (status === "none") return reject("unknown");
    if (status === "needs_two_factor") return reject("two_factor_required");
  }

  // Litige ouvert ou perdu : plus de rabais ni d'essai (un don du personnel reste une décision de l'équipe).
  if (!gift && (await hasDisputeRestriction(db, input.organizationId)))
    return reject("account_restricted");

  const [{ used } = { used: 0 }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(eq(promoRedemptions.promoCodeId, promo.id));
  if (promo.maxRedemptions != null && used >= promo.maxRedemptions)
    return reject("exhausted");

  if (promo.onePerCustomer) {
    const [mine] = await db
      .select({ id: promoRedemptions.id })
      .from(promoRedemptions)
      .where(
        and(
          eq(promoRedemptions.promoCodeId, promo.id),
          eq(promoRedemptions.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (mine) return reject("already_used");
  }
  if (promo.firstOrderOnly && (await hasPriorOrder(db, input.organizationId)))
    return reject("first_order_only");
  if (
    promo.minAmountCents != null &&
    (input.amountCents ?? 0) < promo.minAmountCents
  )
    return reject("min_amount");
  if (
    input.scope === "credits" &&
    promo.kind === "amount" &&
    input.amountCents != null &&
    (promo.amountOffCents ?? 0) >= input.amountCents
  )
    return reject("covers_all");

  // Rabais appliqué par Stripe : il faut que le code existe chez Stripe ET soit à jour.
  const needsStripe =
    promo.kind === "percent" ||
    promo.kind === "amount" ||
    promo.kind === "free";
  if (needsStripe && (!promo.stripePromotionCodeId || promo.stripeSyncError))
    return reject("not_ready");
  return { ok: true, promo, gift };
}
