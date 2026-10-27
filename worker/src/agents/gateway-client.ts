/**
 * Client de la passerelle Nexora (`/v1/chat/completions`) pour UN agent : il porte la clé Nexora de l'agent
 * (jamais la clé maîtresse de LiteLLM). Le coût de chaque appel vient de l'en-tête `x-nexora-cost-micro` (règlement
 * du grand livre de l'organisation interne), les jetons de `usage`.
 *
 * Choix (justifié dans docs/seo.md §Agents) : passerelle plutôt que clé virtuelle LiteLLM directe, parce que le
 * grand livre, la réservation atomique, le 402 de dépassement, la révocation d'une clé et `usage_events` existent
 * déjà et sont testés ; une clé virtuelle LiteLLM créerait un second compteur de dépense à rapprocher.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** Nom de l'outil imposé. */
  forceTool?: string;
  maxTokens: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  toolCalls: { name: string; arguments: string }[];
  promptTokens: number;
  completionTokens: number;
  costMicro: bigint;
  model: string;
  finishReason: string | null;
}

export type GatewayErrorCode =
  | "insufficient_quota"
  | "account_blocked"
  | "key_cap"
  | "rate_limited"
  | "unauthorized"
  | "upstream"
  | "network"
  | "bad_response";

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly status: number | null;
  constructor(code: GatewayErrorCode, status: number | null, message: string) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.status = status;
  }
}

export interface GatewayClient {
  chat(request: ChatRequest): Promise<ChatResult>;
}

type Fetch = typeof fetch;

export function createGatewayClient(options: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}): GatewayClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async chat(req) {
      const body: Record<string, unknown> = {
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens,
        stream: false,
        ...(req.temperature !== undefined
          ? { temperature: req.temperature }
          : {}),
        ...(req.tools?.length
          ? {
              tools: req.tools,
              tool_choice: req.forceTool
                ? { type: "function", function: { name: req.forceTool } }
                : "auto",
            }
          : {}),
      };
      let res: Response;
      try {
        res = await doFetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
        });
      } catch (e) {
        // Le message d'une erreur réseau ne contient pas l'en-tête d'autorisation ; on ne le recopie pas par prudence.
        throw new GatewayError(
          "network",
          null,
          e instanceof Error && e.name === "TimeoutError"
            ? "délai dépassé"
            : "passerelle injoignable",
        );
      }
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* corps non JSON */
      }
      if (!res.ok) throw mapError(res.status, json);
      return parseCompletion(json, res.headers, req.model);
    },
  };
}

function mapError(status: number, json: unknown): GatewayError {
  const err = (json as { error?: { code?: string; type?: string } } | null)
    ?.error;
  const code = err?.code ?? err?.type ?? "";
  if (status === 402 || code === "insufficient_quota")
    return new GatewayError(
      code === "account_blocked" ? "account_blocked" : "insufficient_quota",
      status,
      "crédit insuffisant sur la passerelle",
    );
  if (status === 401 || status === 403)
    return new GatewayError(
      "unauthorized",
      status,
      "clé de passerelle refusée",
    );
  if (status === 429)
    return new GatewayError(
      code.includes("cap") ? "key_cap" : "rate_limited",
      status,
      code.includes("cap")
        ? "plafond de la clé atteint"
        : "limite de débit atteinte",
    );
  return new GatewayError("upstream", status, `erreur de l'amont (${status})`);
}

function parseCompletion(
  json: unknown,
  headers: Headers,
  requestedModel: string,
): ChatResult {
  const obj = json as {
    model?: string;
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { function?: { name?: string; arguments?: string } }[];
      };
      finish_reason?: string | null;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const choice = obj?.choices?.[0];
  if (!choice?.message)
    throw new GatewayError("bad_response", null, "réponse sans choix");
  const cost = headers.get("x-nexora-cost-micro");
  return {
    text: choice.message.content ?? "",
    toolCalls: (choice.message.tool_calls ?? []).flatMap((c) =>
      c.function?.name
        ? [{ name: c.function.name, arguments: c.function.arguments ?? "" }]
        : [],
    ),
    promptTokens: obj?.usage?.prompt_tokens ?? 0,
    completionTokens: obj?.usage?.completion_tokens ?? 0,
    costMicro: cost && /^\d+$/.test(cost) ? BigInt(cost) : 0n,
    model: obj?.model ?? requestedModel,
    finishReason: choice.finish_reason ?? null,
  };
}
