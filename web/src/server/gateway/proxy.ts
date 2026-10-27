import type { Database } from "@nexora/db";
import { reserve } from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  AGENT_PUBLIC_PREFIX,
  type CallableAgent,
  findCallableAgent,
  listCallableAgents,
} from "../agents/catalog";
import { consumeRateLimit } from "../billing/rate-limit";
import { type CatalogVersion, getPublishedCatalog } from "./catalog";
import { E, openAiError } from "./errors";
import { estimateOutputTokens, estimateTokens } from "./estimate";
import { type ApiKeyRow, authenticateApiKey } from "./keys";
import { costMicro, formatMicro, type PerMillion } from "./pricing";
import { type PublicModel, toPublicModel } from "./public";
import type { SnapshotModel, SnapshotProvider } from "./snapshot";
import { finalizeRequest } from "./usage";

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
    const modelData = (version?.snapshot.models ?? [])
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
    // Agents hébergés : mêmes règles d'accès que les modèles (clé restreinte → sa liste ; sinon agents publics).
    const agentData = (await listCallableAgents(db, now))
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

/** Ce qu'une requête appelle : un modèle (via LiteLLM) ou un agent hébergé (via une instance WorkStudio). */
interface Target {
  kind: "model" | "agent";
  publicId: string;
  residency: string;
  configVersion: string;
  price: PerMillion;
  upstreamPrice: PerMillion;
  /** Frais par exécution (agents), en plus des jetons. */
  runFee: bigint;
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
  let settled = false;
  let target: Target | undefined;
  let streamHandedOff = false;

  const finalize = async (input: {
    status: "ok" | "error" | "aborted";
    httpStatus: number;
    errorCode?: string;
    tokens: Usage;
    stream: boolean;
  }) => {
    if (settled || !db || !key || !reservation || !target) return null;
    const result = await finalizeRequest(db, {
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
      price: target.price,
      upstreamPrice: target.upstreamPrice,
      runFeeMicro: target.runFee,
      reservationId: reservation.id,
      latencyMs: Math.round(performance.now() - started),
    });
    settled = true;
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
      const planned = planAgentChat(parsed, agent, deps, rateHeaders);
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
        runFee: price.perRunCadMicro,
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
      const planned =
        endpoint === "chat.completions"
          ? planChat(parsed, model, deps, rateHeaders)
          : planEmbedding(parsed, model, rateHeaders);
      if (planned instanceof Response) return planned;
      plan = planned;
      upstreamUrl = `${lit.baseUrl.replace(/\/+$/, "")}/v1/${endpoint === "chat.completions" ? "chat/completions" : "embeddings"}`;
      upstreamAuthorization = `Bearer ${lit.masterKey}`;
      target = {
        kind: "model",
        publicId: model.publicId,
        residency: model.residency,
        configVersion: version.short,
        price: perMillionOf(model),
        upstreamPrice: upstreamPerMillionOf(model),
        runFee: 0n,
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

    // Plafond de la clé et grand livre dans UNE transaction : un arrêt entre les deux ne laisse rien de gonflé.
    const reserved = await reserve(db, {
      organizationId: key.organizationId,
      amountMicro: amount,
      idempotencyKey: `gw:${requestId}`,
      configVersion: served.configVersion,
      apiKeyId: key.id,
    });
    if (reserved.status === "key_cap_exceeded") return E.keyCap(rateHeaders);
    if (
      reserved.status === "insufficient_funds" ||
      reserved.status === "blocked"
    )
      return reserved.status === "blocked"
        ? E.blocked(rateHeaders)
        : E.insufficient(rateHeaders);
    reservation = { id: reserved.reservation.id, amount };

    const headers: Record<string, string> = {
      ...rateHeaders,
      "x-nexora-model": served.publicId,
      "x-nexora-residency": served.residency,
      "x-nexora-catalog-version": served.configVersion,
    };

    // Appel de l'amont (LiteLLM avec la clé maîtresse, ou l'instance WorkStudio avec sa clé d'espace). Le client
    // ne voit jamais ces clés.
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
      upstream = await deps.fetch(upstreamUrl, {
        method: "POST",
        headers: {
          authorization: upstreamAuthorization,
          "content-type": "application/json",
          accept: plan.stream ? "text/event-stream" : "application/json",
        },
        body: JSON.stringify(plan.upstreamBody),
        signal,
      });
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
            served.kind === "agent"
              ? "L'instance de l'agent est injoignable."
              : "Le fournisseur du modèle est injoignable.",
            headers,
          );
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      const mapped = mapUpstreamFailure(
        upstream.status,
        text,
        headers,
        served.kind,
      );
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
        served.kind === "agent"
          ? "Réponse invalide de l'instance de l'agent."
          : "Réponse invalide du fournisseur du modèle.",
        headers,
      );
    }
    // Règle de repli (agents et modèles) : usage absent → entrée estimée + réponse livrée. Agents : un usage à
    // zéro avec une réponse livrée compte aussi comme absent (WorkStudio ne relève pas toujours les jetons).
    const delivered = contentChars(json);
    const reported = readUsage(json.usage);
    const usable =
      reported !== null &&
      !(
        served.kind === "agent" &&
        reported.prompt + reported.completion === 0 &&
        delivered > 0
      );
    const usage: Usage =
      usable && reported
        ? reported
        : {
            prompt: plan.promptEstimate,
            completion: estimateOutputTokens(delivered),
            cached: 0,
          };
    const result = await finalize({
      status: "ok",
      httpStatus: 200,
      tokens: usage,
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
  text: string,
  headers: Record<string, string>,
  kind: "model" | "agent" = "model",
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
  // Agents : un refus de la clé d'espace (401, 402, 403) ou un agent introuvable chez WorkStudio relève de
  // la configuration de Nexora, jamais de la faute du client ; le détail amont n'est pas transmis.
  if (kind === "agent" && [401, 402, 403, 404, 409].includes(status))
    return tag(
      E.upstream(
        502,
        "agent_upstream_refused",
        "L'instance de l'agent a refusé la requête. Réessayez plus tard ou contactez le soutien de Nexora.",
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
  }) => Promise<{ costMicro: bigint; replayed: boolean } | null>;
  upstreamAbort: AbortController;
  started: number;
  requestId: string;
  key: ApiKeyRow;
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
  let closed = false;
  let sawDone = false;
  /** Le client a fermé la connexion : prime sur la fin de lecture que cette fermeture provoque elle-même. */
  let clientCancelled = false;
  /** L'amont a signalé une erreur dans le flux (événement « error ») : un échec déclaré, pas une coupure. */
  let upstreamError = false;

  const settle = async (outcome: "done" | "cancelled" | "failed") => {
    if (closed) return;
    closed = true;
    if (clientCancelled && outcome !== "done") outcome = "cancelled";
    try {
      let status: "ok" | "error" | "aborted";
      let tokens: Usage;
      // Agents : un usage à zéro avec une réponse livrée compte comme absent (règle de repli, voir handleInference).
      const reportedUnusable =
        usage !== null &&
        target.kind === "agent" &&
        usage.prompt + usage.completion === 0 &&
        chars > 0;
      if (usage && !reportedUnusable) {
        status = outcome === "done" ? "ok" : "aborted";
        tokens = usage;
      } else if (upstreamError && chars === 0 && !usage) {
        // Échec déclaré par l'amont avant toute livraison : rien n'est facturé, la réservation est libérée.
        status = "error";
        tokens = { prompt: 0, completion: 0, cached: 0 };
      } else {
        // Flux interrompu sans usage (ou usage inexploitable) : l'amont a répondu 200, donc l'invite a été consommée.
        // On facture au minimum l'invite estimée, plus ce qui a été livré (texte, raisonnement, arguments d'outils),
        // même si le client coupe ou si rien n'a été reçu : l'état « erreur à zéro » ne vaut que pour un échec avant
        // la première réponse de l'amont.
        status = reportedUnusable && outcome === "done" ? "ok" : "aborted";
        tokens = {
          prompt: plan.promptEstimate,
          completion: estimateOutputTokens(chars),
          cached: 0,
        };
      }
      const finalInput = {
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
            await settle(usage ? "done" : "failed");
            if (last) controller.enqueue(encoder.encode(last));
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
          if (sawDone) await settle(usage ? "done" : "failed");
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
