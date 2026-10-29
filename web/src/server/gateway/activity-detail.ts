import { type Database, sql, type UsageStatus } from "@nexora/db";

/**
 * Détail d'UNE requête de l'historique du client (page `/compte/activite/<id>`). Métadonnées de `usage_events`
 * seulement : jamais le contenu de la requête ni de la réponse. La liste des champs est fermée : le coût amont, la
 * route de secours et les versions internes de catalogue et de politique ne sont pas rendus. L'organisation vient de
 * la session ; une requête d'une autre organisation est introuvable.
 */
export interface ActivityDetail {
  id: string;
  requestId: string;
  createdAt: Date;
  model: string;
  endpoint: string;
  apiKeyId: string;
  apiKeyName: string;
  apiKeyPrefix: string;
  status: UsageStatus;
  httpStatus: number;
  errorCode: string | null;
  stream: boolean;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costMicro: bigint;
  valueMicro: bigint;
  billed: boolean;
  /** Prix par million appliqués à cette requête (micro-CAD). */
  priceInputMicro: bigint;
  priceOutputMicro: bigint;
  priceCacheMicro: bigint | null;
  priceCacheWriteMicro: bigint | null;
  priceWindow: string | null;
  latencyMs: number;
  /** Décision de Nexora Privacy Router : `allow` ou `mask` (ou null avant son arrivée). */
  privacyDecision: string | null;
  /** WebPilot : hôte visité (jamais l'adresse complète). */
  destinationHost: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Raw = {
  id: string;
  request_id: string;
  ts: string;
  model: string;
  endpoint: string;
  key_id: string;
  key_name: string | null;
  key_prefix: string | null;
  status: UsageStatus;
  http_status: number;
  error_code: string | null;
  stream: boolean;
  prompt: number;
  completion: number;
  cached: number;
  cache_write: number;
  reasoning: number;
  cost: string;
  value: string;
  billed: boolean;
  p_in: string;
  p_out: string;
  p_cache: string | null;
  p_cache_write: string | null;
  window: string | null;
  latency: number;
  privacy: string | null;
  host: string | null;
};

export async function getActivityDetail(
  db: Database,
  organizationId: string,
  id: string,
): Promise<ActivityDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const rows = await db.execute<Raw>(sql`
    SELECT e.id::text AS id,
           e.request_id,
           to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ts,
           e.model_public_id AS model,
           e.endpoint,
           e.api_key_id::text AS key_id,
           k.name AS key_name,
           k.prefix AS key_prefix,
           e.status,
           e.http_status,
           e.error_code,
           e.stream,
           e.prompt_tokens AS prompt,
           e.completion_tokens AS completion,
           e.cached_tokens AS cached,
           e.cache_write_tokens AS cache_write,
           e.reasoning_tokens AS reasoning,
           e.cost_micro::text AS cost,
           e.value_micro::text AS value,
           e.billed,
           e.price_input_micro::text AS p_in,
           e.price_output_micro::text AS p_out,
           e.price_cache_micro::text AS p_cache,
           e.price_cache_write_micro::text AS p_cache_write,
           e.price_window AS window,
           e.latency_ms AS latency,
           e.privacy_decision AS privacy,
           e.destination_host AS host
    FROM usage_events e
    LEFT JOIN api_keys k ON k.id = e.api_key_id AND k.organization_id = e.organization_id
    WHERE e.organization_id = ${organizationId} AND e.id = ${id.toLowerCase()}::uuid
  `);
  const r = [...rows][0];
  if (!r) return null;
  return {
    id: r.id,
    requestId: r.request_id,
    createdAt: new Date(r.ts),
    model: r.model,
    endpoint: r.endpoint,
    apiKeyId: r.key_id,
    apiKeyName: r.key_name ?? r.key_id,
    apiKeyPrefix: r.key_prefix ?? "",
    status: r.status,
    httpStatus: r.http_status,
    errorCode: r.error_code,
    stream: r.stream,
    promptTokens: r.prompt,
    completionTokens: r.completion,
    cachedTokens: r.cached,
    cacheWriteTokens: r.cache_write,
    reasoningTokens: r.reasoning,
    costMicro: BigInt(r.cost),
    valueMicro: BigInt(r.value),
    billed: r.billed,
    priceInputMicro: BigInt(r.p_in),
    priceOutputMicro: BigInt(r.p_out),
    priceCacheMicro: r.p_cache === null ? null : BigInt(r.p_cache),
    priceCacheWriteMicro:
      r.p_cache_write === null ? null : BigInt(r.p_cache_write),
    priceWindow: r.window,
    latencyMs: r.latency,
    privacyDecision: r.privacy,
    destinationHost: r.host,
  };
}
