import {
  type Database,
  enqueue,
  eq,
  type OrgRole,
  vpsInstances,
  vpsOrders,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  createOrder,
  getPublishedCatalog,
  OrderError,
  recordVpsEvent,
  requestReinstall,
  stripePriceFor,
} from "@nexora/vps";
import type Stripe from "stripe";
import { z } from "zod";
import { DEFAULT_LANG, isLang, type Lang, localizePath } from "@/i18n/config";
import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import type { BillingConfig } from "../ledger/config";
import { type CheckoutDeps, CheckoutError } from "../stripe/checkout";
import { createVpsCheckout } from "../stripe/vps-checkout";

/**
 * Routes de l'espace client pour les VPS : commande (`POST /api/vps/checkout`) et actions
 * (`POST /api/account/vps/{id}/action`). L'organisation vient de la session confrontée aux adhésions,
 * jamais du formulaire. Seul le propriétaire commande, réinstalle ou résilie ; tout membre peut
 * démarrer, arrêter ou redémarrer. Contrôle d'origine (CSRF) et limitation de débit par utilisateur.
 */
export interface VpsCustomerDeps {
  db: () => Database;
  siteUrl: string;
  getContext: (headers: Headers) => Promise<{
    userId: string;
    email: string;
    organizationId: string;
    role: OrgRole;
  } | null>;
  stripe: () => Promise<CheckoutDeps["stripe"] & Pick<Stripe, "subscriptions">>;
  config: BillingConfig;
  log: Logger;
  now: () => Date;
  maxPerOrganization: number;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

interface Input {
  fields: Record<string, unknown>;
  wantsJson: boolean;
  lang: Lang;
}

async function readInput(request: Request): Promise<Input> {
  const type = request.headers.get("content-type") ?? "";
  let fields: Record<string, unknown> = {};
  try {
    if (type.includes("application/json"))
      fields = ((await request.json()) as Record<string, unknown>) ?? {};
    else {
      const form = await request.formData();
      for (const [k, v] of form.entries())
        if (typeof v === "string") fields[k] = v;
    }
  } catch {
    fields = {};
  }
  const lang =
    typeof fields.lang === "string" && isLang(fields.lang)
      ? fields.lang
      : DEFAULT_LANG;
  return {
    fields,
    wantsJson: (request.headers.get("accept") ?? "").includes(
      "application/json",
    ),
    lang,
  };
}

const redirect = (url: string) =>
  new Response(null, { status: 303, headers: { location: url, ...NO_STORE } });

function fail(
  deps: VpsCustomerDeps,
  input: Input,
  status: number,
  code: string,
  back = "/vps",
  extra: Record<string, string> = {},
) {
  if (input.wantsJson) return json({ error: code }, status, extra);
  return redirect(
    `${deps.siteUrl}${localizePath(input.lang, back)}?erreur=${encodeURIComponent(code)}`,
  );
}

type Auth =
  | { response: Response }
  | {
      input: Input;
      ctx: NonNullable<Awaited<ReturnType<VpsCustomerDeps["getContext"]>>>;
    };

async function authorize(
  request: Request,
  deps: VpsCustomerDeps,
  bucket: string,
  limit: number,
): Promise<Auth> {
  const input = await readInput(request);
  if (request.method !== "POST")
    return { response: json({ error: "method_not_allowed" }, 405) };
  if (!isSameOriginRequest(request, deps.siteUrl))
    return { response: json({ error: "invalid_origin" }, 403) };
  const ctx = await deps.getContext(request.headers);
  if (!ctx) {
    if (input.wantsJson)
      return { response: json({ error: "unauthenticated" }, 401) };
    return {
      response: redirect(
        `${deps.siteUrl}${localizePath(input.lang, "/compte/connexion")}`,
      ),
    };
  }
  const rate = await consumeRateLimit(
    deps.db(),
    `vps:${bucket}:${ctx.userId}`,
    {
      limit,
      windowSeconds: 60,
      now: deps.now(),
    },
  );
  if (!rate.allowed)
    return {
      response: fail(deps, input, 429, "rate_limited", "/vps", {
        "retry-after": String(rate.retryAfterSeconds),
      }),
    };
  return { input, ctx };
}

const checkoutFields = z.object({
  plan: z.string().min(1).max(60),
  app: z.string().min(1).max(60),
  term: z.enum(["month", "year"]),
  sshKey: z.string().min(1).max(2000),
  hostname: z.string().max(40).optional(),
  requestId: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

const ORDER_STATUS: Record<string, number> = {
  invalid_ssh_key: 422,
  invalid_hostname: 422,
  catalog_unavailable: 503,
  plan_unavailable: 404,
  app_unavailable: 404,
  app_not_installable: 422,
  plan_too_small: 422,
  term_unavailable: 422,
  plan_not_synced: 409,
  limit_reached: 409,
};

/** POST /api/vps/checkout : crée la commande et la session Stripe (abonnement). */
export async function handleVpsCheckout(
  request: Request,
  deps: VpsCustomerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps, "checkout", 6);
  if ("response" in auth) return auth.response;
  const { input, ctx } = auth;
  if (ctx.role !== "owner") return fail(deps, input, 403, "forbidden");
  const parsed = checkoutFields.safeParse({
    ...input.fields,
    hostname:
      typeof input.fields.hostname === "string" && input.fields.hostname
        ? input.fields.hostname
        : undefined,
  });
  if (!parsed.success) return fail(deps, input, 422, "invalid_request");
  const f = parsed.data;
  const db = deps.db();
  try {
    const { order } = await createOrder(db, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      idempotencyKey: `vps:${ctx.organizationId}:${f.requestId}`,
      planCode: f.plan,
      appCode: f.app,
      term: f.term,
      sshPublicKey: f.sshKey,
      hostname: f.hostname,
      maxPerOrganization: deps.maxPerOrganization,
    });
    if (order.status !== "awaiting_payment")
      return fail(deps, input, 409, "already_processed", "/compte/vps");
    const catalog = await getPublishedCatalog(db);
    const priceId =
      catalog && stripePriceFor(catalog, order.planCode, order.term);
    if (!catalog || !priceId) return fail(deps, input, 409, "plan_not_synced");
    const stripe = await deps.stripe();
    const out = await createVpsCheckout(
      { db, stripe, config: deps.config, siteUrl: deps.siteUrl },
      {
        organizationId: ctx.organizationId,
        orderId: order.id,
        priceId,
        catalogVersion: order.catalogVersion,
        lang: input.lang,
        email: ctx.email,
      },
    );
    await db
      .update(vpsOrders)
      .set({ stripeCheckoutSessionId: out.sessionId, updatedAt: deps.now() })
      .where(eq(vpsOrders.id, order.id));
    return input.wantsJson
      ? json({ url: out.url, orderId: order.id })
      : redirect(out.url);
  } catch (error) {
    if (error instanceof OrderError)
      return fail(deps, input, ORDER_STATUS[error.code] ?? 400, error.code);
    if (error instanceof CheckoutError) {
      deps.log.error("vps : Stripe a refusé la commande", { code: error.code });
      return fail(deps, input, 502, "payment_unavailable");
    }
    deps.log.error("vps : erreur de commande", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return fail(deps, input, 500, "internal_error");
  }
}

const actionFields = z.object({
  action: z.enum(["start", "stop", "reboot", "reinstall", "cancel"]),
  confirm: z
    .union([z.boolean(), z.literal("true"), z.literal("on")])
    .optional(),
  requestId: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

/** POST /api/account/vps/{id}/action : démarrer, arrêter, redémarrer, réinstaller (confirmation), résilier (confirmation). */
export async function handleVpsAction(
  request: Request,
  instanceId: string,
  deps: VpsCustomerDeps,
): Promise<Response> {
  const auth = await authorize(request, deps, "action", 20);
  if ("response" in auth) return auth.response;
  const { input, ctx } = auth;
  const back = "/compte/vps";
  const parsed = actionFields.safeParse(input.fields);
  if (!parsed.success) return fail(deps, input, 422, "invalid_request", back);
  const { action, requestId } = parsed.data;
  const confirmed =
    parsed.data.confirm === true ||
    parsed.data.confirm === "true" ||
    parsed.data.confirm === "on";
  const db = deps.db();
  if (!/^[0-9a-f-]{36}$/i.test(instanceId))
    return fail(deps, input, 404, "not_found", back);
  const [inst] = await db
    .select()
    .from(vpsInstances)
    .where(eq(vpsInstances.id, instanceId));
  // Une instance d'une autre organisation n'existe pas pour cet utilisateur.
  if (!inst || inst.organizationId !== ctx.organizationId)
    return fail(deps, input, 404, "not_found", back);
  const ownerOnly = action === "reinstall" || action === "cancel";
  if (ownerOnly && ctx.role !== "owner")
    return fail(deps, input, 403, "forbidden", back);
  const ok = (extra: Record<string, unknown> = {}) =>
    input.wantsJson
      ? json({ accepted: true, ...extra }, 202)
      : redirect(
          `${deps.siteUrl}${localizePath(input.lang, back)}?action=${action}`,
        );

  try {
    if (action === "start" || action === "stop" || action === "reboot") {
      if (inst.status !== "active")
        return fail(deps, input, 409, "not_active", back);
      await db.transaction(async (tx) => {
        const job = await enqueue(tx, {
          type: "vps.action",
          payload: { instanceId: inst.id, action },
          idempotencyKey: `vps-action:${inst.id}:${requestId}`,
          maxAttempts: 8,
        });
        // Même requestId rejoué après la fin de la tâche (double envoi, retour arrière) : la tâche existante est
        // terminée et n'effacera plus l'action en cours ; la poser laisserait l'instance « en cours » pour toujours.
        if (job.status === "pending" || job.status === "running")
          await tx
            .update(vpsInstances)
            .set({ pendingAction: action, updatedAt: deps.now() })
            .where(eq(vpsInstances.id, inst.id));
      });
      return ok();
    }
    if (!confirmed)
      return fail(deps, input, 422, "confirmation_required", back);
    if (action === "reinstall") {
      const res = await requestReinstall(
        { db },
        inst.id,
        requestId,
        "customer",
      );
      if (!res.accepted) return fail(deps, input, 409, "not_active", back);
      return ok();
    }
    // Résiliation : à la fin de la période payée (Stripe), puis arrêt, 7 jours de rétention et suppression.
    const [order] = await db
      .select()
      .from(vpsOrders)
      .where(eq(vpsOrders.id, inst.orderId));
    if (!order?.stripeSubscriptionId)
      return fail(deps, input, 409, "no_subscription", back);
    const stripe = await deps.stripe();
    await stripe.subscriptions.update(order.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await recordVpsEvent(db, {
      organizationId: inst.organizationId,
      orderId: inst.orderId,
      instanceId: inst.id,
      actor: "customer",
      kind: "cancel_requested",
      message:
        "résiliation demandée : le service reste actif jusqu'à la fin de la période payée",
    });
    return ok();
  } catch (error) {
    deps.log.error("vps : erreur d'action", {
      action,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return fail(deps, input, 500, "internal_error", back);
  }
}
