import type { Database } from "@nexora/db";
import { reserve } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { consumeRateLimit } from "../billing/rate-limit";
import { type CatalogVersion, getPublishedCatalog } from "./catalog";
import { E, openAiError } from "./errors";
import { estimateOutputTokens, estimateTokens } from "./estimate";
import { type ApiKeyRow, authenticateApiKey } from "./keys";
import { costMicro, formatMicro, type PerMillion } from "./pricing";
import { type PublicModel, toPublicModel } from "./public";
import type { SnapshotModel, SnapshotProvider } from "./snapshot";
import { finalizeRequest, releaseKeySpend, reserveKeySpend } from "./usage";

/**
 * Couche publique `/v1/*` compatible OpenAI (D1) : authentifie la clé Nexora, réserve le coût
 * maximal au grand livre, appelle LiteLLM sur le réseau interne avec la clé maîtresse (jamais
 * exposée), règle au coût réel d'après l'usage de l'amont et libère le reste.
 *
 * Aucun contenu de requête ni de réponse n'est journalisé ni stocké : seulement des métadonnées.
 */

export interface GatewayDeps {
  db: () => Database;
  fetch: typeof fetch;
  /** null : passerelle non configurée (503). La clé maîtresse ne quitte jamais ce module. */
  litellm: () => { baseUrl: string; masterKey: string } | null;
  log: Logger;
  now: () => Date;
  requestId: () => string;
  limits: {
    defaultRpm: number;
    defaultTpm: number;
    maxBodyBytes: number;
    /** Délai d'une requête non diffusée et d'attente des en-têtes d'un flux. */
    upstreamTimeoutMs: number;
    /** Durée maximale d'un flux complet. */
    streamTimeoutMs: number;
    defaultMaxOutputTokens: number;
  };
}

const CHAT_PARAMS = [
  "messages",
  "temperature",
  "top_p",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "logit_bias",
  "logprobs",
  "top_logprobs",
  "seed",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "response_format",
  "reasoning_effort",
  "functions",
  "function_call",
] as const;
const EMBEDDING_PARAMS = ["input", "encoding_format", "dimensions"] as const;

type Endpoint = "chat.completions" | "embeddings";
type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

const perMillionOf = (m: SnapshotModel): PerMillion => {
  const p = m.price;
  if (!p) throw new Error("modèle publié sans prix");
  return {
    input: BigInt(p.sellInputCadMicro),
    output: BigInt(p.sellOutputCadMicro),
    cache: p.sellCacheCadMicro === null ? null : BigInt(p.sellCacheCadMicro),
  };
};
const upstreamPerMillionOf = (m: SnapshotModel): PerMillion => {
  const p = m.price;
  if (!p) throw new Error("modèle publié sans prix");
  return {
    input: BigInt(p.upstreamInputUsdMicro),
    output: BigInt(p.upstreamOutputUsdMicro),
    cache:
      p.upstreamCacheUsdMicro === null ? null : BigInt(p.upstreamCacheUsdMicro),
  };
};

function keyMayUse(key: ApiKeyRow, model: SnapshotModel): boolean {
  if (key.allowedModels) return key.allowedModels.includes(model.publicId);
  return model.visibility !== "private";
}

function findModel(
  version: CatalogVersion,
  key: ApiKeyRow,
  id: string,
  now: Date,
): { model: SnapshotModel; provider: SnapshotProvider } | null {
  const model = version.snapshot.models.find((m) => m.publicId === id);
  if (!model?.price || !keyMayUse(key, model)) return null;
  if (model.sunsetAt && Date.parse(model.sunsetAt) <= now.getTime())
    return null;
  const provider = version.snapshot.providers.find(
    (p) => p.id === model.providerId,
  );
  if (!provider?.enabled) return null;
  return { model, provider };
}

// ─── GET /v1/models ─────────────────────────────────────────────────────────────

export async function handleModels(
  request: Request,
  deps: GatewayDeps,
): Promise<Response> {
  const db = deps.db();
  try {
    const header = request.headers.get("authorization");
    let key: ApiKeyRow | null = null;
    if (header) {
      const auth = await authenticateApiKey(db, header, deps.now());
      if (!auth.ok) return E.invalidKey(auth.code);
      key = auth.key;
    }
    const version = await getPublishedCatalog(db);
    const lang = (request.headers.get("accept-language") ?? "")
      .toLowerCase()
      .startsWith("en")
      ? "en"
      : "fr";
    const now = deps.now();
    const providers = new Map(
      (version?.snapshot.providers ?? []).map((p) => [p.id, p]),
    );
    const created = Math.floor(
      (version?.publishedAt ?? version?.createdAt ?? now).getTime() / 1000,
    );
    // Sans clé : modèles publics. Avec une clé restreinte : ses modèles. Un modèle privé n'est jamais listé sans autorisation.
    const data = (version?.snapshot.models ?? [])
      .filter((m) => {
        if (!m.price) return false;
        if (m.sunsetAt && Date.parse(m.sunsetAt) <= now.getTime()) return false;
        if (!providers.get(m.providerId)?.enabled) return false;
        return key?.allowedModels
          ? key.allowedModels.includes(m.publicId)
          : m.visibility === "public";
      })
      .map((m) => toPublicModel(m, providers.get(m.providerId)))
      .filter((v): v is PublicModel => v !== null)
      .map((view) => ({
        id: view.id,
        object: "model",
        created,
        owned_by: "nexora",
        name: view.name,
        description: lang === "en" ? view.descriptionEn : view.descriptionFr,
        context_length: view.contextMax,
        max_output_tokens: view.maxOutputTokens,
        type: view.kind,
        residency: view.residency,
        capabilities: view.capabilities,
        pricing: {
          currency: "CAD",
          unit: "per_million_tokens",
          input: view.inputPerMillion,
          output: view.outputPerMillion,
          ...(view.cachePerMillion
            ? { cached_input: view.cachePerMillion }
            : {}),
        },
      }));
    return Response.json(
      { object: "list", data },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    deps.log.error("passerelle : liste des modèles impossible", {
      errorName: errorName(error),
    });
    return openAiError(500, "internal_error", "Erreur interne.", "api_error");
  }
}

const errorName = (e: unknown) => (e instanceof Error ? e.name : typeof e);

// ─── POST /v1/chat/completions et /v1/embeddings ────────────────────────────────

export const handleChatCompletions = (request: Request, deps: GatewayDeps) =>
  handleInference(request, deps, "chat.completions");
export const handleEmbeddings = (request: Request, deps: GatewayDeps) =>
  handleInference(request, deps, "embeddings");

interface Usage {
  prompt: number;
  completion: number;
  cached: number;
}

function readUsage(raw: unknown): Usage | null {
  if (!isObject(raw)) return null;
  const nn = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const prompt = nn(raw.prompt_tokens);
  if (prompt === null) return null;
  const completion =
    nn(raw.completion_tokens) ??
    Math.max(0, (nn(raw.total_tokens) ?? prompt) - prompt);
  const details = isObject(raw.prompt_tokens_details)
    ? raw.prompt_tokens_details
    : {};
  return {
    prompt,
    completion,
    cached: Math.min(nn(details.cached_tokens) ?? 0, prompt),
  };
}

/** Retire de la réponse tout ce qui révèle l'amont : fournisseur, coûts. */
function sanitize(obj: Json, publicId: string): Json {
  delete obj.provider;
  obj.model = publicId;
  if (isObject(obj.usage)) {
    delete obj.usage.cost;
    delete obj.usage.cost_details;
    delete obj.usage.is_byok;
  }
  return obj;
}

async function readBody(
  request: Request,
  max: number,
): Promise<{ ok: true; text: string } | { ok: false; tooLarge: boolean }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max)
    return { ok: false, tooLarge: true };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > max)
    return { ok: false, tooLarge: true };
  return { ok: true, text };
}

interface Plan {
  upstreamBody: Json;
  promptEstimate: number;
  maxOutput: number;
  stream: boolean;
  clientWantsUsage: boolean;
}

function planChat(
  body: Json,
  model: SnapshotModel,
  deps: GatewayDeps,
  rid: Record<string, string>,
): Plan | Response {
  if (model.kind !== "chat")
    return E.badRequest(
      "Ce modèle n'accepte pas /v1/chat/completions.",
      "model_not_supported",
      "model",
      rid,
    );
  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    body.messages.length > 2000
  )
    return E.badRequest(
      "« messages » doit être une liste non vide.",
      "invalid_messages",
      "messages",
      rid,
    );
  if (!body.messages.every((m) => isObject(m) && typeof m.role === "string"))
    return E.badRequest(
      "Chaque message doit avoir un « role ».",
      "invalid_messages",
      "messages",
      rid,
    );
  if (body.n !== undefined && body.n !== 1)
    return E.badRequest(
      "Seul n = 1 est pris en charge.",
      "unsupported_parameter",
      "n",
      rid,
    );
  if (body.stream !== undefined && typeof body.stream !== "boolean")
    return E.badRequest(
      "« stream » doit être un booléen.",
      "invalid_stream",
      "stream",
      rid,
    );
  const requestedMax = body.max_completion_tokens ?? body.max_tokens;
  if (requestedMax !== undefined && !isPositiveInt(requestedMax))
    return E.badRequest(
      "« max_tokens » doit être un entier positif.",
      "invalid_max_tokens",
      "max_tokens",
      rid,
    );
  const stream = body.stream === true;
  const clientWantsUsage =
    isObject(body.stream_options) && body.stream_options.include_usage === true;

  const promptEstimate = estimateTokens({
    messages: body.messages,
    tools: body.tools,
    functions: body.functions,
  });
  const modelCap = Math.min(
    model.maxOutputTokens ?? deps.limits.defaultMaxOutputTokens,
    model.contextMax,
  );
  const room = model.contextMax - promptEstimate;
  if (room <= 0)
    return E.badRequest(
      `La requête dépasse le contexte du modèle (${model.contextMax} jetons).`,
      "context_length_exceeded",
      "messages",
      rid,
    );
  let maxOutput: number;
  if (requestedMax !== undefined) {
    if (requestedMax > modelCap)
      return E.badRequest(
        `« max_tokens » dépasse le plafond de ce modèle (${modelCap}).`,
        "invalid_max_tokens",
        "max_tokens",
        rid,
      );
    if (requestedMax > room)
      return E.badRequest(
        `La requête et « max_tokens » dépassent le contexte du modèle (${model.contextMax} jetons).`,
        "context_length_exceeded",
        "max_tokens",
        rid,
      );
    maxOutput = requestedMax;
  } else {
    maxOutput = Math.min(modelCap, room);
  }

  const upstreamBody: Json = {};
  for (const name of CHAT_PARAMS)
    if (body[name] !== undefined) upstreamBody[name] = body[name];
  upstreamBody.model = model.publicId;
  // Le plafond de sortie est TOUJOURS transmis : il borne le coût au montant réservé.
  upstreamBody.max_tokens = maxOutput;
  if (stream) {
    upstreamBody.stream = true;
    upstreamBody.stream_options = { include_usage: true };
  }
  return { upstreamBody, promptEstimate, maxOutput, stream, clientWantsUsage };
}

function planEmbedding(
  body: Json,
  model: SnapshotModel,
  rid: Record<string, string>,
): Plan | Response {
  if (model.kind !== "embedding")
    return E.badRequest(
      "Ce modèle n'accepte pas /v1/embeddings.",
      "model_not_supported",
      "model",
      rid,
    );
  const input = body.input;
  const okItem = (v: unknown) => typeof v === "string" && v.length > 0;
  const valid =
    okItem(input) ||
    (Array.isArray(input) &&
      input.length > 0 &&
      input.length <= 2048 &&
      input.every(
        (v) =>
          okItem(v) ||
          (Array.isArray(v) && v.every((n) => Number.isInteger(n))),
      ));
  if (!valid)
    return E.badRequest(
      "« input » doit être un texte ou une liste de textes.",
      "invalid_input",
      "input",
      rid,
    );
  const promptEstimate = estimateTokens(input);
  if (
    promptEstimate >
    model.contextMax * (Array.isArray(input) ? input.length : 1)
  )
    return E.badRequest(
      "L'entrée dépasse le contexte du modèle.",
      "context_length_exceeded",
      "input",
      rid,
    );
  const upstreamBody: Json = {};
  for (const name of EMBEDDING_PARAMS)
    if (body[name] !== undefined) upstreamBody[name] = body[name];
  upstreamBody.model = model.publicId;
  return {
    upstreamBody,
    promptEstimate,
    maxOutput: 0,
    stream: false,
    clientWantsUsage: false,
  };
}

async function handleInference(
  request: Request,
  deps: GatewayDeps,
  endpoint: Endpoint,
): Promise<Response> {
  const started = performance.now();
  const requestId = deps.requestId();
  const rid = { "x-request-id": requestId };
  const lit = deps.litellm();
  if (!lit) return E.unavailable(rid);

  // État à compenser si une étape échoue après une réservation.
  let db: Database | undefined;
  let key: ApiKeyRow | undefined;
  let reservation: { id: string; amount: bigint } | undefined;
  let keyReserved = false;
  let settled = false;
  let version: CatalogVersion | undefined;
  let model: SnapshotModel | undefined;
  let streamHandedOff = false;
  let pendingAmount: bigint | undefined;

  const finalize = async (input: {
    status: "ok" | "error" | "aborted";
    httpStatus: number;
    errorCode?: string;
    tokens: Usage;
    stream: boolean;
  }) => {
    if (settled || !db || !key || !reservation || !version || !model)
      return null;
    const result = await finalizeRequest(db, {
      requestId,
      organizationId: key.organizationId,
      apiKeyId: key.id,
      modelPublicId: model.publicId,
      endpoint,
      configVersion: version.short,
      stream: input.stream,
      status: input.status,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      tokens: input.tokens,
      price: perMillionOf(model),
      upstreamPrice: upstreamPerMillionOf(model),
      reservationId: reservation.id,
      reservedMicro: reservation.amount,
      keyReserved,
      latencyMs: Math.round(performance.now() - started),
    });
    settled = true;
    return result;
  };

  try {
    db = deps.db();
    const auth = await authenticateApiKey(
      db,
      request.headers.get("authorization"),
      deps.now(),
    );
    if (!auth.ok) return E.invalidKey(auth.code, rid);
    key = auth.key;

    // Limite de requêtes par minute (fenêtre fixe, partagée entre instances).
    const rpm = key.rpmLimit ?? deps.limits.defaultRpm;
    const rl = await consumeRateLimit(db, `gw:rpm:${key.id}`, {
      limit: rpm,
      windowSeconds: 60,
      now: deps.now(),
    });
    const rateHeaders = {
      ...rid,
      "x-ratelimit-limit-requests": String(rpm),
      "x-ratelimit-remaining-requests": String(Math.max(0, rpm - rl.count)),
      "x-ratelimit-reset-requests": `${rl.retryAfterSeconds}s`,
    };
    if (!rl.allowed)
      return E.rateLimited({
        ...rateHeaders,
        "retry-after": String(rl.retryAfterSeconds),
      });

    const read = await readBody(request, deps.limits.maxBodyBytes);
    if (!read.ok) return E.tooLarge(rateHeaders);
    let parsed: unknown;
    try {
      parsed = JSON.parse(read.text);
    } catch {
      return E.badRequest(
        "Le corps doit être un JSON valide.",
        "invalid_json",
        null,
        rateHeaders,
      );
    }
    if (
      !isObject(parsed) ||
      typeof parsed.model !== "string" ||
      parsed.model.length === 0
    )
      return E.badRequest(
        "Le champ « model » est obligatoire.",
        "missing_model",
        "model",
        rateHeaders,
      );

    version = (await getPublishedCatalog(db)) ?? undefined;
    const found = version
      ? findModel(version, key, parsed.model, deps.now())
      : null;
    if (!version || !found) return E.modelNotFound(parsed.model, rateHeaders);
    model = found.model;

    const plan =
      endpoint === "chat.completions"
        ? planChat(parsed, model, deps, rateHeaders)
        : planEmbedding(parsed, model, rateHeaders);
    if (plan instanceof Response) return plan;

    const tpm = key.tpmLimit ?? deps.limits.defaultTpm;
    const estimatedTokens = plan.promptEstimate + plan.maxOutput;
    const tl = await consumeRateLimit(db, `gw:tpm:${key.id}`, {
      limit: tpm,
      windowSeconds: 60,
      cost: estimatedTokens,
      now: deps.now(),
    });
    if (!tl.allowed)
      return E.rateLimited({
        ...rateHeaders,
        "retry-after": String(tl.retryAfterSeconds),
        "x-ratelimit-limit-tokens": String(tpm),
        "x-ratelimit-remaining-tokens": String(Math.max(0, tpm - tl.count)),
        "x-ratelimit-reset-tokens": `${tl.retryAfterSeconds}s`,
      });

    // Coût maximal : jetons d'entrée estimés + sortie bornée, au prix publié.
    const price = perMillionOf(model);
    const maxCost =
      costMicro(plan.promptEstimate, price.input) +
      costMicro(plan.maxOutput, price.output);
    const amount = maxCost > 0n ? maxCost : 1n;
    pendingAmount = amount;

    if (key.spendCapMicro !== null) {
      keyReserved = await reserveKeySpend(db, key.id, amount);
      if (!keyReserved) return E.keyCap(rateHeaders);
    }
    const reserved = await reserve(db, {
      organizationId: key.organizationId,
      amountMicro: amount,
      idempotencyKey: `gw:${requestId}`,
      configVersion: version.short,
    });
    if (
      reserved.status === "insufficient_funds" ||
      reserved.status === "blocked"
    ) {
      if (keyReserved) await releaseKeySpend(db, key.id, amount);
      keyReserved = false;
      return reserved.status === "blocked"
        ? E.blocked(rateHeaders)
        : E.insufficient(rateHeaders);
    }
    reservation = { id: reserved.reservation.id, amount };

    const headers: Record<string, string> = {
      ...rateHeaders,
      "x-nexora-model": model.publicId,
      "x-nexora-residency": model.residency,
      "x-nexora-catalog-version": version.short,
    };

    // Appel de LiteLLM (réseau interne, clé maîtresse). Le client ne la voit jamais.
    const upstreamAbort = new AbortController();
    const signal = AbortSignal.any([
      request.signal,
      upstreamAbort.signal,
      AbortSignal.timeout(
        plan.stream
          ? deps.limits.streamTimeoutMs
          : deps.limits.upstreamTimeoutMs,
      ),
    ]);
    let upstream: Response;
    try {
      upstream = await deps.fetch(
        `${lit.baseUrl.replace(/\/+$/, "")}/v1/${endpoint === "chat.completions" ? "chat/completions" : "embeddings"}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${lit.masterKey}`,
            "content-type": "application/json",
            accept: plan.stream ? "text/event-stream" : "application/json",
          },
          body: JSON.stringify(plan.upstreamBody),
          signal,
        },
      );
    } catch {
      const aborted = request.signal.aborted;
      await finalize({
        status: aborted ? "aborted" : "error",
        httpStatus: aborted ? 499 : 502,
        errorCode: aborted ? "client_closed" : "upstream_unreachable",
        tokens: { prompt: 0, completion: 0, cached: 0 },
        stream: plan.stream,
      });
      return aborted
        ? new Response(null, { status: 499 })
        : E.upstream(
            502,
            "upstream_unavailable",
            "Le fournisseur du modèle est injoignable.",
            headers,
          );
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      const mapped = mapUpstreamFailure(upstream.status, text, headers);
      await finalize({
        status: "error",
        httpStatus: mapped.status,
        errorCode: mapped.headers.get("x-nexora-error") ?? "upstream_error",
        tokens: { prompt: 0, completion: 0, cached: 0 },
        stream: plan.stream,
      });
      return mapped;
    }

    if (plan.stream && upstream.body) {
      streamHandedOff = true;
      return streamResponse({
        upstream,
        plan,
        deps,
        headers,
        model,
        finalize,
        upstreamAbort,
        started,
        requestId,
        key,
        version,
      });
    }

    // Réponse complète.
    let json: unknown;
    try {
      json = JSON.parse(await upstream.text());
    } catch {
      json = null;
    }
    if (!isObject(json)) {
      await finalize({
        status: "error",
        httpStatus: 502,
        errorCode: "invalid_upstream_response",
        tokens: { prompt: 0, completion: 0, cached: 0 },
        stream: false,
      });
      return E.upstream(
        502,
        "invalid_upstream_response",
        "Réponse invalide du fournisseur du modèle.",
        headers,
      );
    }
    const usage = readUsage(json.usage) ?? {
      prompt: plan.promptEstimate,
      completion: estimateOutputTokens(contentChars(json)),
      cached: 0,
    };
    const result = await finalize({
      status: "ok",
      httpStatus: 200,
      tokens: usage,
      stream: false,
    });
    const clean = sanitize(json, model.publicId);
    logDone(deps, {
      requestId,
      key,
      model,
      version,
      endpoint,
      status: "ok",
      httpStatus: 200,
      usage,
      cost: result?.costMicro,
      started,
    });
    return new Response(JSON.stringify(clean), {
      status: 200,
      headers: {
        ...headers,
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-nexora-cost-micro": String(result?.costMicro ?? 0n),
      },
    });
  } catch (error) {
    deps.log.error("passerelle : erreur interne", {
      requestId,
      errorName: errorName(error),
    });
    // Compensation : rien ne doit rester réservé si l'on n'a pas pu servir la requête.
    if (
      !streamHandedOff &&
      !settled &&
      db &&
      key &&
      reservation &&
      version &&
      model
    ) {
      try {
        await finalize({
          status: "error",
          httpStatus: 500,
          errorCode: "internal_error",
          tokens: { prompt: 0, completion: 0, cached: 0 },
          stream: false,
        });
      } catch (e) {
        deps.log.error("passerelle : libération impossible", {
          requestId,
          errorName: errorName(e),
        });
      }
    } else if (
      !streamHandedOff &&
      !settled &&
      db &&
      key &&
      keyReserved &&
      !reservation &&
      pendingAmount
    ) {
      await releaseKeySpend(db, key.id, pendingAmount).catch(() => undefined);
    }
    return openAiError(
      500,
      "internal_error",
      "Erreur interne de la passerelle.",
      "api_error",
      rid,
    );
  }
}

function contentChars(json: Json): number {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  let n = 0;
  for (const c of choices) {
    const msg = isObject(c) && isObject(c.message) ? c.message : {};
    for (const f of ["content", "reasoning_content"] as const)
      if (typeof msg[f] === "string") n += (msg[f] as string).length;
  }
  return n;
}

function mapUpstreamFailure(
  status: number,
  text: string,
  headers: Record<string, string>,
): Response {
  let message = "";
  try {
    const j = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof j.error?.message === "string")
      message = j.error.message.slice(0, 300);
  } catch {
    message = "";
  }
  const tag = (res: Response, code: string) => {
    res.headers.set("x-nexora-error", code);
    return res;
  };
  if (status === 400 || status === 422)
    return tag(
      E.badRequest(
        message || "Requête refusée par le fournisseur du modèle.",
        "upstream_rejected",
        null,
        headers,
      ),
      "upstream_rejected",
    );
  if (status === 404)
    return tag(
      E.upstream(
        503,
        "model_unavailable",
        "Ce modèle n'est pas disponible pour le moment.",
        headers,
      ),
      "model_unavailable",
    );
  if (status === 429)
    return tag(
      E.upstream(
        503,
        "upstream_overloaded",
        "Le fournisseur du modèle est saturé. Réessayez dans un instant.",
        { ...headers, "retry-after": "5" },
      ),
      "upstream_overloaded",
    );
  return tag(
    E.upstream(
      502,
      "upstream_error",
      "Le fournisseur du modèle a répondu par une erreur.",
      headers,
    ),
    "upstream_error",
  );
}

function logDone(
  deps: GatewayDeps,
  f: {
    requestId: string;
    key: ApiKeyRow;
    model: SnapshotModel;
    version: CatalogVersion;
    endpoint: Endpoint;
    status: string;
    httpStatus: number;
    usage: Usage;
    cost: bigint | undefined;
    started: number;
  },
): void {
  // Métadonnées seulement : jamais de contenu, de clé ni d'adresse.
  deps.log.info("passerelle : requête réglée", {
    requestId: f.requestId,
    apiKeyId: f.key.id,
    organizationId: f.key.organizationId,
    model: f.model.publicId,
    endpoint: f.endpoint,
    catalog: f.version.short,
    status: f.status,
    httpStatus: f.httpStatus,
    promptTokens: f.usage.prompt,
    completionTokens: f.usage.completion,
    cachedTokens: f.usage.cached,
    costMicro: f.cost?.toString(),
    costDisplay: f.cost === undefined ? undefined : formatMicro(f.cost),
    latencyMs: Math.round(performance.now() - f.started),
  });
}

// ─── Flux SSE ───────────────────────────────────────────────────────────────────

function streamResponse(ctx: {
  upstream: Response;
  plan: Plan;
  deps: GatewayDeps;
  headers: Record<string, string>;
  model: SnapshotModel;
  finalize: (i: {
    status: "ok" | "error" | "aborted";
    httpStatus: number;
    errorCode?: string;
    tokens: Usage;
    stream: boolean;
  }) => Promise<{ costMicro: bigint; replayed: boolean } | null>;
  upstreamAbort: AbortController;
  started: number;
  requestId: string;
  key: ApiKeyRow;
  version: CatalogVersion;
}): Response {
  const { plan, deps, model } = ctx;
  const upstreamBody = ctx.upstream.body;
  if (!upstreamBody) throw new Error("flux amont absent");
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: Usage | null = null;
  let chars = 0;
  let closed = false;

  const settle = async (outcome: "done" | "cancelled" | "failed") => {
    if (closed) return;
    closed = true;
    try {
      let status: "ok" | "error" | "aborted";
      let tokens: Usage;
      if (usage) {
        status = outcome === "done" ? "ok" : "aborted";
        tokens = usage;
      } else if (chars > 0) {
        // Flux interrompu sans usage : on facture ce qui a été livré, estimé par prudence.
        status = "aborted";
        tokens = {
          prompt: plan.promptEstimate,
          completion: estimateOutputTokens(chars),
          cached: 0,
        };
      } else {
        // Rien n'a été livré : rien n'est facturé, la réservation est libérée.
        status = "error";
        tokens = { prompt: 0, completion: 0, cached: 0 };
      }
      const result = await ctx.finalize({
        status,
        httpStatus: status === "error" ? 502 : 200,
        errorCode:
          status === "ok"
            ? undefined
            : outcome === "cancelled"
              ? "client_closed"
              : "upstream_interrupted",
        tokens,
        stream: true,
      });
      logDone(deps, {
        requestId: ctx.requestId,
        key: ctx.key,
        model,
        version: ctx.version,
        endpoint: "chat.completions",
        status,
        httpStatus: 200,
        usage: tokens,
        cost: result?.costMicro,
        started: ctx.started,
      });
    } catch (error) {
      deps.log.error("passerelle : règlement du flux impossible", {
        requestId: ctx.requestId,
        errorName: errorName(error),
      });
    }
  };

  /** Traite un événement SSE complet ; renvoie le texte à transmettre au client (ou null). */
  const processEvent = (event: string): string | null => {
    const dataLines = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""));
    if (dataLines.length === 0) return `${event}\n\n`;
    const payload = dataLines.join("\n");
    if (payload.trim() === "[DONE]") return "data: [DONE]\n\n";
    let obj: unknown;
    try {
      obj = JSON.parse(payload);
    } catch {
      return null; // fragment illisible : on ne transmet pas ce qu'on ne comprend pas
    }
    if (!isObject(obj)) return null;
    const u = readUsage(obj.usage);
    if (u) usage = u;
    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    for (const c of choices) {
      const delta = isObject(c) && isObject(c.delta) ? c.delta : {};
      for (const f of ["content", "reasoning_content"] as const)
        if (typeof delta[f] === "string") chars += (delta[f] as string).length;
    }
    // Le client n'a pas demandé l'usage : on garde pour nous le dernier fragment (sans choix).
    if (u && choices.length === 0 && !plan.clientWantsUsage) return null;
    return `data: ${JSON.stringify(sanitize(obj, model.publicId))}\n\n`;
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim().length > 0) {
            const out = processEvent(buffer);
            if (out) controller.enqueue(encoder.encode(out));
          }
          await settle(usage ? "done" : "failed");
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        let out = "";
        for (const part of parts) {
          if (part.trim().length === 0) continue;
          const piece = processEvent(part);
          if (piece) out += piece;
        }
        if (out) controller.enqueue(encoder.encode(out));
      } catch {
        // Coupure de l'amont en cours de flux.
        const failed = usage === null;
        await settle(failed ? "failed" : "done");
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: { message: "Le flux a été interrompu par le fournisseur du modèle.", type: "api_error", param: null, code: "upstream_interrupted" } })}\n\n`,
            ),
          );
          controller.close();
        } catch {
          /* flux déjà fermé */
        }
      }
    },
    async cancel() {
      // Le client a fermé la connexion : on coupe l'amont (le coût s'arrête) puis on règle.
      ctx.upstreamAbort.abort();
      await reader.cancel().catch(() => undefined);
      await settle("cancelled");
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...ctx.headers,
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
