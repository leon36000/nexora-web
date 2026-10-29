import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import { balanceAlerts } from "./schema-billing.ts";

/**
 * Alerte de solde bas : le client fixe un seuil (micro-CAD) ; sous ce seuil, les propriétaires de l'organisation
 * reçoivent UN courriel (tâche périodique du worker). Une alerte envoyée est marquée (`last_alerted_at`) et ne repart
 * pas tant que le solde reste bas ; elle se réarme quand le solde remonte au-dessus du seuil, ou quand le client
 * change le seuil. L'organisation « maison » (accès gratuit) n'a jamais d'alerte : elle n'a pas de solde à surveiller.
 */

export type BalanceAlert = typeof balanceAlerts.$inferSelect;

export interface AlertDue {
  organizationId: string;
  thresholdMicro: bigint;
  /** Solde disponible (solde moins réservé) au moment du contrôle. */
  availableMicro: bigint;
  recipients: { email: string; locale: string }[];
}

export async function getBalanceAlert(
  db: Database,
  organizationId: string,
): Promise<BalanceAlert | null> {
  const [row] = await db
    .select()
    .from(balanceAlerts)
    .where(eq(balanceAlerts.organizationId, organizationId));
  return row ?? null;
}

/** Enregistre le réglage ; un nouveau seuil réarme l'alerte (elle repartira si le solde est déjà sous le nouveau seuil). */
export async function setBalanceAlert(
  db: Database,
  organizationId: string,
  input: { enabled: boolean; thresholdMicro: bigint; updatedBy?: string },
): Promise<void> {
  if (typeof input.thresholdMicro !== "bigint" || input.thresholdMicro <= 0n)
    throw new RangeError("seuil d'alerte : montant positif attendu");
  await db
    .insert(balanceAlerts)
    .values({
      organizationId,
      enabled: input.enabled,
      thresholdMicro: input.thresholdMicro,
      updatedBy: input.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: balanceAlerts.organizationId,
      set: {
        enabled: input.enabled,
        thresholdMicro: input.thresholdMicro,
        lastAlertedAt: null,
        updatedBy: input.updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
}

/** Alertes à envoyer : actives, jamais envoyées depuis la dernière remontée du solde, solde disponible sous le seuil. */
export async function dueBalanceAlerts(
  db: Database,
  _now: Date,
): Promise<AlertDue[]> {
  const rows = await db.execute<{
    organization_id: string;
    threshold: string;
    available: string;
  }>(sql`
    SELECT a.organization_id,
           a.threshold_micro::text AS threshold,
           (COALESCE(c.balance_micro, 0) - COALESCE(c.held_micro, 0))::text AS available
    FROM balance_alerts a
    LEFT JOIN credit_accounts c ON c.organization_id = a.organization_id
    WHERE a.enabled
      AND a.last_alerted_at IS NULL
      AND (COALESCE(c.balance_micro, 0) - COALESCE(c.held_micro, 0)) < a.threshold_micro
      AND NOT EXISTS (
        SELECT 1 FROM organization_billing b
        WHERE b.organization_id = a.organization_id AND b.mode = 'house'
      )
    ORDER BY a.organization_id
  `);
  const out: AlertDue[] = [];
  for (const r of rows) {
    const people = await db.execute<{ email: string; locale: string }>(sql`
      SELECT u.email, u.locale
      FROM members m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = ${r.organization_id}
        AND m.role = 'owner' AND u.email_verified
      ORDER BY u.email
    `);
    const recipients = [...people].map((p) => ({
      email: p.email,
      locale: p.locale,
    }));
    if (recipients.length === 0) continue;
    out.push({
      organizationId: r.organization_id,
      thresholdMicro: BigInt(r.threshold),
      availableMicro: BigInt(r.available),
      recipients,
    });
  }
  return out;
}

/** Marque l'alerte envoyée ; `false` si un autre worker l'a déjà marquée (un seul courriel par passage sous le seuil). */
export async function markBalanceAlertSent(
  db: Database,
  organizationId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(balanceAlerts)
    .set({ lastAlertedAt: now })
    .where(
      and(
        eq(balanceAlerts.organizationId, organizationId),
        isNull(balanceAlerts.lastAlertedAt),
      ),
    )
    .returning({ id: balanceAlerts.organizationId });
  return rows.length === 1;
}

/** Réarme les alertes dont le solde est remonté au seuil ou au-delà. Renvoie leur nombre. */
export async function rearmRecoveredAlerts(db: Database): Promise<number> {
  const rows = await db.execute<{ organization_id: string }>(sql`
    UPDATE balance_alerts a
    SET last_alerted_at = NULL
    WHERE a.last_alerted_at IS NOT NULL
      AND (
        SELECT COALESCE(c.balance_micro, 0) - COALESCE(c.held_micro, 0)
        FROM (SELECT 1) one
        LEFT JOIN credit_accounts c ON c.organization_id = a.organization_id
      ) >= a.threshold_micro
    RETURNING a.organization_id
  `);
  return [...rows].length;
}
