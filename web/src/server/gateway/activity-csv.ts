import type { ActivityRow } from "./activity";

/**
 * Export CSV du journal d'activité. Deux garanties :
 *  - les montants sont des micro-CAD (`bigint`) formatés exactement, sans passer par un nombre à virgule flottante ;
 *  - toute cellule de TEXTE qui commence par = + - @ tabulation ou retour chariot reçoit une apostrophe devant :
 *    un tableur n'exécute jamais une formule venue d'un nom de clé ou d'un code d'erreur (injection de formules).
 * Le fichier est en UTF-8 avec marque d'ordre des octets (accents corrects dans Excel), séparé par des virgules,
 * lignes terminées par CRLF (RFC 4180).
 */

export const CSV_BOM = "\uFEFF";

/** Colonnes, dans l'ordre. Noms stables : ils ne suivent pas la langue de l'interface. */
export const ACTIVITY_CSV_COLUMNS = [
  "created_at",
  "request_id",
  "model",
  "endpoint",
  "api_key_name",
  "api_key_prefix",
  "status",
  "http_status",
  "error_code",
  "stream",
  "prompt_tokens",
  "completion_tokens",
  "cached_tokens",
  "reasoning_tokens",
  "cost_cad",
  "value_cad",
  "billed",
  "latency_ms",
] as const;

/** Montant en micro-CAD vers « 1234.567890 » : six décimales, calcul entier, signe conservé. */
export function formatMicroDecimal(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / 1_000_000n;
  const fraction = (abs % 1_000_000n).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** Cellule de texte : protégée contre les formules, puis entre guillemets si elle contient `,` `"` ou un saut de ligne. */
export function csvText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const csvNumber = (value: number | bigint) => value.toString();
const csvBoolean = (value: boolean) => (value ? "true" : "false");

const EOL = "\r\n";

export function activityCsvHeader(): string {
  return `${ACTIVITY_CSV_COLUMNS.join(",")}${EOL}`;
}

export function activityCsvRow(row: ActivityRow): string {
  return `${[
    row.createdAt.toISOString(),
    csvText(row.requestId),
    csvText(row.model),
    csvText(row.endpoint),
    csvText(row.apiKeyName),
    csvText(row.apiKeyPrefix),
    csvText(row.status),
    csvNumber(row.httpStatus),
    csvText(row.errorCode),
    csvBoolean(row.stream),
    csvNumber(row.promptTokens),
    csvNumber(row.completionTokens),
    csvNumber(row.cachedTokens),
    csvNumber(row.reasoningTokens),
    formatMicroDecimal(row.costMicro),
    formatMicroDecimal(row.valueMicro),
    csvBoolean(row.billed),
    csvNumber(row.latencyMs),
  ].join(",")}${EOL}`;
}
