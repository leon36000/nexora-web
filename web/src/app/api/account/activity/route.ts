import { handleActivity } from "@/server/gateway/activity-handlers";
import { accountKeysDeps } from "@/server/gateway/deps";

// GET ?period=24h|7d|30d|90d (ou from=…&to=…, 366 jours au plus) &model=&key=&status=ok|error|aborted &limit=&cursor=
//   → 200 { period, filters, summary, breakdown: { models, agents, keys, days }, rows, nextCursor }
//     (avec `cursor` : { period, rows, nextCursor } seulement). Montants en micro-CAD, en chaînes.
//   401 sans session · 403 origine étrangère · 422 paramètre invalide · 429 trop de lectures.
// Métadonnées seulement (table usage_events) : jamais le contenu d'une requête.
export async function GET(request: Request) {
  return handleActivity(request, await accountKeysDeps());
}
