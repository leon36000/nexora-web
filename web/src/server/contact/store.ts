import {
  type Database,
  jobs,
  type Lead,
  leads,
  recordEventOnce,
  sql,
} from "@nexora/db";
import type { ContactData } from "./schema";

/** Type de la tâche de la file `jobs` qui envoie le courriel de notification à l'équipe (gestionnaire : worker). */
export const NOTIFY_JOB = "contact.notify";
/** Une demande identique (même empreinte) reçue dans cette fenêtre n'est ni réenregistrée ni renotifiée. */
export const DEDUPE_WINDOW_HOURS = 24;

export type SaveResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; id: string };

/**
 * Enregistre une demande UNE fois. Dans une seule transaction : verrou consultatif sur l'empreinte (deux envois
 * simultanés se suivent), recherche d'une demande identique dans les 24 h, insertion et mise en file de la
 * notification. Si la transaction échoue, ni la demande ni la tâche n'existent : le visiteur peut réessayer.
 */
export async function saveLead(
  db: Database,
  data: ContactData,
  fingerprint: string,
  lang: "fr" | "en",
): Promise<SaveResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lead:${fingerprint}`}, 0))`,
    );
    const existing = await tx
      .select({ id: leads.id })
      .from(leads)
      .where(
        sql`${leads.fingerprint} = ${fingerprint} AND ${leads.createdAt} > now() - make_interval(hours => ${DEDUPE_WINDOW_HOURS})`,
      )
      .limit(1);
    if (existing[0]) return { status: "duplicate", id: existing[0].id };

    const [row] = await tx
      .insert(leads)
      .values({
        fingerprint,
        lang,
        need: data.need,
        sector: data.sector,
        deployment: data.deployment,
        name: data.name,
        email: data.email,
        company: data.company,
        message: data.message,
        marketingConsent: data.marketingConsent,
      })
      .returning({ id: leads.id });
    if (!row) throw new Error("enregistrement de la demande impossible");
    await tx.insert(jobs).values({
      type: NOTIFY_JOB,
      payload: { leadId: row.id },
      idempotencyKey: `lead-notify:${row.id}`,
      // l'envoi échoue parfois (SMTP) : plusieurs reprises espacées avant de déclarer la tâche morte
      maxAttempts: 8,
    });
    return { status: "created", id: row.id };
  });
}

export type { Lead };

/**
 * Registre des défis Altcha déjà utilisés (empêche le rejeu d'une preuve de travail), dans la table
 * `processed_events` : valable pour toutes les instances du site.
 */
export function createAltchaStore(db: Database) {
  return {
    async setIfAbsent(key: string): Promise<boolean> {
      return recordEventOnce(db, "altcha", key);
    },
    async get(key: string): Promise<boolean> {
      const rows = await db.execute(
        sql`SELECT 1 FROM processed_events WHERE provider = 'altcha' AND event_id = ${key} LIMIT 1`,
      );
      return rows.length > 0;
    },
    async set(key: string): Promise<void> {
      await recordEventOnce(db, "altcha", key);
    },
  };
}
