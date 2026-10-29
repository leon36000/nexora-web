import {
  and,
  eq,
  type WebpilotSessionCloseReason,
  webpilotSessions,
} from "@nexora/db";
import {
  advanceSession,
  BrowserServiceError,
  closeSession,
  extractContent,
  type Format,
  failOpenSession,
  markBrowserClosed,
  NO_UNITS,
  openSession,
  parsePublicSessionId,
  publicSessionId,
  type ServiceAction,
  type ServiceActionResult,
  type ServiceRun,
  touchSession,
} from "@nexora/webpilot";
import { z } from "zod";
import { tooManySessions, W } from "./errors";
import {
  callModel,
  dataMessage,
  MAX_SCHEMA_CHARS,
  parseModelJson,
  systemMessage,
} from "./extract";
import {
  begin,
  type Ctx,
  checkPrivacy,
  type PrivacyNote,
  pricesFor,
} from "./pipeline";
import {
  badFieldMessage,
  paramOf,
  type SessionAction,
  sessionActionsSchema,
  sessionOpenSchema,
} from "./schemas";
import { vetUrl } from "./scrape";
import type { WebpilotDeps } from "./types";

/**
 * Sessions de navigateur (contrat §3.5, §5.4, §6, §7). Ordre de chaque requête d'actions :
 *   clé -> permission -> débit -> corps -> session (404) -> facturation avancée (minutes échues, fermetures) ->
 *   adresses vérifiées (SSRF) -> Privacy Router sur CHAQUE `goto` (hôte) et CHAQUE `type`/`select` (texte et hôte de la
 *   page) AVANT toute exécution -> service de navigateur -> résultats.
 * Un refus de la politique (ou une panne de la couche) arrête tout le lot : rien n'est exécuté.
 * Aucun contenu n'est conservé : l'état en base ne garde que l'hôte courant, jamais l'adresse complète ni le texte saisi.
 */

type SessionRow = typeof webpilotSessions.$inferSelect;
type Reason = WebpilotSessionCloseReason;

const SERVICE_DOWN = (headers: Record<string, string>) =>
  W.unavailable(
    "Le service de navigateur ne répond pas. Réessayez dans un instant.",
    headers,
  );

const NOT_CONFIGURED = (headers: Record<string, string>) =>
  W.unavailable(
    "Les sessions de navigateur ne sont pas configurées sur ce service.",
    headers,
  );

const rank = { allow: 0, mask: 1 } as const;
const worse = (a: PrivacyNote | null, b: PrivacyNote): PrivacyNote =>
  !a || rank[b.decision] > rank[a.decision] ? b : a;

function isTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const hostOfUrl = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
};

async function loadOwned(
  ctx: Ctx,
  publicId: string,
): Promise<SessionRow | null> {
  const id = parsePublicSessionId(publicId);
  if (!id) return null;
  const [row] = await ctx.db
    .select()
    .from(webpilotSessions)
    .where(
      and(
        eq(webpilotSessions.id, id),
        eq(webpilotSessions.organizationId, ctx.key.organizationId),
      ),
    );
  return row ?? null;
}

/** Détruit le navigateur au service (au mieux) ; le worker réessaie tant que la destruction n'est pas confirmée. */
async function destroyBrowser(
  ctx: Ctx,
  deps: WebpilotDeps,
  row: SessionRow,
  reason: Reason,
): Promise<void> {
  if (!deps.browser) return;
  try {
    await deps.browser.close(publicSessionId(row.id), reason);
  } catch (error) {
    // Session inconnue du service (déjà détruite, service redémarré) : rien à détruire. Autre panne : le worker réessaie.
    if (!(error instanceof BrowserServiceError && error.code === "not_found"))
      return;
  }
  await markBrowserClosed(ctx.db, row.id, deps.now()).catch(() => undefined);
}

function present(row: SessionRow) {
  return {
    id: publicSessionId(row.id),
    status: row.status,
    close_reason: row.closeReason,
    opened_at: row.openedAt.toISOString(),
    expires_at: row.expiresAt.toISOString(),
    last_activity_at: row.lastActivityAt.toISOString(),
    max_minutes: row.maxMinutes,
    idle_timeout_s: row.idleTimeoutS,
    current_host: row.currentHost,
    usage: {
      browser_minutes: row.minutesSettled,
      cost_micro: row.costMicro.toString(),
    },
  };
}

// --- plan d'un lot : adresses vérifiées, politique évaluée, rien d'exécuté ---------------------------------------

interface Plan {
  /** Actions envoyées au service (`extract` y devient un `read`). */
  service: ServiceAction[];
  /** Pour chaque action de l'appelant : position de son résultat dans la réponse du service. */
  slot: number[];
  approveHosts: string[];
  privacy: PrivacyNote | null;
  /** Une capture de la dernière étape a été ajoutée (`record: "screenshot"`). */
  trailingScreenshot: boolean;
}

type Planned = { ok: true; plan: Plan } | { ok: false; response: Response };

async function planBatch(
  ctx: Ctx,
  deps: WebpilotDeps,
  actions: readonly SessionAction[],
  currentHost: string | null,
  record: boolean,
): Promise<Planned> {
  const service: ServiceAction[] = [];
  const slot: number[] = [];
  const approve = new Set<string>();
  let privacy: PrivacyNote | null = null;
  let host = currentHost;
  const invalidAt = (i: number, message: string): Planned => ({
    ok: false,
    response: W.badRequest(
      message,
      "invalid_request",
      `actions[${i}]`,
      ctx.headers,
    ),
  });

  for (const [i, action] of actions.entries()) {
    switch (action.type) {
      case "goto": {
        const vetted = await vetUrl(deps, action.url, ctx.headers);
        if ("response" in vetted)
          return { ok: false, response: vetted.response };
        const target = vetted.url;
        const check = await checkPrivacy(
          ctx,
          deps,
          {
            operation: "session.goto",
            destination: { host: target.hostname, path: target.pathname },
            kinds: ["url"],
          },
          "session",
          target.hostname,
        );
        if (!check.ok) return { ok: false, response: check.response };
        privacy = worse(privacy, check.note);
        approve.add(target.hostname.toLowerCase());
        host = target.hostname.toLowerCase();
        slot.push(service.length);
        service.push({
          type: "goto",
          url: target.toString(),
          ...(action.wait_until ? { wait_until: action.wait_until } : {}),
        });
        break;
      }
      case "type":
      case "select": {
        if (!host)
          return invalidAt(
            i,
            "Aucune page n'est ouverte dans la session : utilisez d'abord « goto ».",
          );
        const text = action.type === "type" ? action.text : action.value;
        if (text.length > deps.config.sessionMaxTextChars)
          return invalidAt(
            i,
            `Le texte est trop long (au plus ${deps.config.sessionMaxTextChars} caractères).`,
          );
        const check = await checkPrivacy(
          ctx,
          deps,
          {
            operation: "session.type",
            destination: { host },
            kinds: ["form_input"],
            content: text,
          },
          "session",
          host,
        );
        if (!check.ok) return { ok: false, response: check.response };
        privacy = worse(privacy, check.note);
        const sent = check.content ?? text;
        slot.push(service.length);
        service.push(
          action.type === "type"
            ? {
                type: "type",
                selector: action.selector,
                text: sent,
                ...(action.clear !== undefined ? { clear: action.clear } : {}),
                expected_host: host,
              }
            : {
                type: "select",
                selector: action.selector,
                value: sent,
                expected_host: host,
              },
        );
        break;
      }
      case "click": {
        slot.push(service.length);
        if (action.selector !== undefined)
          service.push({ type: "click", selector: action.selector });
        else if (action.text !== undefined)
          service.push({ type: "click", text: action.text });
        else
          service.push({
            type: "click",
            x: action.x as number,
            y: action.y as number,
          });
        break;
      }
      case "press":
        slot.push(service.length);
        service.push({ type: "press", key: action.key });
        break;
      case "scroll":
        slot.push(service.length);
        service.push({
          type: "scroll",
          direction: action.direction,
          ...(action.amount ? { amount: action.amount } : {}),
        });
        break;
      case "wait":
        slot.push(service.length);
        service.push(action as ServiceAction);
        break;
      case "read":
      case "extract":
        slot.push(service.length);
        service.push({ type: "read" });
        break;
      case "screenshot":
        slot.push(service.length);
        service.push({ type: "screenshot" });
        break;
    }
  }
  // Les hôtes permis valent pour CE lot seulement. L'hôte de la page reste permis (les clics qui y restent), mais
  // seulement si la politique vient de le réévaluer : un lot qui commence par `goto` ne le garde pas.
  if (currentHost && actions[0]?.type !== "goto") approve.add(currentHost);
  const trailing = record && service.at(-1)?.type !== "screenshot";
  if (trailing) service.push({ type: "screenshot" });
  return {
    ok: true,
    plan: {
      service,
      slot,
      approveHosts: [...approve],
      privacy,
      trailingScreenshot: Boolean(trailing),
    },
  };
}

// --- résultats : conversion, extraction par modèle ------------------------------------------------------------------

interface Outcome {
  results: ServiceActionResult[];
  extraCostMicro: bigint;
  privacy: PrivacyNote | null;
  screenshot: { mime: string; data_base64: string } | null;
}

async function shapeResults(
  ctx: Ctx,
  deps: WebpilotDeps,
  actions: readonly SessionAction[],
  plan: Plan,
  run: ServiceRun,
  host: string | null,
): Promise<Outcome> {
  const out: ServiceActionResult[] = [];
  let extraCost = 0n;
  let privacy: PrivacyNote | null = null;
  let screenshot: Outcome["screenshot"] = null;
  if (plan.trailingScreenshot) {
    const last = run.results[plan.service.length - 1];
    if (last?.ok && typeof last.data_base64 === "string")
      screenshot = {
        mime: typeof last.mime === "string" ? last.mime : "image/png",
        data_base64: last.data_base64,
      };
  }
  for (const [i, action] of actions.entries()) {
    const r = run.results[plan.slot[i] as number];
    if (!r) break; // lot interrompu avant cette action
    if (!r.ok) {
      out.push({
        type: action.type,
        ok: false,
        error: r.error ?? { code: "action_failed", message: "Action échouée." },
      });
      break;
    }
    if (action.type === "read" || action.type === "extract") {
      const html = typeof r.html === "string" ? r.html : "";
      const url = typeof r.url === "string" ? r.url : "about:blank";
      let page: ReturnType<typeof extractContent>;
      try {
        page = extractContent(html, url, {
          formats:
            action.type === "read"
              ? ((action.formats ?? ["markdown"]) as Format[])
              : ["markdown"],
          onlyMainContent:
            action.type === "read" ? (action.only_main_content ?? true) : true,
        });
      } catch {
        out.push({
          type: action.type,
          ok: false,
          error: { code: "unreadable_page", message: "Page illisible." },
        });
        break;
      }
      if (action.type === "read") {
        const content: Record<string, unknown> = {};
        const formats = (action.formats ?? ["markdown"]) as Format[];
        if (formats.includes("markdown"))
          content.markdown = page.markdown ?? "";
        if (formats.includes("text")) content.text = page.text ?? "";
        if (formats.includes("html")) content.html = page.html ?? "";
        if (formats.includes("links")) content.links = page.links ?? [];
        out.push({
          type: "read",
          ok: true,
          url,
          title: typeof r.title === "string" ? r.title : page.metadata.title,
          content,
          metadata: {
            title: page.metadata.title,
            language: page.metadata.language,
            description: page.metadata.description,
            canonical_url: page.metadata.canonicalUrl,
            read_at: deps.now().toISOString(),
          },
          truncated: r.truncated === true,
        });
        continue;
      }
      const extracted = await extractAction(
        ctx,
        deps,
        action,
        page.markdown ?? "",
        host ?? hostOfUrl(url) ?? "page",
      );
      extraCost += extracted.costMicro;
      if (extracted.privacy) privacy = worse(privacy, extracted.privacy);
      out.push(extracted.result);
      if (!extracted.result.ok) break;
      continue;
    }
    if (action.type === "screenshot") {
      out.push({
        type: "screenshot",
        ok: true,
        mime: typeof r.mime === "string" ? r.mime : "image/png",
        data_base64: typeof r.data_base64 === "string" ? r.data_base64 : "",
      });
      continue;
    }
    const { type: _t, ok: _o, ...rest } = r;
    out.push({ type: action.type, ok: true, ...rest });
  }
  return { results: out, extraCostMicro: extraCost, privacy, screenshot };
}

async function extractAction(
  ctx: Ctx,
  deps: WebpilotDeps,
  action: Extract<SessionAction, { type: "extract" }>,
  pageText: string,
  host: string,
): Promise<{
  result: ServiceActionResult;
  costMicro: bigint;
  privacy: PrivacyNote | null;
}> {
  const fail = (code: string, message: string) => ({
    result: { type: "extract", ok: false, error: { code, message } },
    costMicro: 0n,
    privacy: null,
  });
  const model = action.model ?? deps.config.extractModel;
  if (!model)
    return fail(
      "model_required",
      "Le champ « model » est requis : aucun modèle d'extraction par défaut n'est configuré.",
    );
  let validator: z.ZodType | null = null;
  if (action.schema) {
    if (JSON.stringify(action.schema).length > MAX_SCHEMA_CHARS)
      return fail("invalid_schema", "Le schéma est trop volumineux.");
    try {
      validator = z.fromJSONSchema(action.schema as never) as z.ZodType;
    } catch {
      return fail("invalid_schema", "Ce JSON Schema n'est pas pris en charge.");
    }
  }
  // Le contenu de la page sort vers le modèle : Privacy Router d'abord (masquage ou refus).
  const text = pageText.slice(0, deps.config.maxExtractChars);
  const check = await checkPrivacy(
    ctx,
    deps,
    {
      operation: "extract",
      destination: { model },
      kinds: ["page_content"],
      content: text,
    },
    "session",
    host,
  );
  if (!check.ok)
    return fail(
      check.response.status === 503
        ? "privacy_router_unavailable"
        : "privacy_policy_denied",
      "Le contenu de la page n'a pas pu être envoyé au modèle (politique de confidentialité).",
    );
  const res = await callModel(ctx, deps, {
    model,
    system: systemMessage(action.prompt, action.schema),
    data: dataMessage(host, check.content ?? text),
  });
  if (!res.ok) return fail(res.code, res.message);
  let data: unknown;
  try {
    data = parseModelJson(res.content);
  } catch {
    return {
      result: {
        type: "extract",
        ok: true,
        valid: false,
        data: null,
        error: {
          code: "invalid_model_output",
          message: "Le modèle n'a pas rendu un JSON lisible.",
        },
      },
      costMicro: res.costMicro,
      privacy: check.note,
    };
  }
  const verdict = validator?.safeParse(data);
  return {
    result: {
      type: "extract",
      ok: true,
      data,
      valid: verdict ? verdict.success : true,
      ...(verdict && !verdict.success
        ? {
            error: {
              code: "schema_mismatch",
              message: "Le résultat ne respecte pas le schéma demandé.",
            },
          }
        : {}),
      usage: { tokens: { prompt: res.prompt, completion: res.completion } },
    },
    costMicro: res.costMicro,
    privacy: check.note,
  };
}

// --- exécution d'un lot sur une session ouverte -------------------------------------------------------------------

/** Exécute un lot déjà planifié (adresses vérifiées, politique évaluée) et met l'état de la session à jour. */
async function executeBatch(
  ctx: Ctx,
  deps: WebpilotDeps,
  row: SessionRow,
  actions: readonly SessionAction[],
  plan: Plan,
  options: { fresh?: boolean } = {},
): Promise<Response> {
  const browser = deps.browser;
  if (!browser) return NOT_CONFIGURED(ctx.headers);
  const publicId = publicSessionId(row.id);
  // L'inactivité est repoussée dès le début du lot : un long lot n'est jamais « inactif ».
  await touchSession(ctx.db, row.id, deps.now());
  let run: ServiceRun;
  try {
    run = await browser.run(publicId, plan.service, {
      approveHosts: plan.approveHosts,
    });
  } catch (error) {
    if (!(error instanceof BrowserServiceError)) throw error;
    if (options.fresh) {
      // Session à peine ouverte, son premier lot n'a pas pu partir : rien n'est facturé, la session n'existe pas pour l'appelant.
      await failOpenSession(ctx.db, row.id, deps.now());
      await destroyBrowser(ctx, deps, row, "browser_error");
      return W.unavailable(
        "Le service de navigateur n'a pas pu ouvrir la session. Rien n'est facturé.",
        ctx.headers,
      );
    }
    switch (error.code) {
      case "busy":
        return W.sessionBusy(ctx.headers);
      case "invalid_request":
        return W.badRequest(
          "Le service de navigateur a refusé le lot d'actions.",
          "invalid_request",
          error.index !== null ? `actions[${error.index}]` : "actions",
          ctx.headers,
        );
      case "session_closed":
      case "not_found":
      case "browser_error": {
        const reason: Reason =
          error.code === "session_closed" && error.closeReason
            ? error.closeReason
            : "browser_error";
        const closed = await closeSession(ctx.db, row.id, reason, deps.now());
        if (closed?.closedNow || closed?.session.browserClosedAt === null)
          await destroyBrowser(ctx, deps, row, reason);
        return W.sessionClosed(
          closed?.session.closeReason ?? reason,
          ctx.headers,
        );
      }
      default:
        return SERVICE_DOWN(ctx.headers);
    }
  }
  const host = hostOfUrl(run.url);
  const shaped = await shapeResults(
    ctx,
    deps,
    actions,
    plan,
    run,
    host ?? row.currentHost,
  );
  const privacy = shaped.privacy
    ? worse(plan.privacy, shaped.privacy)
    : plan.privacy;
  await touchSession(ctx.db, row.id, deps.now(), {
    currentHost: host,
    ...(privacy ? { privacy } : {}),
  });
  const fresh = await ctx.db
    .select()
    .from(webpilotSessions)
    .where(eq(webpilotSessions.id, row.id))
    .then((r) => r[0] ?? row);
  return Response.json(
    {
      id: publicId,
      status: fresh.status,
      url: run.url,
      title: run.title,
      results: shaped.results,
      completed:
        shaped.results.length === actions.length &&
        shaped.results.every((r) => r.ok),
      ...(shaped.screenshot ? { screenshot: shaped.screenshot } : {}),
      expires_at: fresh.expiresAt.toISOString(),
    },
    {
      headers: {
        ...ctx.headers,
        ...(privacy ? { "x-nexora-privacy-decision": privacy.decision } : {}),
        "cache-control": "no-store",
        "x-nexora-webpilot-units": "0",
        "x-nexora-cost-micro": String(shaped.extraCostMicro),
      },
    },
  );
}

// --- POST /v1/webpilot/sessions ------------------------------------------------------------------------------------

export async function handleSessionCreate(
  request: Request,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "sessions", { body: true });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const cfg = deps.config;
    const parsed = sessionOpenSchema.safeParse(begun.body);
    if (!parsed.success)
      return W.badRequest(
        badFieldMessage(parsed.error),
        "invalid_request",
        paramOf(parsed.error),
        ctx.headers,
      );
    const input = parsed.data;
    const bad = (message: string, param: string) =>
      W.badRequest(message, "invalid_request", param, ctx.headers);
    if (input.max_minutes > cfg.sessionMaxMinutes)
      return bad(
        `« max_minutes » ne peut pas dépasser ${cfg.sessionMaxMinutes}.`,
        "max_minutes",
      );
    const idle = input.idle_timeout_s ?? cfg.sessionDefaultIdleSeconds;
    if (idle > cfg.sessionMaxIdleSeconds)
      return bad(
        `« idle_timeout_s » ne peut pas dépasser ${cfg.sessionMaxIdleSeconds}.`,
        "idle_timeout_s",
      );
    if (
      input.viewport &&
      (input.viewport.width < 320 ||
        input.viewport.height < 240 ||
        input.viewport.width > cfg.sessionMaxViewport.width ||
        input.viewport.height > cfg.sessionMaxViewport.height)
    )
      return bad(
        `« viewport » : de 320x240 à ${cfg.sessionMaxViewport.width}x${cfg.sessionMaxViewport.height}.`,
        "viewport",
      );
    if (input.timezone && !isTimezone(input.timezone))
      return bad("« timezone » n'est pas un fuseau horaire connu.", "timezone");
    if (!deps.browser) return NOT_CONFIGURED(ctx.headers);

    // Adresse de départ : vérifiée et évaluée par Privacy Router AVANT toute réservation.
    let startPlan: Plan | null = null;
    const startActions: SessionAction[] = input.start_url
      ? [{ type: "goto", url: input.start_url }]
      : [];
    if (startActions.length > 0) {
      const planned = await planBatch(ctx, deps, startActions, null, false);
      if (!planned.ok) return planned.response;
      startPlan = planned.plan;
    }

    const priced = await pricesFor(ctx, deps, {
      ...NO_UNITS,
      browserMinute: 1,
    });
    if (!priced.ok) return priced.response;

    const opened = await openSession(ctx.db, {
      organizationId: ctx.key.organizationId,
      apiKeyId: ctx.key.id,
      maxMinutes: input.max_minutes,
      idleTimeoutS: idle,
      params: {
        ...(input.viewport ? { viewport: input.viewport } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.record === "screenshot" ? { record: "screenshot" } : {}),
      },
      prices: priced.prices,
      house: ctx.house,
      maxOpen: cfg.sessionMaxOpen,
      now: deps.now(),
      privacy: startPlan?.privacy ?? null,
    });
    if (!opened.ok) {
      switch (opened.reason) {
        case "key_cap":
          return W.keyCap(ctx.headers);
        case "blocked":
          return W.blocked(ctx.headers);
        case "too_many_open":
          return tooManySessions(ctx.headers);
        default:
          return W.insufficient(ctx.headers);
      }
    }
    const publicId = publicSessionId(opened.sessionId);
    try {
      await deps.browser.open({
        id: publicId,
        maxSeconds: input.max_minutes * 60,
        idleSeconds: idle,
        ...(input.viewport ? { viewport: input.viewport } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
      });
    } catch (error) {
      await failOpenSession(ctx.db, opened.sessionId, deps.now());
      deps.log.error("webpilot : ouverture de session", {
        requestId: ctx.requestId,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      if (error instanceof BrowserServiceError && error.code === "capacity")
        return tooManySessions(ctx.headers);
      return W.unavailable(
        "Le service de navigateur n'a pas pu ouvrir la session. Rien n'est facturé.",
        ctx.headers,
      );
    }

    const base = {
      id: publicId,
      status: "open",
      max_minutes: input.max_minutes,
      idle_timeout_s: idle,
      expires_at: opened.expiresAt.toISOString(),
    };
    const headers = {
      ...ctx.headers,
      "cache-control": "no-store",
      "x-nexora-webpilot-units": "0",
      "x-nexora-cost-micro": "0",
      ...(startPlan?.privacy
        ? { "x-nexora-privacy-decision": startPlan.privacy.decision }
        : {}),
    };
    if (!startPlan) return Response.json(base, { status: 201, headers });

    // Adresse de départ : le premier lot de la session.
    const [row] = await ctx.db
      .select()
      .from(webpilotSessions)
      .where(eq(webpilotSessions.id, opened.sessionId));
    if (!row) return W.internal(ctx.headers);
    const res = await executeBatch(ctx, deps, row, startActions, startPlan, {
      fresh: true,
    });
    if (res.status !== 200) return res;
    const body = (await res.json()) as Record<string, unknown>;
    return Response.json(
      {
        ...base,
        url: body.url,
        title: body.title,
        results: body.results,
        completed: body.completed,
      },
      { status: 201, headers },
    );
  } catch (error) {
    deps.log.error("webpilot : sessions (ouverture)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

// --- GET /v1/webpilot/sessions/{id} ---------------------------------------------------------------------------------

export async function handleSessionGet(
  request: Request,
  publicId: string,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "sessions", { body: false });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const row = await loadOwned(ctx, publicId);
    if (!row) return W.notFound(ctx.headers);
    const advanced = await advanceSession(ctx.db, row.id, deps.now());
    const current = advanced?.session ?? row;
    if (
      current.status === "closed" &&
      (advanced?.closedNow || current.browserClosedAt === null)
    )
      await destroyBrowser(
        ctx,
        deps,
        current,
        current.closeReason ?? "browser_error",
      );
    return Response.json(present(current), {
      headers: {
        ...ctx.headers,
        "cache-control": "no-store",
        "x-nexora-webpilot-units": "0",
      },
    });
  } catch (error) {
    deps.log.error("webpilot : sessions (lecture)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

// --- POST /v1/webpilot/sessions/{id}/actions -----------------------------------------------------------------------

export async function handleSessionActions(
  request: Request,
  publicId: string,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "sessions", { body: true });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const parsed = sessionActionsSchema.safeParse(begun.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const at = issue?.path[0] === "actions" ? issue.path[1] : undefined;
      return W.badRequest(
        typeof at === "number"
          ? `L'action ${at} est invalide : type hors de la liste permise, champ inconnu, absent ou hors limites.`
          : badFieldMessage(parsed.error),
        "invalid_request",
        typeof at === "number" ? `actions[${at}]` : paramOf(parsed.error),
        ctx.headers,
      );
    }
    const actions = parsed.data.actions;
    if (actions.length > deps.config.sessionMaxActions)
      return W.badRequest(
        `Au plus ${deps.config.sessionMaxActions} actions par requête.`,
        "invalid_request",
        "actions",
        ctx.headers,
      );
    const row = await loadOwned(ctx, publicId);
    if (!row) return W.notFound(ctx.headers);
    if (!deps.browser) return NOT_CONFIGURED(ctx.headers);

    // Facturation avancée : minutes échues réglées, session échue ou sans solde fermée (et son navigateur détruit).
    const advanced = await advanceSession(ctx.db, row.id, deps.now());
    const live = advanced?.session ?? row;
    if (live.status === "closed") {
      if (advanced?.closedNow || live.browserClosedAt === null)
        await destroyBrowser(
          ctx,
          deps,
          live,
          live.closeReason ?? "browser_error",
        );
      return W.sessionClosed(live.closeReason, ctx.headers);
    }

    // La politique a pu changer : si le lot ne commence pas par un `goto`, l'hôte de la page est réévalué ; refusé, la
    // session se ferme (`privacy_policy`) plutôt que de continuer sur un site désormais interdit.
    if (live.currentHost && actions[0]?.type !== "goto") {
      const still = await checkPrivacy(
        ctx,
        deps,
        {
          operation: "session.goto",
          destination: { host: live.currentHost },
          kinds: ["url"],
        },
        "session",
        live.currentHost,
      );
      if (!still.ok) {
        if (still.response.status === 403) {
          const closed = await closeSession(
            ctx.db,
            live.id,
            "privacy_policy",
            deps.now(),
          );
          if (closed?.closedNow)
            await destroyBrowser(ctx, deps, live, "privacy_policy");
        }
        return still.response;
      }
    }

    const planned = await planBatch(
      ctx,
      deps,
      actions,
      live.currentHost,
      (live.params as { record?: string }).record === "screenshot",
    );
    if (!planned.ok) return planned.response;
    return await executeBatch(ctx, deps, live, actions, planned.plan);
  } catch (error) {
    deps.log.error("webpilot : sessions (actions)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

// --- DELETE /v1/webpilot/sessions/{id} -------------------------------------------------------------------------------

export async function handleSessionDelete(
  request: Request,
  publicId: string,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "sessions", { body: false });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const row = await loadOwned(ctx, publicId);
    if (!row) return W.notFound(ctx.headers);
    const closed = await closeSession(
      ctx.db,
      row.id,
      "closed_by_client",
      deps.now(),
    );
    const current = closed?.session ?? row;
    if (closed?.closedNow || current.browserClosedAt === null)
      await destroyBrowser(
        ctx,
        deps,
        current,
        current.closeReason ?? "closed_by_client",
      );
    return Response.json(present(current), {
      headers: {
        ...ctx.headers,
        "cache-control": "no-store",
        "x-nexora-webpilot-units": String(current.minutesSettled),
        "x-nexora-cost-micro": current.costMicro.toString(),
      },
    });
  } catch (error) {
    deps.log.error("webpilot : sessions (fermeture)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}
