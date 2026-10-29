import type { UsageStatus } from "@nexora/db";
import type { ActivityPeriod } from "@/server/gateway/activity";

/**
 * Adresse (partie `?…`) de la page d'activité et de l'export CSV, à partir des critères choisis. Page, API et
 * export parlent le même vocabulaire : `period` OU `from` et `to`, `model`, `key`, `status`, `cursor`.
 */
export function activityQuery(input: {
  period: ActivityPeriod | "custom";
  from?: Date;
  to?: Date;
  model?: string;
  apiKeyId?: string;
  status?: UsageStatus;
  cursor?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.period === "custom" && input.from && input.to) {
    params.set("from", input.from.toISOString());
    params.set("to", input.to.toISOString());
  } else if (input.period !== "custom") {
    params.set("period", input.period);
  }
  if (input.model) params.set("model", input.model);
  if (input.apiKeyId) params.set("key", input.apiKeyId);
  if (input.status) params.set("status", input.status);
  if (input.cursor) params.set("cursor", input.cursor);
  return params.toString();
}
