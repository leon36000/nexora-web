import {
  type Database,
  type Executor,
  paymentAudit,
  paymentSettings,
} from "@nexora/db";
import { z } from "zod";

export type PaymentSettings = typeof paymentSettings.$inferSelect;

/** Écrit une ligne du journal des paiements (ajout seulement). Jamais de secret dans `detail`. */
export async function auditPayment(
  db: Executor,
  entry: {
    actor: string;
    action: string;
    subject?: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(paymentAudit).values({
    actor: entry.actor,
    action: entry.action,
    subject: entry.subject ?? "",
    detail: entry.detail ?? {},
  });
}

/** Réglages (une ligne) : créée avec les valeurs par défaut à la première lecture. */
export async function getSettings(db: Database): Promise<PaymentSettings> {
  await db
    .insert(paymentSettings)
    .values({ id: "default" })
    .onConflictDoNothing();
  const [row] = await db.select().from(paymentSettings);
  if (!row) throw new Error("réglages de paiement introuvables");
  return row;
}

export async function isLiveAllowed(db: Database): Promise<boolean> {
  return (await getSettings(db)).liveModeAllowed;
}

/** Réglages modifiables depuis l'admin. Le reste (état de Stripe) est écrit par le branchement. */
export const settingsPatchSchema = z
  .object({
    liveModeAllowed: z.boolean(),
    trialRequiresCard: z.boolean(),
    stripePageCodes: z.boolean(),
    staffMonthlyCreditCapCents: z.number().int().min(0).max(10_000_000),
    creditsFeeEnabled: z.boolean(),
    creditsFeeBps: z.number().int().min(0).max(3000),
    creditsFeeMinCents: z.number().int().min(0).max(100_000),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Met à jour les réglages et journalise exactement ce qui a changé. */
export async function updateSettings(
  db: Database,
  patch: SettingsPatch,
  actor: string,
): Promise<PaymentSettings> {
  const before = await getSettings(db);
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(patch)) {
    const current = (before as Record<string, unknown>)[key];
    if (value !== undefined && current !== value)
      changed[key] = { from: current, to: value };
  }
  if (Object.keys(changed).length === 0) return before;
  const [row] = await db
    .update(paymentSettings)
    .set({ ...patch, updatedAt: new Date() })
    .returning();
  await auditPayment(db, {
    actor,
    action: "settings.update",
    subject: "payment_settings",
    detail: { changed },
  });
  return row ?? before;
}
