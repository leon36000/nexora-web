import type { Database } from "./client.ts";
import { processedEvents } from "./schema.ts";

/**
 * Enregistre un événement de fournisseur (webhook) et indique s'il est nouveau.
 * `true` = premier passage : le traiter ; `false` = déjà traité : ne rien refaire (D7).
 * Pour un effet atomique, appeler dans la même transaction que le traitement.
 */
export async function recordEventOnce(
  db: Pick<Database, "insert">,
  provider: string,
  eventId: string,
): Promise<boolean> {
  const rows = await db
    .insert(processedEvents)
    .values({ provider, eventId })
    .onConflictDoNothing({
      target: [processedEvents.provider, processedEvents.eventId],
    })
    .returning({ id: processedEvents.id });
  return rows.length === 1;
}
