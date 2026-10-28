import { createHash } from "node:crypto";
import {
  and,
  type Executor,
  eq,
  type TrialClaimKind,
  trialClaims,
  trialDenials,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import type Stripe from "stripe";

/**
 * Un essai gratuit par moyen de paiement ET par adresse courriel, pour une famille d'offre.
 *
 * Le webhook inscrit, dès qu'un abonnement est en essai, l'empreinte de la carte (`card.fingerprint` de Stripe, la même
 * pour une même carte physique d'un compte à l'autre) et le courriel normalisé. Si l'un des deux a déjà servi pour un
 * AUTRE abonnement de la même famille, l'essai est annulé (l'abonnement est résilié chez Stripe, sans prélèvement).
 * L'organisation garde la règle d'avant (un essai par organisation et par famille, `payments/purchase.ts`). Au moment de
 * créer la session de paiement, un courriel déjà servi n'obtient plus d'essai (`emailTrialConsumed`).
 */

/** Ce que Stripe sait d'un abonnement en essai : moyen de paiement et courriel du client. */
interface TrialCredentials {
  /** `card.fingerprint` du moyen de paiement par défaut ; null si aucune carte n'est (encore) enregistrée. */
  cardFingerprint: string | null;
  email: string | null;
}

export interface TrialInspector {
  /** Lecture chez Stripe ; null si l'abonnement est introuvable (événement de développement). */
  inspect(subscriptionId: string): Promise<TrialCredentials | null>;
  /** Résilie l'abonnement tout de suite, sans prorata ni facture. Idempotent. */
  cancel(subscriptionId: string): Promise<void>;
}

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * Courriel comparable : minuscules, alias `+étiquette` retirés, et chez Gmail points ignorés (`googlemail.com` =
 * `gmail.com`). Ailleurs les points comptent : ce sont des boîtes différentes. null si ce n'est pas une adresse.
 */
export function normalizeEmailForTrial(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1 || /\s/.test(email)) return null;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (!/^[^@\s]+$/.test(local) || !/^[a-z0-9.-]+\.[a-z0-9-]+$/.test(domain))
    return null;
  const plus = local.indexOf("+");
  if (plus >= 0) local = local.slice(0, plus);
  if (GMAIL.has(domain)) {
    domain = "gmail.com";
    local = local.replaceAll(".", "");
  }
  return local ? `${local}@${domain}` : null;
}

/** Empreinte SHA-256 d'une clé : la base ne garde ni l'empreinte de carte ni le courriel en clair. */
export const trialKeyHash = (kind: TrialClaimKind, value: string): string =>
  createHash("sha256").update(`nexora-trial:${kind}:${value}`).digest("hex");

/** Ce courriel a-t-il déjà servi à un essai de cette famille ? (vérifié avant de proposer l'essai au Checkout) */
export async function emailTrialConsumed(
  db: Executor,
  email: string,
  family: string,
): Promise<boolean> {
  const normalized = normalizeEmailForTrial(email);
  if (!normalized) return false;
  const [row] = await db
    .select({ id: trialClaims.id })
    .from(trialClaims)
    .where(
      and(
        eq(trialClaims.kind, "email"),
        eq(trialClaims.keyHash, trialKeyHash("email", normalized)),
        eq(trialClaims.family, family),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type TrialVerdict = "ok" | "denied" | "skipped";

/**
 * À appeler dans la transaction du webhook pour un abonnement en essai. Inscrit les clés de l'abonnement ; si l'une
 * est déjà prise par un autre abonnement, retire les clés inscrites par celui-ci, consigne le refus et résilie
 * l'abonnement chez Stripe. Une erreur (lecture ou résiliation) remonte : la transaction est annulée et Stripe renvoie
 * l'événement.
 */
export async function enforceTrialUniqueness(
  tx: Executor,
  input: {
    inspector: TrialInspector;
    subscriptionId: string;
    organizationId: string;
    family: string;
    log: Logger;
  },
): Promise<TrialVerdict> {
  const { inspector, subscriptionId, organizationId, family, log } = input;
  const [denied] = await tx
    .select({ id: trialDenials.id })
    .from(trialDenials)
    .where(eq(trialDenials.stripeSubscriptionId, subscriptionId));
  if (denied) return "denied";
  // Carte déjà inscrite pour cet abonnement : les événements suivants n'ont rien à relire.
  const [mine] = await tx
    .select({ id: trialClaims.id })
    .from(trialClaims)
    .where(
      and(
        eq(trialClaims.stripeSubscriptionId, subscriptionId),
        eq(trialClaims.kind, "card"),
      ),
    );
  if (mine) return "ok";

  const creds = await inspector.inspect(subscriptionId);
  if (!creds) return "skipped";
  const keys: { kind: TrialClaimKind; hash: string }[] = [];
  if (creds.cardFingerprint)
    keys.push({
      kind: "card",
      hash: trialKeyHash("card", creds.cardFingerprint),
    });
  const email = creds.email ? normalizeEmailForTrial(creds.email) : null;
  if (email) keys.push({ kind: "email", hash: trialKeyHash("email", email) });

  let conflict: TrialClaimKind | null = null;
  for (const key of keys) {
    const inserted = await tx
      .insert(trialClaims)
      .values({
        kind: key.kind,
        keyHash: key.hash,
        family,
        organizationId,
        stripeSubscriptionId: subscriptionId,
      })
      .onConflictDoNothing()
      .returning({ id: trialClaims.id });
    if (inserted.length > 0) continue;
    const [existing] = await tx
      .select({ subscription: trialClaims.stripeSubscriptionId })
      .from(trialClaims)
      .where(
        and(
          eq(trialClaims.kind, key.kind),
          eq(trialClaims.keyHash, key.hash),
          eq(trialClaims.family, family),
        ),
      );
    if (existing && existing.subscription !== subscriptionId)
      conflict = conflict ?? key.kind;
  }
  if (!conflict) return "ok";

  // Cet abonnement n'a pas consommé d'essai : ses clés ne comptent pas contre le client.
  await tx
    .delete(trialClaims)
    .where(eq(trialClaims.stripeSubscriptionId, subscriptionId));
  await tx
    .insert(trialDenials)
    .values({
      organizationId,
      stripeSubscriptionId: subscriptionId,
      family,
      reason: conflict,
    })
    .onConflictDoNothing();
  log.warn("essai gratuit déjà consommé : abonnement résilié", {
    subscriptionId,
    organizationId,
    reason: conflict,
  });
  await inspector.cancel(subscriptionId);
  return "denied";
}

/** Lecture et résiliation chez Stripe (production). */
export function stripeTrialInspector(
  stripe: Pick<Stripe, "subscriptions" | "paymentMethods">,
): TrialInspector {
  const notFound = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "resource_missing";
  const fingerprintOf = (
    pm: Stripe.PaymentMethod | string | null | undefined,
  ): string | null =>
    pm && typeof pm === "object" ? (pm.card?.fingerprint ?? null) : null;
  return {
    async inspect(subscriptionId) {
      let sub: Stripe.Subscription;
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["default_payment_method", "customer"],
        });
      } catch (error) {
        if (notFound(error)) return null;
        throw error;
      }
      const customer =
        typeof sub.customer === "object" && !("deleted" in sub.customer)
          ? sub.customer
          : null;
      let fingerprint = fingerprintOf(sub.default_payment_method);
      if (!fingerprint && customer) {
        // Checkout n'attache pas toujours la carte à l'abonnement : repli sur celle du client.
        const defaultPm = customer.invoice_settings?.default_payment_method;
        if (defaultPm)
          fingerprint = fingerprintOf(
            typeof defaultPm === "string"
              ? await stripe.paymentMethods.retrieve(defaultPm)
              : defaultPm,
          );
        if (!fingerprint) {
          const list = await stripe.paymentMethods.list({
            customer: customer.id,
            type: "card",
            limit: 1,
          });
          fingerprint = fingerprintOf(list.data[0]);
        }
      }
      return { cardFingerprint: fingerprint, email: customer?.email ?? null };
    },
    async cancel(subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId, {
          prorate: false,
          invoice_now: false,
        });
      } catch (error) {
        if (notFound(error)) return;
        // Déjà résilié (rejeu d'un événement) : rien à faire ; toute autre erreur remonte pour que Stripe renvoie.
        const current = await stripe.subscriptions
          .retrieve(subscriptionId)
          .catch(() => null);
        if (current?.status !== "canceled") throw error;
      }
    },
  };
}
