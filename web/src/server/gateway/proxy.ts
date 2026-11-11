import { createHash, randomUUID } from "node:crypto";
import type { Database, UsageSource } from "@nexora/db";
import { recordIntent, reserve, usdToNano } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { readLimitedBytes } from "@nexora/net";
import { parseRerankResults } from "@nexora/rag";
import { envSecretHostCheck, type SecretHostCheck } from "@nexora/vault/scope";
import {
  AGENT_PUBLIC_PREFIX,
  type CallableAgent,
  findCallableAgent,
  listCallableAgents,
} from "../agents/catalog";
import { consumeRateLimit } from "../billing/rate-limit";
import type { PrivacyRouter } from "../privacy/types";
import { type CatalogVersion, getPublishedCatalog } from "./catalog";
import { E, openAiError } from "./errors";
import { estimateOutputTokens, estimateTokens } from "./estimate";
import { billingModeOf } from "./house";
import { type InflightEntry, trackInflight } from "./inflight";
import { type ApiKeyRow, type AuthResult, authenticateApiKey } from "./keys";
import { routePositionOf } from "./litellm";
import {
  activeWindow,
  costMicro,
  formatMicro,
  type PerMillion,
  requestCost,
  requestCostNano,
} from "./pricing";
import { applyPrivacy } from "./privacy-gate";
import { type PublicModel, toPublicModel } from "./public";
import type {
  SnapshotModel,
  SnapshotProvider,
  SnapshotRoute,
} from "./snapshot";
import {
  finalizeHouseRequest,
  finalizeRequest,
  type UpstreamTrace,
} from "./usage";

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
  /** Valeur d'un secret du coffre (clé d'espace WorkStudio des agents hébergés) ; absent : agents indisponibles. */
  getSecret?: (ref: string) => Promise<string>;
  /** Hôtes où la clé d'espace peut partir (R9) ; défaut : NEXORA_SECRET_HOSTS_WORKSTUDIO de l'environnement. */
  secretHosts?: SecretHostCheck;
  /**
   * Nexora Privacy Router : évalue chaque requête AVANT l'estimation, la réservation et l'appel amont (masquage,
   * refus 403, ou 503 si la couche ne répond pas). Obligatoire : aucune requête ne part sans lui (échec fermé).
   */
  privacy: PrivacyRouter;
  /**
   * Authentification fournie par l'appelant, à la place de la lecture de l'en-tête `Authorization`. Réservée aux
   * appels INTERNES du site (le RAG, qui a déjà authentifié la clé du client ou résolu celle de la base) : tout le
   * reste du cycle (limites, Privacy Router, réservation, règlement, Activité) est identique. Jamais branchée sur
   * une route publique.
   */
  authenticate?: (request: Request) => Promise<AuthResult>;
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
    /** Appels à GET /v1/models par minute et par adresse client (défaut : 120). */
    modelsPerMinute?: number;
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

type Endpoint = "chat.completions" | "embeddings" | "rerank";
type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

/**
 * Prix de vente et coût amont en vigueur à `at` : le prix de base, ou celui de la plage horaire UTC qui couvre
 * l'instant. Fixé au début de la requête et conservé jusqu'au règlement (une requête qui traverse une limite
 * de plage garde son prix de départ).
 */
function pricesAt(
  m: SnapshotModel,
  at: Date,
): { price: PerMillion; upstreamPrice: PerMillion; window: string | null } {
  const p = m.price;
  if (!p) throw new Error("modèle publié sans prix");
  const opt = (v: string | null | undefined) =>
    v === null || v === undefined ? null : BigInt(v);
  const w = activeWindow(p.windows ?? [], at);
  if (w)
    return {
      price: {
        input: BigInt(w.sell.input),
        output: BigInt(w.sell.output),
        cache: opt(w.sell.cache),
        cacheWrite: opt(w.sell.cacheWrite),
      },
      upstreamPrice: {
        input: BigInt(w.upstream.input),
        output: BigInt(w.upstream.output),
        cache: opt(w.upstream.cache),
        cacheWrite: opt(w.upstream.cacheWrite),
      },
      window: w.label,
    };
  return {
    price: {
      input: BigInt(p.sellInputCadMicro),
      output: BigInt(p.sellOutputCadMicro),
      cache: opt(p.sellCacheCadMicro),
      cacheWrite: opt(p.sellCacheWriteCadMicro),
    },
    upstreamPrice: {
      input: BigInt(p.upstreamInputUsdMicro),
      output: BigInt(p.upstreamOutputUsdMicro),
      cache: opt(p.upstreamCacheUsdMicro),
      cacheWrite: opt(p.upstreamCacheWriteUsdMicro),
    },
    window: null,
  };
}

/**
 * Coût amont de la requête : le prix de la route qui a servi si elle a le sien, sinon celui du modèle (au tarif
 * de la plage horaire en vigueur au départ). Une route inconnue (version de catalogue changée en cours de
 * route) retombe sur le prix du modèle.
 */
function routeUpstreamPrice(target: Target, position: number): PerMillion {
  const route =
    position > 0
      ? target.routes.find((r) => r.position === position)
      : undefined;
  if (!route?.upstream) return target.upstreamPrice;
  return {
    input: BigInt(route.upstream.input),
    output: BigInt(route.upstream.output),
    cache: route.upstream.cache === null ? null : BigInt(route.upstream.cache),
  };
}

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

/** Durée du cache mémoire de la liste (catalogue publié + agents) : borne les lectures de la base. */
const MODELS_CACHE_MS = 20_000;
/** Durée annoncée aux caches HTTP (secondes). */
const MODELS_MAX_AGE_SECONDS = 30;
const DEFAULT_MODELS_PER_MINUTE = 120;

interface ModelsSource {
  version: CatalogVersion | null;
  agents: CallableAgent[];
  expiresAt: number;
}
let modelsSources = new WeakMap<object, ModelsSource>();

/** Vide le cache mémoire de la liste des modèles (tests). */
export function resetModelsCache(): void {
  modelsSources = new WeakMap();
}

async function readModelsSource(
  db: Database,
  now: Date,
): Promise<ModelsSource> {
  const cached = modelsSources.get(db);
  if (cached && cached.expiresAt > now.getTime()) return cached;
  const fresh: ModelsSource = {
    version: await getPublishedCatalog(db),
    agents: await listCallableAgents(db, now),
    expiresAt: now.getTime() + MODELS_CACHE_MS,
  };
  modelsSources.set(db, fresh);
  return fresh;
}

/** Empreinte courte de l'adresse du client (premier élément de x-forwarded-for) : jamais l'adresse elle-même. */
function clientAddressKey(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "inconnu";
  return createHash("sha256")
    .update(`gw-models|${ip}`)
    .digest("hex")
    .slice(0, 16);
}

export async function handleModels(
  request: Request,
  deps: GatewayDeps,
): Promise<Response> {
  const db = deps.db();
  try {
    // Route publique : limite par adresse, avant toute lecture (aussi pour les clés invalides).
    const limit = deps.limits.modelsPerMinute ?? DEFAULT_MODELS_PER_MINUTE;
    const rl = await consumeRateLimit(
      db,
      `gw:models:${clientAddressKey(request)}`,
      { limit, windowSeconds: 60, now: deps.now() },
    );
    if (!rl.allowed)
      return E.rateLimited({ "retry-after": String(rl.retryAfterSeconds) });
    const header = request.headers.get("authorization");
    let key: ApiKeyRow | null = null;
    if (header) {
      const auth = await authenticateApiKey(db, header, deps.now());
      if (!auth.ok) return E.invalidKey(auth.code);
      key = auth.key;
    }
    const source = await readModelsSource(db, deps.now());
    const version = source.version;
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
    const modelData = (version?.snapshot.models ?? [])
      .filter((m) => {
        if (!m.price) return false;
        if (m.sunsetAt && Date.parse(m.sunsetAt) <= now.getTime()) return false;
        if (!providers.get(m.providerId)?.enabled) return false;
        // Un modèle en aperçu n'est pas appelable : il reste au catalogue public (pages), pas dans cette liste.
        if (m.availability === "preview") return false;
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
          ...(view.cacheWritePerMillion
            ? { cache_write: view.cacheWritePerMillion }
            : {}),
          ...(view.priceWindows.length > 0
            ? {
                windows: view.priceWindows.map((w) => ({
                  label: w.label,
                  days: w.days,
                  start_minute: w.startMinute,
                  end_minute: w.endMinute,
                  input: w.inputPerMillion,
                  output: w.outputPerMillion,
                  ...(w.cachePerMillion
                    ? { cached_input: w.cachePerMillion }
                    : {}),
                })),
              }
            : {}),
        },
        sheet: view.sheet,
      }));
    // Agents hébergés : mêmes règles d'accès que les modèles (clé restreinte → sa liste ; sinon agents publics).
    const agentData = source.agents
      .filter((a) =>
        key?.allowedModels
          ? key.allowedModels.includes(a.publicId)
          : a.visibility === "public",
      )
      .map((a) => ({
        id: a.publicId,
        object: "model",
        created: Math.floor((a.publishedAt ?? now).getTime() / 1000),
        owned_by: "nexora",
        name: lang === "en" ? a.nameEn : a.nameFr,
        description: lang === "en" ? a.descriptionEn : a.descriptionFr,
        type: "agent",
        residency: a.region,
        pricing: {
          currency: "CAD",
          unit: "per_million_tokens",
          input: formatMicro(a.price.inputCadMicro),
          output: formatMicro(a.price.outputCadMicro),
          per_run: formatMicro(a.price.perRunCadMicro),
          // Valeur d'essai : jamais une offre commerciale.
          trial: a.price.isTrial,
        },
      }));
    return Response.json(
      { object: "list", data: [...modelData, ...agentData] },
      {
        headers: {
          // Sans clé : même liste pour tous (cache partagé de 30 s). Avec une clé, la liste lui est propre.
          "cache-control": key
            ? `private, max-age=${MODELS_MAX_AGE_SECONDS}`
            : `public, max-age=${MODELS_MAX_AGE_SECONDS}`,
          vary: "Authorization, Accept-Language",
        },
      },
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
export const handleRerank = (request: Request, deps: GatewayDeps) =>
  handleInference(request, deps, "rerank");

interface Usage {
  prompt: number;
  completion: number;
  cached: number;
  /** Jetons d'invite écrits en cache (inclus dans `prompt`). */
  cacheWrite?: number;
  /** Jetons de raisonnement (inclus dans `completion`). */
  reasoning?: number;
  /** Coût rapporté par l'amont (OpenRouter `usage.cost`, DeepInfra `usage.estimated_cost`), nano-USD ; jamais montré au client. */
  reportedUsdNano?: bigint;
  /** Ni `completion_tokens` ni `total_tokens` : la sortie est indéterminée (comptée 0 par défaut, jamais acceptée telle quelle). */
  completionMissing?: boolean;
}

function readUsage(raw: unknown): Usage | null {
  if (!isObject(raw)) return null;
  const nn = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const prompt = nn(raw.prompt_tokens);
  if (prompt === null) return null;
  const completionMissing =
    nn(raw.completion_tokens) === null && nn(raw.total_tokens) === null;
  const completion =
    nn(raw.completion_tokens) ??
    Math.max(0, (nn(raw.total_tokens) ?? prompt) - prompt);
  const details = isObject(raw.prompt_tokens_details)
    ? raw.prompt_tokens_details
    : {};
  const out = isObject(raw.completion_tokens_details)
    ? raw.completion_tokens_details
    : {};
  const cached = Math.min(nn(details.cached_tokens) ?? 0, prompt);
  // Écriture du cache : champ OpenRouter, puis champ Anthropic (aussi relayé par LiteLLM).
  const written =
    nn(details.cache_write_tokens) ??
    nn(details.cache_creation_tokens) ??
    nn(raw.cache_creation_input_tokens) ??
    0;
  // Coût amont en nano-USD, converti sans flottant (audit F-07) : « cost » (OpenRouter), à défaut « estimated_cost »
  // (DeepInfra, jusqu'ici ignoré) ; un nombre ou une chaîne décimale ; null (jamais 0) si absent.
  const cost = usdToNano(raw.cost ?? raw.estimated_cost);
  return {
    prompt,
    completion,
    cached,
    cacheWrite: Math.min(written, prompt - cached),
    reasoning: Math.min(nn(out.reasoning_tokens) ?? 0, completion),
    ...(completionMissing ? { completionMissing: true } : {}),
    ...(cost !== null ? { reportedUsdNano: cost } : {}),
  };
}

const MAX_TRACE_LENGTH = 200;
const traceText = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0
    ? v.trim().slice(0, MAX_TRACE_LENGTH)
    : null;

/** En-têtes de LiteLLM : identifiant d'appel (clé de `LiteLLM_SpendLogs`) et coût qu'il a calculé. */
function captureLitellmHeaders(upstream: Response, trace: UpstreamTrace): void {
  // L'en-tête renvoyé fait foi ; à défaut, l'identifiant que la passerelle a envoyé (déjà dans `trace`) reste.
  trace.callId =
    traceText(upstream.headers.get("x-litellm-call-id")) ??
    trace.callId ??
    null;
  const cost = upstream.headers.get("x-litellm-response-cost");
  trace.responseCostNano = cost === null ? null : usdToNano(cost);
}

/** Identifiant de génération (OpenRouter « gen-… ») et fournisseur servi : corps complet ou fragment d'un flux. */
function captureGeneration(obj: Json, trace: UpstreamTrace): void {
  trace.generationId ??= traceText(obj.id);
  trace.provider ??= traceText(obj.provider);
}

/**
 * Contrôle d'un bloc `usage` rapporté contre ce que la réponse a réellement livré (audit F-03). Un `usage` à zéro ou
 * incomplet avec une réponse livrée n'est JAMAIS accepté comme exact : les jetons douteux sont remplacés par
 * l'estimation de repli et la provenance l'indique (`estimated_missing`). Sans contenu livré (réponse vide), zéro est
 * légitime. Le coût rapporté par l'amont (information) est toujours conservé.
 */
function checkUsage(
  reported: Usage | null,
  delivered: { chars: number; any: boolean },
  plan: Plan,
): { usage: Usage; source: UsageSource; fallback: boolean } {
  const estimatedPrompt = plan.promptEstimate;
  const estimatedCompletion = estimateOutputTokens(delivered.chars);
  if (!reported)
    return {
      usage: {
        prompt: estimatedPrompt,
        completion: estimatedCompletion,
        cached: 0,
      },
      source: "estimated_missing",
      fallback: true,
    };
  if (!delivered.any)
    return { usage: reported, source: "provider", fallback: false };
  const promptBad = reported.prompt === 0 && estimatedPrompt > 0;
  const completionBad =
    delivered.chars > 0 &&
    (reported.completion === 0 || reported.completionMissing === true);
  if (!promptBad && !completionBad)
    return { usage: reported, source: "provider", fallback: false };
  const completion = completionBad ? estimatedCompletion : reported.completion;
  return {
    usage: {
      prompt: promptBad ? estimatedPrompt : reported.prompt,
      completion,
      // Le détail du cache se rapporte à l'invite : il n'a plus de sens si l'invite elle-même est estimée.
      cached: promptBad ? 0 : reported.cached,
      cacheWrite: promptBad ? 0 : (reported.cacheWrite ?? 0),
      reasoning: Math.min(reported.reasoning ?? 0, completion),
      ...(reported.reportedUsdNano !== undefined
        ? { reportedUsdNano: reported.reportedUsdNano }
        : {}),
    },
    source: "estimated_missing",
    fallback: true,
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
  // Lecture par morceaux : le flux est coupé dès le plafond (un corps sans Content-Length n'est jamais lu en entier).
  const read = await readLimitedBytes(request, max);
  if (!read.ok) return { ok: false, tooLarge: true };
  return { ok: true, text: new TextDecoder().decode(read.bytes) };
}

/**
 * Jetons facturés quand le client annule avant d'avoir reçu la réponse : l'invite estimée, rien de plus (audit F-02).
 * Supposer que l'amont « a pu continuer » jusqu'à `max_tokens` facturait un abandon jusqu'à 105 fois le coût de la
 * même requête menée à terme ; l'appel amont est d'ailleurs coupé par le signal d'annulation. Ce que l'amont a
 * réellement produit avant la coupure est connu par la réconciliation (identifiant d'appel), qui signale l'écart.
 */
function abortedTokens(plan: Plan): Usage {
  return { prompt: plan.promptEstimate, completion: 0, cached: 0 };
}

interface Plan {
  upstreamBody: Json;
  promptEstimate: number;
  maxOutput: number;
  stream: boolean;
  clientWantsUsage: boolean;
  /** Reclassement : documents (pour valider les index de la réponse) et option de les renvoyer. */
  rerank?: { documents: string[]; returnDocuments: boolean };
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

  // Tout ce qui sera transmis à l'amont est estimé (response_format, tool_choice, stop… peuvent porter du texte).
  const forwarded: Json = {};
  for (const name of CHAT_PARAMS)
    if (body[name] !== undefined) forwarded[name] = body[name];
  const promptEstimate = estimateTokens(forwarded);
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

  const upstreamBody: Json = { ...forwarded };
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

const RERANK_MAX_DOCUMENTS = 1000;
const RERANK_MAX_QUERY_CHARS = 32_000;

/** Reclassement (format Cohere) : une requête, des documents (textes ou `{ text }`), `top_n` facultatif. */
function planRerank(
  body: Json,
  model: SnapshotModel,
  rid: Record<string, string>,
): Plan | Response {
  if (model.kind !== "rerank")
    return E.badRequest(
      "Ce modèle n'accepte pas /v1/rerank.",
      "model_not_supported",
      "model",
      rid,
    );
  const query = body.query;
  if (
    typeof query !== "string" ||
    query.length === 0 ||
    query.length > RERANK_MAX_QUERY_CHARS
  )
    return E.badRequest(
      "« query » doit être un texte non vide.",
      "invalid_query",
      "query",
      rid,
    );
  const raw = body.documents;
  const documents: string[] = [];
  if (
    Array.isArray(raw) &&
    raw.length > 0 &&
    raw.length <= RERANK_MAX_DOCUMENTS
  ) {
    for (const d of raw) {
      const text = typeof d === "string" ? d : isObject(d) ? d.text : null;
      if (typeof text !== "string" || text.length === 0) break;
      documents.push(text);
    }
  }
  if (documents.length === 0 || documents.length !== (raw as unknown[]).length)
    return E.badRequest(
      `« documents » doit être une liste de 1 à ${RERANK_MAX_DOCUMENTS} textes non vides (ou d'objets { text }).`,
      "invalid_documents",
      "documents",
      rid,
    );
  const topN = body.top_n;
  if (topN !== undefined && !isPositiveInt(topN))
    return E.badRequest(
      "« top_n » doit être un entier positif.",
      "invalid_top_n",
      "top_n",
      rid,
    );
  const queryTokens = estimateTokens(query);
  let promptEstimate = 0;
  for (const d of documents) {
    const pair = queryTokens + estimateTokens(d);
    if (pair > model.contextMax)
      return E.badRequest(
        "Un document dépasse le contexte du modèle avec la requête.",
        "context_length_exceeded",
        "documents",
        rid,
      );
    promptEstimate += pair;
  }
  const upstreamBody: Json = { model: model.publicId, query, documents };
  if (topN !== undefined)
    upstreamBody.top_n = Math.min(topN as number, documents.length);
  return {
    upstreamBody,
    promptEstimate,
    maxOutput: 0,
    stream: false,
    clientWantsUsage: false,
    rerank: { documents, returnDocuments: body.return_documents === true },
  };
}

/** Jetons d'un reclassement : `meta.tokens.input_tokens` (Cohere/LiteLLM), sinon `usage`. */
function readRerankTokens(json: Json): number | null {
  const nn = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const meta = isObject(json.meta) ? json.meta : {};
  const tokens = isObject(meta.tokens) ? meta.tokens : {};
  const usage = isObject(json.usage) ? json.usage : {};
  return (
    nn(tokens.input_tokens) ??
    nn(usage.prompt_tokens) ??
    nn(usage.total_tokens) ??
    null
  );
}

/** Ce qu'une requête appelle : un modèle (via LiteLLM) ou un agent hébergé (via une instance WorkStudio). */
interface Target {
  kind: "model" | "agent";
  publicId: string;
  residency: string;
  configVersion: string;
  price: PerMillion;
  upstreamPrice: PerMillion;
  /** Étiquette de la plage horaire appliquée (« creux »), null = prix de base. */
  window: string | null;
  /** Routes de secours du modèle (coût amont propre à chacune). */
  routes: SnapshotRoute[];
  /** Frais par exécution (agents), en plus des jetons. */
  runFee: bigint;
  /** Taux USD → CAD du catalogue en vigueur (micro-CAD par dollar), figé dans l'événement ; null pour un agent. */
  fxUsdToCadMicro: bigint | null;
}

const IGNORED_ROLES = new Set(["system", "developer"]);

function agentKeyMayUse(key: ApiKeyRow, agent: CallableAgent): boolean {
  if (key.allowedModels) return key.allowedModels.includes(agent.publicId);
  return agent.visibility !== "private";
}

const textOfContent = (content: unknown): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      isObject(part) && part.type === "text" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("");
};

/**
 * Plan d'un appel d'agent. WorkStudio ignore les messages `system` et `developer` de l'appelant (l'agent garde
 * ses propres consignes) : ils sont retirés ici, avant l'estimation et l'appel. Seuls `messages` et `stream`
 * sont transmis ; les autres paramètres (température, outils…) n'ont pas de sens pour un agent publié.
 */
function planAgentChat(
  body: Json,
  agent: CallableAgent,
  deps: GatewayDeps,
  rid: Record<string, string>,
): Plan | Response {
  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    body.messages.length > 2000 ||
    !body.messages.every((m) => isObject(m) && typeof m.role === "string")
  )
    return E.badRequest(
      "« messages » doit être une liste non vide de messages ayant un « role ».",
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
  const messages = (body.messages as Json[]).filter(
    (m) => !IGNORED_ROLES.has(m.role as string),
  );
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || textOfContent(lastUser.content).trim().length === 0)
    return E.badRequest(
      "Envoyez au moins un message « user » non vide : les messages « system » sont ignorés par les agents.",
      "invalid_messages",
      "messages",
      rid,
    );
  const stream = body.stream === true;
  const clientWantsUsage =
    isObject(body.stream_options) && body.stream_options.include_usage === true;
  const promptEstimate = estimateTokens({ messages });
  if (promptEstimate > agent.runTokenCap)
    return E.badRequest(
      `La requête dépasse le plafond de cet agent (${agent.runTokenCap} jetons par exécution).`,
      "context_length_exceeded",
      "messages",
      rid,
    );
  const upstreamBody: Json = { model: agent.upstreamId, messages };
  if (stream) upstreamBody.stream = true;
  return {
    upstreamBody,
    promptEstimate,
    // Sert seulement à la limite de jetons par minute : le montant réservé vient du plafond d'exécution.
    maxOutput: Math.min(agent.runTokenCap, deps.limits.defaultMaxOutputTokens),
    stream,
    clientWantsUsage,
  };
}

/**
 * Adresse et clé de l'instance WorkStudio d'un agent. La clé d'espace vient du coffre à chaque appel et ne quitte
 * jamais ce module ; null (référence absente, secret introuvable ou révoqué) : l'agent est indisponible.
 */
async function agentCredentials(
  deps: GatewayDeps,
  agent: CallableAgent,
  requestId: string,
): Promise<{ url: string; authorization: string } | null> {
  const ref = agent.instance.secretRef;
  if (!ref || !deps.getSecret) return null;
  // La clé d'espace ne part que vers un hôte déclaré par l'opérateur, même si l'adresse enregistrée a changé (R9).
  const forbidden = (deps.secretHosts ?? envSecretHostCheck)(
    "workstudio-instance",
    agent.instance.baseUrl,
  );
  if (forbidden) {
    deps.log.error("passerelle : hôte d'instance d'agents non autorisé", {
      requestId,
      agentId: agent.id,
    });
    return null;
  }
  try {
    const value = await deps.getSecret(ref);
    if (!value) return null;
    return {
      url: `${agent.instance.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`,
      authorization: `Bearer ${value}`,
    };
  } catch (error) {
    // Ni la référence ni l'erreur ne sont journalisées : seulement l'agent concerné.
    deps.log.error("passerelle : clé d'instance d'agents indisponible", {
      requestId,
      agentId: agent.id,
      errorName: errorName(error),
    });
    return null;
  }
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
  // Organisation « maison » : aucune réservation ni débit (G9).
  let house = false;
  // Route qui a servi (0 = principale), lue dans la réponse de LiteLLM.
  let routePosition = 0;
  let settled = false;
  let target: Target | undefined;
  let streamHandedOff = false;
  // Traces de l'appel amont (appel LiteLLM, génération, coût rapporté, fournisseur) : de quoi réconcilier l'événement.
  const trace: UpstreamTrace = {};
  // Requête en vol (arrêt propre) : retirée du registre au règlement ; `shuttingDown` : le serveur s'arrête.
  let untrack: (() => void) | undefined;
  let shuttingDown = false;

  const finalize = async (input: {
    status: "ok" | "error" | "aborted";
    httpStatus: number;
    errorCode?: string;
    tokens: Usage;
    stream: boolean;
    usageSource?: UsageSource;
  }) => {
    if (settled || !db || !key || !reservation || !target) return null;
    const settle = house ? finalizeHouseRequest : finalizeRequest;
    const result = await settle(db, {
      requestId,
      organizationId: key.organizationId,
      apiKeyId: key.id,
      modelPublicId: target.publicId,
      endpoint,
      configVersion: target.configVersion,
      stream: input.stream,
      status: input.status,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      tokens: input.tokens,
      usageSource: input.usageSource,
      upstream: trace,
      fxUsdToCadMicro: target.fxUsdToCadMicro,
      price: target.price,
      upstreamPrice: routeUpstreamPrice(target, routePosition),
      priceWindow: target.window,
      routePosition,
      runFeeMicro: target.runFee,
      reservationId: reservation.id,
      latencyMs: Math.round(performance.now() - started),
    });
    settled = true;
    untrack?.();
    // Dérive de l'estimation : le coût réel (facturé en entier) dépasse fortement la réservation. Aucun contenu.
    if (!result.replayed && result.costMicro > reservation.amount * 2n)
      deps.log.warn("passerelle : coût réel très supérieur à la réservation", {
        requestId,
        apiKeyId: key.id,
        organizationId: key.organizationId,
        model: target.publicId,
        endpoint,
        reservedMicro: reservation.amount.toString(),
        costMicro: result.costMicro.toString(),
        overageMicro: result.overageMicro.toString(),
      });
    return result;
  };

  try {
    db = deps.db();
    const auth = deps.authenticate
      ? await deps.authenticate(request)
      : await authenticateApiKey(
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
    const rateHeaders: Record<string, string> = {
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

    // Privacy Router : avant l'estimation, la réservation et tout appel sortant. Le corps masqué remplace le
    // corps reçu ; l'en-tête de décision accompagne toutes les réponses suivantes.
    const received: Json = parsed;
    const caller = auth.key;
    const privacyGate = async (publicId: string) => {
      const gate = await applyPrivacy({
        router: deps.privacy,
        organizationId: caller.organizationId,
        apiKeyId: caller.id,
        endpoint,
        model: publicId,
        body: received,
        headers: rateHeaders,
      });
      if (gate.ok) rateHeaders["x-nexora-privacy-decision"] = gate.decision;
      return gate;
    };

    // Cible de la requête : un agent hébergé (`agent/<slug>`) ou un modèle du catalogue.
    let plan: Plan;
    let upstreamUrl: string;
    let upstreamAuthorization: string;
    let reserveMicro: bigint | null = null;
    if (
      endpoint === "chat.completions" &&
      parsed.model.startsWith(AGENT_PUBLIC_PREFIX)
    ) {
      const agent = await findCallableAgent(db, parsed.model, deps.now());
      if (!agent || !agentKeyMayUse(key, agent))
        return E.modelNotFound(parsed.model, rateHeaders);
      const gate = await privacyGate(agent.publicId);
      if (!gate.ok) return gate.response;
      const planned = planAgentChat(gate.body, agent, deps, rateHeaders);
      if (planned instanceof Response) return planned;
      plan = planned;
      const creds = await agentCredentials(deps, agent, requestId);
      if (!creds)
        return E.upstream(
          503,
          "agent_unavailable",
          "Cet agent n'est pas disponible pour le moment.",
          rateHeaders,
        );
      upstreamUrl = creds.url;
      upstreamAuthorization = creds.authorization;
      const { price } = agent;
      const perToken: PerMillion = {
        input: price.inputCadMicro,
        output: price.outputCadMicro,
        cache: null,
      };
      target = {
        kind: "agent",
        publicId: agent.publicId,
        residency: agent.region,
        configVersion: `agent_price_${price.id.replaceAll("-", "").slice(0, 12)}`,
        price: perToken,
        upstreamPrice: { input: 0n, output: 0n, cache: null },
        window: null,
        routes: [],
        runFee: price.perRunCadMicro,
        fxUsdToCadMicro: null,
      };
      // Le plafond d'exécution borne le montant RÉSERVÉ : exécution + plafond de jetons au prix le plus élevé. Le
      // règlement est au coût réel : un dépassement du plafond est facturé (ruling S7 « Nexora absorbe » abandonné).
      reserveMicro =
        price.perRunCadMicro +
        costMicro(
          agent.runTokenCap,
          perToken.input > perToken.output ? perToken.input : perToken.output,
        );
    } else {
      const version = (await getPublishedCatalog(db)) ?? undefined;
      const found = version
        ? findModel(version, key, parsed.model, deps.now())
        : null;
      if (!version || !found) return E.modelNotFound(parsed.model, rateHeaders);
      const model = found.model;
      // Aperçu : visible au catalogue, jamais appelable. Refus AVANT la confidentialité, l'estimation, la réservation
      // et tout appel amont.
      if (model.availability === "preview") return E.modelPreview(rateHeaders);
      const gate = await privacyGate(model.publicId);
      if (!gate.ok) return gate.response;
      const planned =
        endpoint === "chat.completions"
          ? planChat(gate.body, model, deps, rateHeaders)
          : endpoint === "embeddings"
            ? planEmbedding(gate.body, model, rateHeaders)
            : planRerank(gate.body, model, rateHeaders);
      if (planned instanceof Response) return planned;
      plan = planned;
      upstreamUrl = `${lit.baseUrl.replace(/\/+$/, "")}/v1/${endpoint === "chat.completions" ? "chat/completions" : endpoint}`;
      upstreamAuthorization = `Bearer ${lit.masterKey}`;
      target = {
        kind: "model",
        publicId: model.publicId,
        residency: model.residency,
        configVersion: version.short,
        ...pricesAt(model, deps.now()),
        routes: model.routes ?? [],
        runFee: 0n,
        fxUsdToCadMicro: version.snapshot.fx
          ? BigInt(version.snapshot.fx.usdToCadMicro)
          : null,
      };
    }
    const served = target;

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

    // Coût maximal : jetons d'entrée estimés + sortie bornée, au prix publié (agents : plafond d'exécution).
    const price = served.price;
    const maxCost =
      reserveMicro ??
      costMicro(plan.promptEstimate, price.input) +
        costMicro(plan.maxOutput, price.output);
    const amount = maxCost > 0n ? maxCost : 1n;

    house = (await billingModeOf(db, key.organizationId)) === "house";
    if (house) {
      reservation = { id: "house", amount: 0n };
    }
    // Journal d'intention (audit F-01) : l'identifiant d'appel est fixé ICI, envoyé à LiteLLM (`x-litellm-call-id`,
    // honoré par la v1.106.2) et écrit AVANT l'appel, dans la transaction de la réservation. Un arrêt du serveur
    // laisse donc une trace durable que la reprise du grand livre sait régler. Agents hébergés : aucune dépense LiteLLM.
    const callId = served.kind === "model" ? randomUUID() : null;
    trace.callId = callId;
    const promptOnly = {
      prompt: plan.promptEstimate,
      completion: 0,
      cached: 0,
    };
    const intentFor = (reservationId: string | null) => ({
      requestId,
      organizationId: caller.organizationId,
      apiKeyId: caller.id,
      reservationId,
      modelPublicId: served.publicId,
      endpoint,
      configVersion: served.configVersion,
      stream: plan.stream,
      litellmCallId: callId,
      promptEstimate: plan.promptEstimate,
      // Ce que la reprise facture à une requête perdue : l'invite estimée, jamais plus que la réservation.
      recoveryCostMicro:
        reservationId === null || requestCost(promptOnly, price) <= amount
          ? requestCost(promptOnly, price)
          : amount,
      recoveryUpstreamCostUsdNano: requestCostNano(
        promptOnly,
        routeUpstreamPrice(served, 0),
      ),
      priceInputMicro: price.input,
      priceOutputMicro: price.output,
      priceCacheMicro: price.cache,
      priceCacheWriteMicro: price.cacheWrite ?? null,
      priceWindow: served.window,
      fxUsdToCadMicro: served.fxUsdToCadMicro,
    });
    // Plafond de la clé, grand livre et intention dans UNE transaction : un arrêt entre les deux ne laisse rien de gonflé.
    const reserved = house
      ? null
      : await db.transaction(async (tx) => {
          const result = await reserve(tx, {
            organizationId: caller.organizationId,
            amountMicro: amount,
            idempotencyKey: `gw:${requestId}`,
            configVersion: served.configVersion,
            apiKeyId: caller.id,
          });
          if (result.status === "reserved")
            await recordIntent(tx, intentFor(result.reservation.id));
          return result;
        });
    if (house) await recordIntent(db, intentFor(null));
    if (reserved) {
      if (reserved.status === "key_cap_exceeded") return E.keyCap(rateHeaders);
      if (
        reserved.status === "insufficient_funds" ||
        reserved.status === "blocked"
      )
        return reserved.status === "blocked"
          ? E.blocked(rateHeaders)
          : E.insufficient(rateHeaders, reserved.availableMicro);
      reservation = { id: reserved.reservation.id, amount };
    }

    const headers: Record<string, string> = {
      ...rateHeaders,
      "x-nexora-model": served.publicId,
      "x-nexora-residency": served.residency,
      "x-nexora-catalog-version": served.configVersion,
    };

    // Appel de l'amont (LiteLLM avec la clé maîtresse, ou l'instance WorkStudio avec sa clé d'espace). Le client
    // ne voit jamais ces clés.
    const upstreamAbort = new AbortController();
    // Arrêt propre : tant que l'appel amont n'a pas répondu, `shutdown` le coupe ; la requête se règle alors par le
    // chemin « annulée » (invite estimée) avec le code « server_shutdown ». Un flux le remplace par le sien.
    const flight: InflightEntry = {
      requestId,
      shutdown: async () => {
        shuttingDown = true;
        upstreamAbort.abort();
        while (!settled) await new Promise((r) => setTimeout(r, 20));
      },
    };
    untrack = trackInflight(flight);
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
      upstream = await deps.fetch(upstreamUrl, {
        method: "POST",
        headers: {
          authorization: upstreamAuthorization,
          "content-type": "application/json",
          accept: plan.stream ? "text/event-stream" : "application/json",
          ...(callId ? { "x-litellm-call-id": callId } : {}),
        },
        body: JSON.stringify(plan.upstreamBody),
        signal,
        // Une redirection de l'amont ne doit jamais être suivie (la garde SSRF n'a vérifié que l'adresse d'origine).
        redirect: "error",
      });
    } catch {
      const aborted = request.signal.aborted || shuttingDown;
      await finalize({
        status: aborted ? "aborted" : "error",
        httpStatus: aborted ? (shuttingDown ? 503 : 499) : 502,
        errorCode: aborted
          ? shuttingDown
            ? "server_shutdown"
            : "client_closed"
          : "upstream_unreachable",
        // Le client a annulé : on facture l'invite estimée seulement (audit F-02), que la requête soit diffusée ou non.
        tokens: aborted
          ? abortedTokens(plan)
          : { prompt: 0, completion: 0, cached: 0 },
        usageSource: aborted ? "estimated_aborted" : undefined,
        stream: plan.stream,
      });
      if (shuttingDown) return E.unavailable(headers);
      return aborted
        ? new Response(null, { status: 499 })
        : E.upstream(
            502,
            "upstream_unavailable",
            served.kind === "agent"
              ? "L'instance de l'agent est injoignable."
              : "Le fournisseur du modèle est injoignable.",
            headers,
          );
    }

    routePosition =
      served.kind === "model"
        ? routePositionOf(upstream.headers.get("x-litellm-model-id"))
        : 0;
    if (served.kind === "model") captureLitellmHeaders(upstream, trace);
    if (!upstream.ok) {
      // Le corps de l'erreur amont n'est jamais relayé : on libère la connexion sans le lire.
      await upstream.body?.cancel().catch(() => undefined);
      const mapped = mapUpstreamFailure(upstream.status, headers, served.kind);
      if (served.kind === "agent" && upstream.status >= 401)
        deps.log.warn("passerelle : refus de l'instance d'agents", {
          requestId,
          upstreamStatus: upstream.status,
        });
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
        target: served,
        finalize,
        upstreamAbort,
        started,
        requestId,
        key,
        trace,
        flight,
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
      // Annulation du client pendant la lecture de la réponse : l'invite estimée seulement (audit F-02).
      const aborted = request.signal.aborted || shuttingDown;
      await finalize({
        status: aborted ? "aborted" : "error",
        httpStatus: aborted ? (shuttingDown ? 503 : 499) : 502,
        errorCode: aborted
          ? shuttingDown
            ? "server_shutdown"
            : "client_closed"
          : "invalid_upstream_response",
        tokens: aborted
          ? abortedTokens(plan)
          : { prompt: 0, completion: 0, cached: 0 },
        usageSource: aborted ? "estimated_aborted" : undefined,
        stream: false,
      });
      if (shuttingDown) return E.unavailable(headers);
      if (aborted) return new Response(null, { status: 499 });
      return E.upstream(
        502,
        "invalid_upstream_response",
        served.kind === "agent"
          ? "Réponse invalide de l'instance de l'agent."
          : "Réponse invalide du fournisseur du modèle.",
        headers,
      );
    }
    if (served.kind === "model") captureGeneration(json, trace);
    if (endpoint === "rerank" && plan.rerank) {
      const ranked = parseRerankResults(json, plan.rerank.documents.length);
      if (!ranked) {
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
      // Un compte de jetons nul ou absent pour un classement livré n'est jamais accepté (audit F-03) : repli estimé.
      const reportedTokens = readRerankTokens(json);
      const tokens =
        reportedTokens !== null && reportedTokens > 0
          ? reportedTokens
          : plan.promptEstimate;
      const usage: Usage = { prompt: tokens, completion: 0, cached: 0 };
      const result = await finalize({
        status: "ok",
        httpStatus: 200,
        tokens: usage,
        usageSource:
          reportedTokens !== null && reportedTokens > 0
            ? "provider"
            : "estimated_missing",
        stream: false,
      });
      logDone(deps, {
        requestId,
        key,
        target: served,
        endpoint,
        status: "ok",
        httpStatus: 200,
        usage,
        cost: result?.costMicro,
        started,
      });
      const docs = plan.rerank.documents;
      return new Response(
        JSON.stringify({
          id: `rerank-${requestId}`,
          model: served.publicId,
          results: ranked.map((r) => ({
            index: r.index,
            relevance_score: r.score,
            ...(plan.rerank?.returnDocuments
              ? { document: { text: docs[r.index] } }
              : {}),
          })),
          usage: { prompt_tokens: tokens, total_tokens: tokens },
        }),
        {
          status: 200,
          headers: {
            ...headers,
            "content-type": "application/json",
            "cache-control": "no-store",
            "x-nexora-cost-micro": String(result?.costMicro ?? 0n),
          },
        },
      );
    }
    // Règle de repli (agents et modèles, audit F-03) : un usage absent, nul ou incomplet avec une réponse livrée n'est
    // jamais accepté comme exact ; on retombe sur l'entrée estimée + la réponse livrée, et la provenance le dit.
    const chars = contentChars(json);
    const vectorsDelivered = Array.isArray(json.data) && json.data.length > 0;
    const checked = checkUsage(
      readUsage(json.usage),
      { chars, any: chars > 0 || vectorsDelivered },
      plan,
    );
    const usage: Usage = checked.usage;
    if (checked.fallback && json.usage !== undefined)
      deps.log.warn("passerelle : usage amont inexploitable, repli estimé", {
        requestId,
        model: served.publicId,
        endpoint,
        stream: false,
      });
    const result = await finalize({
      status: "ok",
      httpStatus: 200,
      tokens: usage,
      usageSource: checked.source,
      stream: false,
    });
    const clean = sanitize(json, served.publicId);
    logDone(deps, {
      requestId,
      key,
      target: served,
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
    if (!streamHandedOff && !settled && db && key && reservation && target) {
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

/**
 * Caractères livrés par un message complet ou par un fragment (`delta`) : texte, raisonnement (`reasoning_content`,
 * `reasoning`) et arguments des appels d'outils (`tool_calls[].function.arguments`, `function_call.arguments`).
 * Sert au repli de facturation quand l'usage de l'amont manque.
 */
function deliveredChars(part: Json): number {
  const text = (v: unknown) => (typeof v === "string" ? v.length : 0);
  let n = 0;
  for (const f of ["content", "reasoning_content", "reasoning"] as const)
    n += text(part[f]);
  if (Array.isArray(part.content))
    for (const p of part.content) if (isObject(p)) n += text(p.text);
  if (Array.isArray(part.tool_calls))
    for (const call of part.tool_calls)
      if (isObject(call) && isObject(call.function))
        n += text(call.function.arguments);
  if (isObject(part.function_call)) n += text(part.function_call.arguments);
  return n;
}

function contentChars(json: Json): number {
  const choices = Array.isArray(json.choices) ? json.choices : [];
  let n = 0;
  for (const c of choices) {
    if (isObject(c) && isObject(c.message)) n += deliveredChars(c.message);
  }
  return n;
}

function mapUpstreamFailure(
  status: number,
  headers: Record<string, string>,
  kind: "model" | "agent" = "model",
): Response {
  // Le message de l'amont (LiteLLM) nomme le fournisseur, le modèle ou l'adresse amont : il n'est jamais transmis.
  const tag = (res: Response, code: string) => {
    res.headers.set("x-nexora-error", code);
    return res;
  };
  if (status === 400 || status === 422)
    return tag(
      E.badRequest(
        "Requête refusée par le fournisseur du modèle. Vérifiez les paramètres envoyés (messages, outils, format de réponse).",
        "upstream_rejected",
        null,
        headers,
      ),
      "upstream_rejected",
    );
  // Agents : un refus de la clé d'espace (401, 402, 403) ou un agent introuvable chez WorkStudio relève de
  // la configuration de Nexora, jamais de la faute du client ; le détail amont n'est pas transmis.
  if (kind === "agent" && [401, 402, 403, 404, 409].includes(status))
    return tag(
      E.upstream(
        502,
        "agent_upstream_refused",
        "L'instance de l'agent a refusé la requête. Réessayez plus tard ou contactez le soutien de Nexora AI.",
        headers,
      ),
      "agent_upstream_refused",
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
      kind === "agent"
        ? "L'instance de l'agent a répondu par une erreur."
        : "Le fournisseur du modèle a répondu par une erreur.",
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
    target: Target;
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
    model: f.target.publicId,
    endpoint: f.endpoint,
    catalog: f.target.configVersion,
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
  target: Target;
  finalize: (i: {
    status: "ok" | "error" | "aborted";
    httpStatus: number;
    errorCode?: string;
    tokens: Usage;
    stream: boolean;
    usageSource?: UsageSource;
  }) => Promise<{ costMicro: bigint; replayed: boolean } | null>;
  upstreamAbort: AbortController;
  started: number;
  requestId: string;
  key: ApiKeyRow;
  trace: UpstreamTrace;
  /** Requête en vol : le flux y installe son propre arrêt propre. */
  flight: InflightEntry;
}): Response {
  const { plan, deps, target } = ctx;
  const upstreamBody = ctx.upstream.body;
  if (!upstreamBody) throw new Error("flux amont absent");
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let usage: Usage | null = null;
  let chars = 0;
  let sawDone = false;
  /** Le client a fermé la connexion : prime sur la fin de lecture que cette fermeture provoque elle-même. */
  let clientCancelled = false;
  /** L'amont a signalé une erreur dans le flux (événement « error ») : un échec déclaré, pas une coupure. */
  let upstreamError = false;
  /** Le serveur s'arrête (drain) : le flux est réglé de force, avec le code « server_shutdown ». */
  let shuttingDown = false;

  // Un seul règlement par flux ; tout appelant ultérieur (arrêt propre compris) attend CE règlement.
  let settling: Promise<void> | null = null;
  const settle = (outcome: "done" | "cancelled" | "failed" | "shutdown") =>
    (settling ??= settleOnce(outcome));
  const settleOnce = async (
    outcome: "done" | "cancelled" | "failed" | "shutdown",
  ) => {
    if (clientCancelled && outcome !== "done") outcome = "cancelled";
    else if (shuttingDown && outcome !== "done") outcome = "shutdown";
    try {
      let status: "ok" | "error" | "aborted";
      let tokens: Usage;
      let usageSource: UsageSource | undefined;
      if (upstreamError && chars === 0 && !usage) {
        // Échec déclaré par l'amont avant toute livraison : rien n'est facturé, la réservation est libérée.
        status = "error";
        tokens = { prompt: 0, completion: 0, cached: 0 };
      } else {
        // Règle de repli (audit F-03, F-13) : un usage absent, nul ou incomplet avec du contenu livré n'est jamais
        // accepté comme exact. Flux interrompu sans usage : l'amont a répondu 200, donc l'invite a été consommée ;
        // on facture au minimum l'invite estimée plus ce qui a été livré (texte, raisonnement, arguments d'outils).
        // Un flux complet (`[DONE]` vu) sans bloc d'usage est « ok » : seule la provenance des jetons le distingue.
        const checked = checkUsage(usage, { chars, any: chars > 0 }, plan);
        status = outcome === "done" ? "ok" : "aborted";
        tokens = checked.usage;
        usageSource =
          checked.source === "provider"
            ? "provider"
            : outcome === "cancelled" || outcome === "shutdown"
              ? "estimated_aborted"
              : outcome === "failed"
                ? "estimated_interrupted"
                : "estimated_missing";
        if (checked.fallback && usage)
          deps.log.warn(
            "passerelle : usage amont inexploitable, repli estimé",
            {
              requestId: ctx.requestId,
              model: target.publicId,
              endpoint: "chat.completions",
              stream: true,
            },
          );
      }
      const finalInput = {
        status,
        httpStatus: status === "error" ? 502 : 200,
        errorCode:
          status === "ok"
            ? undefined
            : outcome === "cancelled"
              ? "client_closed"
              : outcome === "shutdown"
                ? "server_shutdown"
                : "upstream_interrupted",
        tokens,
        usageSource,
        stream: true,
      };
      // Le règlement est idempotent (par requête) : on réessaie après une panne brève de la base avant de
      // laisser la libération périodique rendre la réservation (le coût ne serait alors facturé que par un
      // règlement tardif, qui n'aura jamais lieu).
      let result: Awaited<ReturnType<typeof ctx.finalize>> = null;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await ctx.finalize(finalInput);
          break;
        } catch (error) {
          if (attempt >= 3) throw error;
          await new Promise((r) => setTimeout(r, attempt * 250));
        }
      }
      logDone(deps, {
        requestId: ctx.requestId,
        key: ctx.key,
        target,
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
    if (payload.trim() === "[DONE]") {
      sawDone = true;
      return "data: [DONE]\n\n";
    }
    let obj: unknown;
    try {
      obj = JSON.parse(payload);
    } catch {
      return null; // fragment illisible : on ne transmet pas ce qu'on ne comprend pas
    }
    if (!isObject(obj)) return null;
    if (target.kind === "model") captureGeneration(obj, ctx.trace);
    if (isObject(obj.error)) upstreamError = true;
    const u = readUsage(obj.usage);
    if (u) usage = u;
    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    for (const c of choices) {
      const delta = isObject(c) && isObject(c.delta) ? c.delta : {};
      chars += deliveredChars(delta);
    }
    // Le client n'a pas demandé l'usage : on garde pour nous le dernier fragment (sans choix).
    if (u && choices.length === 0 && !plan.clientWantsUsage) return null;
    return `data: ${JSON.stringify(sanitize(obj, target.publicId))}\n\n`;
  };

  // Arrêt propre : coupe l'amont puis règle le flux (invite estimée + ce qui a été livré) AVANT que le serveur ne sorte.
  ctx.flight.shutdown = async () => {
    shuttingDown = true;
    ctx.upstreamAbort.abort();
    await reader.cancel().catch(() => undefined);
    await settle("shutdown");
  };
  const shutdownEvent = () =>
    encoder.encode(
      `data: ${JSON.stringify({ error: { message: "Le service redémarre : le flux a été interrompu. Réessayez dans un instant.", type: "api_error", param: null, code: "server_shutdown" } })}\n\n`,
    );

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Boucle jusqu'à produire du texte : un paquet entièrement masqué (usage non demandé) ne doit pas laisser
        // la lecture en attente, car `pull` n'est rappelé qu'après un `enqueue`.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            const last = buffer.trim().length > 0 ? processEvent(buffer) : null;
            await settle(usage || sawDone ? "done" : "failed");
            if (last) controller.enqueue(encoder.encode(last));
            if (shuttingDown) controller.enqueue(shutdownEvent());
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
          // Le règlement précède l'envoi de [DONE] : quand le client voit la fin du flux, le grand livre est à jour.
          if (sawDone) await settle("done");
          if (out) {
            controller.enqueue(encoder.encode(out));
            return;
          }
        }
      } catch {
        // Coupure de l'amont en cours de flux.
        const failed = usage === null;
        await settle(failed ? "failed" : "done");
        try {
          controller.enqueue(
            shuttingDown
              ? shutdownEvent()
              : encoder.encode(
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
      clientCancelled = true;
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
