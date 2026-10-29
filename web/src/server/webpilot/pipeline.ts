import type { Database, WebpilotOperation } from "@nexora/db";
import {
  activePrices,
  finalizeWebpilot,
  NO_UNITS,
  type Operation,
  type Prices,
  reserveWebpilot,
  sellCost,
  type Units,
  unpricedUnits,
  writeEvent,
} from "@nexora/webpilot";
import { consumeRateLimit } from "../billing/rate-limit";
import { billingModeOf } from "../gateway/house";
import { type ApiKeyRow, authenticateApiKey } from "../gateway/keys";
import type { OutboundIntent } from "../privacy/types";
import { W } from "./errors";
import type { WebpilotDeps } from "./types";

/**
 * Cycle commun d'une requête WebPilot (contrat §4.1) :
 * authentifier la clé -> permission -> débit -> corps -> [prix publiés] -> Privacy Router -> réserver -> exécuter
 * -> régler au coût réel dans la même transaction que l'événement d'usage -> répondre.
 * Une décision `deny` (ou une panne de la couche) est rendue AVANT toute réservation.
 */

export interface Ctx {
  requestId: string;
  started: number;
  db: Database;
  key: ApiKeyRow;
  house: boolean;
  /** x-request-id et x-ratelimit-*. */
  headers: Record<string, string>;
  authorization: string;
}

export type Begun =
  | { ok: false; response: Response }
  | { ok: true; ctx: Ctx; body: unknown };

/** Authentification, permission, débit de requêtes, lecture du corps JSON. */
export async function begin(
  request: Request,
  deps: WebpilotDeps,
  operation: WebpilotOperation,
  options: { body: boolean },
): Promise<Begun> {
  const requestId = deps.requestId();
  const rid = { "x-request-id": requestId };
  const db = deps.db();
  const authorization = request.headers.get("authorization");
  const auth = await authenticateApiKey(db, authorization, deps.now());
  if (!auth.ok) return { ok: false, response: W.invalidKey(auth.code, rid) };
  const key = auth.key;
  if (!key.webpilotOperations?.includes(operation))
    return { ok: false, response: W.notAllowed(operation, rid) };

  const rpm = key.rpmLimit ?? deps.config.defaultRpm;
  const rl = await consumeRateLimit(db, `wp:rpm:${key.id}`, {
    limit: rpm,
    windowSeconds: 60,
    now: deps.now(),
  });
  const headers = {
    ...rid,
    "x-ratelimit-limit-requests": String(rpm),
    "x-ratelimit-remaining-requests": String(Math.max(0, rpm - rl.count)),
    "x-ratelimit-reset-requests": `${rl.retryAfterSeconds}s`,
  };
  if (!rl.allowed)
    return {
      ok: false,
      response: W.rateLimited({
        ...headers,
        "retry-after": String(rl.retryAfterSeconds),
      }),
    };

  let body: unknown = null;
  if (options.body) {
    const text = await readBodyText(request, deps.config.maxBodyBytes);
    if (text === null) return { ok: false, response: W.tooLarge(headers) };
    try {
      body = JSON.parse(text);
    } catch {
      return {
        ok: false,
        response: W.badRequest(
          "Le corps doit être un JSON valide.",
          "invalid_json",
          null,
          headers,
        ),
      };
    }
  }
  const house = (await billingModeOf(db, key.organizationId)) === "house";
  return {
    ok: true,
    body,
    ctx: {
      requestId,
      started: performance.now(),
      db,
      key,
      house,
      headers,
      authorization: authorization ?? "",
    },
  };
}

async function readBodyText(
  request: Request,
  max: number,
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * Prix publiés pour les unités voulues. Une organisation cliente sans feuille (ou sans prix pour l'unité) reçoit 503
 * `webpilot_unavailable` ; l'organisation « maison » passe sans facturation.
 */
export async function pricesFor(
  ctx: Ctx,
  deps: WebpilotDeps,
  units: Units,
): Promise<
  { ok: true; prices: Prices | null } | { ok: false; response: Response }
> {
  const prices = await activePrices(ctx.db, deps.now());
  if (!ctx.house && unpricedUnits(units, prices).length > 0)
    return {
      ok: false,
      response: W.unavailable(
        "WebPilot n'est pas encore ouvert à la facturation : tarifs non publiés.",
        ctx.headers,
      ),
    };
  return { ok: true, prices };
}

export interface PrivacyNote {
  decision: "allow" | "mask";
  policyVersion: string;
}
export type PrivacyCheck =
  | { ok: false; response: Response }
  | {
      ok: true;
      note: PrivacyNote;
      /** Contenu masqué à envoyer à la place de l'original (décision `mask`). */
      content?: string;
    };

/** Évalue une sortie. Refus et panne sont journalisés (métadonnées) et rendus sans réservation. */
export async function checkPrivacy(
  ctx: Ctx,
  deps: WebpilotDeps,
  intent: Omit<OutboundIntent, "organizationId" | "apiKeyId" | "product">,
  operation: Operation,
  host: string | null,
): Promise<PrivacyCheck> {
  const full: OutboundIntent = {
    ...intent,
    organizationId: ctx.key.organizationId,
    apiKeyId: ctx.key.id,
    product: "webpilot",
  };
  const refusal = async (
    errorCode: string,
    httpStatus: number,
    privacy: { decision: string; policyVersion: string } | null,
  ) => {
    try {
      await writeEvent(ctx.db, {
        requestId: `${ctx.requestId}_refus`,
        organizationId: ctx.key.organizationId,
        apiKeyId: ctx.key.id,
        operation,
        configVersion: "webpilot_refused",
        status: "error",
        httpStatus,
        errorCode,
        units: { ...NO_UNITS },
        chargedMicro: 0n,
        valueMicro: 0n,
        upstreamUsdMicro: 0n,
        billed: !ctx.house,
        destinationHost: host,
        privacy,
        reservationId: null,
        latencyMs: Math.round(performance.now() - ctx.started),
      });
    } catch (error) {
      deps.log.error("webpilot : événement de refus non écrit", {
        requestId: ctx.requestId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  };
  let decision: Awaited<ReturnType<WebpilotDeps["privacy"]["evaluate"]>>;
  try {
    decision = await deps.privacy.evaluate(full);
  } catch (error) {
    // Échec fermé : toute panne de la couche est un refus, jamais « laisser passer ».
    deps.log.error("webpilot : Privacy Router indisponible", {
      requestId: ctx.requestId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    await refusal("privacy_router_unavailable", 503, null);
    return { ok: false, response: W.privacyUnavailable(ctx.headers) };
  }
  if (decision.decision === "deny") {
    await refusal("privacy_policy_denied", 403, {
      decision: "deny",
      policyVersion: decision.policyVersion,
    });
    return {
      ok: false,
      response: W.privacyDenied(decision.ruleId, decision.reason, ctx.headers),
    };
  }
  const note: PrivacyNote = {
    decision: decision.decision,
    policyVersion: decision.policyVersion,
  };
  return decision.decision === "mask"
    ? { ok: true, note, content: decision.content }
    : { ok: true, note };
}

/** Résultat d'une exécution : une réponse à livrer (unités facturées) ou une erreur (rien ou le livré). */
export type Outcome =
  | {
      ok: true;
      body: unknown;
      status?: number;
      units: Units;
      /** Décision la plus stricte observée pendant l'exécution (ex. `mask` d'un contenu envoyé au modèle). */
      privacy?: PrivacyNote;
      /** Coût déjà facturé ailleurs (jetons du modèle d'extraction) : ajouté à l'en-tête, pas au règlement. */
      extraCostMicro?: bigint;
    }
  | {
      ok: false;
      errorCode: string;
      httpStatus: number;
      response: (headers: Record<string, string>) => Response;
      /** Unités livrées avant l'erreur (facturées). */
      units?: Units;
    };

export interface BilledSpec {
  operation: Operation;
  /** Unités maximales : fixent la réservation. */
  reserve: Units;
  prices: Prices | null;
  host: string | null;
  privacy: PrivacyNote | null;
  execute: () => Promise<Outcome>;
}

const unitsTotal = (u: Units) => u.pageStatic + u.pageBrowser + u.browserMinute;

/** Réserver -> exécuter -> régler ; compense toute erreur imprévue (rien ne reste réservé). */
export async function runBilled(
  ctx: Ctx,
  deps: WebpilotDeps,
  spec: BilledSpec,
): Promise<Response> {
  const maxCost = sellCost(spec.reserve, spec.prices);
  const reservation = await reserveWebpilot(ctx.db, {
    organizationId: ctx.key.organizationId,
    apiKeyId: ctx.key.id,
    idempotencyKey: `wp:${ctx.requestId}`,
    amountMicro: maxCost,
    configVersion: spec.prices?.configVersion ?? "webpilot_unpriced",
    house: ctx.house,
  });
  if (!reservation.ok) {
    return reservation.reason === "key_cap"
      ? W.keyCap(ctx.headers)
      : reservation.reason === "blocked"
        ? W.blocked(ctx.headers)
        : W.insufficient(ctx.headers);
  }
  const base = {
    requestId: ctx.requestId,
    organizationId: ctx.key.organizationId,
    apiKeyId: ctx.key.id,
    operation: spec.operation,
    prices: spec.prices,
    reservationId: reservation.reservationId,
    house: ctx.house,
    destinationHost: spec.host,
  };
  const latency = () => Math.round(performance.now() - ctx.started);
  let outcome: Outcome;
  try {
    outcome = await spec.execute();
  } catch (error) {
    deps.log.error("webpilot : erreur interne", {
      requestId: ctx.requestId,
      operation: spec.operation,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    await finalizeWebpilot(ctx.db, {
      ...base,
      status: "error",
      httpStatus: 500,
      errorCode: "internal_error",
      units: { ...NO_UNITS },
      privacy: spec.privacy,
      latencyMs: latency(),
    }).catch((e) =>
      deps.log.error("webpilot : libération impossible", {
        requestId: ctx.requestId,
        errorName: e instanceof Error ? e.name : typeof e,
      }),
    );
    return W.internal(ctx.headers);
  }
  const privacy = (outcome.ok ? outcome.privacy : undefined) ?? spec.privacy;
  const privacyHeader: Record<string, string> = privacy
    ? { "x-nexora-privacy-decision": privacy.decision }
    : {};
  if (!outcome.ok) {
    const delivered = outcome.units && unitsTotal(outcome.units) > 0;
    const settled = await finalizeWebpilot(ctx.db, {
      ...base,
      // Une erreur après livraison partielle facture ce qui a été livré (contrat §8).
      status: delivered ? "ok" : "error",
      httpStatus: outcome.httpStatus,
      errorCode: outcome.errorCode,
      units: outcome.units ?? { ...NO_UNITS },
      privacy,
      latencyMs: latency(),
    });
    return outcome.response({
      ...ctx.headers,
      ...privacyHeader,
      "x-nexora-webpilot-units": String(
        outcome.units ? unitsTotal(outcome.units) : 0,
      ),
      "x-nexora-cost-micro": String(settled.costMicro),
    });
  }
  const settled = await finalizeWebpilot(ctx.db, {
    ...base,
    status: "ok",
    httpStatus: outcome.status ?? 200,
    units: outcome.units,
    privacy,
    latencyMs: latency(),
  });
  return Response.json(outcome.body, {
    status: outcome.status ?? 200,
    headers: {
      ...ctx.headers,
      ...privacyHeader,
      "cache-control": "no-store",
      "x-nexora-webpilot-units": String(unitsTotal(outcome.units)),
      "x-nexora-cost-micro": String(
        settled.costMicro + (outcome.extraCostMicro ?? 0n),
      ),
    },
  });
}
