import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { DEFAULT_LANG, isLang, type Lang, localizePath } from "@/i18n/config";
import { OrgAccessError, resolveOrgContext } from "../auth/guards";
import { isSameOriginRequest } from "../auth/origin";
import type { BillingConfig } from "../ledger/config";
import { parseCadToCents } from "../ledger/money";
import {
  type CheckoutDeps,
  CheckoutError,
  createCreditCheckout,
  createPortalSession,
  createSubscriptionCheckout,
} from "../stripe/checkout";
import type { PlanSource } from "./plans";
import { consumeRateLimit } from "./rate-limit";

export interface SessionInfo {
  userId: string;
  email: string;
  activeOrganizationId: string | null;
}

export interface BillingHttpDeps {
  db: Database;
  getSession: (headers: Headers) => Promise<SessionInfo | null>;
  stripe: () => Promise<CheckoutDeps["stripe"]>;
  plans: () => PlanSource;
  config: BillingConfig;
  siteUrl: string;
  productName: (lang: Lang) => string;
  log: Logger;
}

const NO_STORE = { "cache-control": "no-store" };
/** 10 créations de paiement ou de portail par minute et par utilisateur. */
const RATE = { limit: 10, windowSeconds: 60 };

interface Input {
  fields: Record<string, string>;
  wantsJson: boolean;
  lang: Lang;
}

async function readInput(request: Request): Promise<Input> {
  const type = request.headers.get("content-type") ?? "";
  let fields: Record<string, string> = {};
  try {
    if (type.includes("application/json")) {
      const raw = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw ?? {}))
        if (typeof v === "string" || typeof v === "number")
          fields[k] = String(v);
    } else {
      const form = await request.formData();
      fields = {};
      for (const [k, v] of form.entries())
        if (typeof v === "string") fields[k] = v;
    }
  } catch {
    fields = {};
  }
  const lang = fields.lang && isLang(fields.lang) ? fields.lang : DEFAULT_LANG;
  const wantsJson = (request.headers.get("accept") ?? "").includes(
    "application/json",
  );
  return { fields, wantsJson, lang };
}

function redirect(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: url, ...NO_STORE },
  });
}

/** Erreur : JSON pour un appel de script, retour au tableau de bord pour un formulaire. */
function fail(
  deps: BillingHttpDeps,
  input: Input,
  status: number,
  code: string,
  headers: Record<string, string> = {},
): Response {
  if (input.wantsJson)
    return Response.json(
      { error: code },
      { status, headers: { ...NO_STORE, ...headers } },
    );
  return redirect(
    `${deps.siteUrl}${localizePath(input.lang, "/compte")}?erreur=${encodeURIComponent(code)}`,
  );
}

type Authorized =
  | { response: Response }
  | { input: Input; userId: string; email: string; organizationId: string };

/**
 * Prélude commun : origine (CSRF), session, organisation DÉRIVÉE de la session (jamais d'un champ
 * du formulaire), rôle propriétaire, limitation de débit.
 */
async function authorize(
  request: Request,
  deps: BillingHttpDeps,
  route: string,
): Promise<Authorized> {
  const input = await readInput(request);
  if (request.method !== "POST")
    return {
      response: Response.json({ error: "method_not_allowed" }, { status: 405 }),
    };
  if (!isSameOriginRequest(request, deps.siteUrl))
    return {
      response: Response.json(
        { error: "invalid_origin" },
        { status: 403, headers: NO_STORE },
      ),
    };

  const session = await deps.getSession(request.headers);
  if (!session) {
    if (input.wantsJson)
      return { response: fail(deps, input, 401, "unauthenticated") };
    return {
      response: redirect(
        `${deps.siteUrl}${localizePath(input.lang, "/compte/connexion")}`,
      ),
    };
  }
  const ctx = await resolveOrgContext(
    deps.db,
    session.userId,
    session.activeOrganizationId,
  );
  if (!ctx) return { response: fail(deps, input, 403, "no_organization") };
  if (ctx.role !== "owner")
    return { response: fail(deps, input, 403, "forbidden") };

  const limit = await consumeRateLimit(
    deps.db,
    `billing:${route}:${session.userId}`,
    RATE,
  );
  if (!limit.allowed)
    return {
      response: fail(deps, input, 429, "rate_limited", {
        "retry-after": String(limit.retryAfterSeconds),
      }),
    };
  return {
    input,
    userId: session.userId,
    email: session.email,
    organizationId: ctx.organizationId,
  };
}

/** Client Stripe : un secret absent ou invalide n'est pas une erreur interne mais un service indisponible. */
async function stripeClient(
  deps: BillingHttpDeps,
): Promise<CheckoutDeps["stripe"]> {
  try {
    return await deps.stripe();
  } catch {
    throw new CheckoutError(
      "stripe_unavailable",
      "client Stripe indisponible (secret absent ou invalide)",
    );
  }
}

function checkoutDeps(
  deps: BillingHttpDeps,
  stripe: CheckoutDeps["stripe"],
): CheckoutDeps {
  return { db: deps.db, stripe, config: deps.config, siteUrl: deps.siteUrl };
}

function checkoutFailure(
  deps: BillingHttpDeps,
  input: Input,
  error: unknown,
): Response {
  if (error instanceof OrgAccessError)
    return fail(deps, input, 403, "forbidden");
  if (error instanceof CheckoutError) {
    const map: Record<string, [number, string]> = {
      invalid_amount: [422, "invalid_amount"],
      plan_not_synced: [409, "plan_not_synced"],
      no_customer: [409, "no_customer"],
      stripe_error: [502, "payment_unavailable"],
      stripe_unavailable: [503, "payment_unavailable"],
    };
    const [status, code] = map[error.code] ?? [500, "internal_error"];
    if (error.code === "stripe_error" || error.code === "stripe_unavailable")
      deps.log.error("facturation : Stripe a refusé la requête", {
        code: error.code,
      });
    return fail(deps, input, status, code);
  }
  // Ni message ni pile : ils peuvent citer une clé ou des données du client.
  deps.log.error("facturation : erreur interne", {
    errorName: error instanceof Error ? error.name : typeof error,
  });
  return fail(deps, input, 500, "internal_error");
}

function done(input: Input, url: string): Response {
  return input.wantsJson
    ? Response.json({ url }, { headers: NO_STORE })
    : redirect(url);
}

/** POST /api/billing/checkout/credits : achat de crédits (paiement unique). Champs : `amount` (CAD), `lang`. */
export async function handleCreditsCheckout(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  const auth = await authorize(request, deps, "credits");
  if ("response" in auth) return auth.response;
  const { input } = auth;
  const cents = parseCadToCents(input.fields.amount ?? "");
  if (
    cents === null ||
    cents < deps.config.minPurchaseCents ||
    cents > deps.config.maxPurchaseCents
  )
    return fail(deps, input, 422, "invalid_amount");
  try {
    const out = await createCreditCheckout(
      checkoutDeps(deps, await stripeClient(deps)),
      {
        organizationId: auth.organizationId,
        amountCents: cents,
        lang: input.lang,
        productName: deps.productName(input.lang),
        email: auth.email,
      },
    );
    return done(input, out.url);
  } catch (error) {
    return checkoutFailure(deps, input, error);
  }
}

/** POST /api/billing/checkout/subscription : abonnement à un plan publié. Champs : `plan` (code), `lang`. */
export async function handleSubscribeCheckout(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  const auth = await authorize(request, deps, "subscription");
  if ("response" in auth) return auth.response;
  const { input } = auth;
  try {
    // Seuls les plans PUBLIÉS dans Directus sont achetables.
    const plan = await deps.plans().getByCode(input.fields.plan ?? "");
    if (!plan) return fail(deps, input, 404, "plan_not_found");
    const out = await createSubscriptionCheckout(
      checkoutDeps(deps, await stripeClient(deps)),
      {
        organizationId: auth.organizationId,
        plan,
        lang: input.lang,
        email: auth.email,
      },
    );
    return done(input, out.url);
  } catch (error) {
    return checkoutFailure(deps, input, error);
  }
}

/** POST /api/billing/portal : portail client Stripe (moyens de paiement, factures, résiliation). */
export async function handlePortal(
  request: Request,
  deps: BillingHttpDeps,
): Promise<Response> {
  const auth = await authorize(request, deps, "portal");
  if ("response" in auth) return auth.response;
  const { input } = auth;
  try {
    const out = await createPortalSession(
      checkoutDeps(deps, await stripeClient(deps)),
      {
        organizationId: auth.organizationId,
        lang: input.lang,
      },
    );
    return done(input, out.url);
  } catch (error) {
    return checkoutFailure(deps, input, error);
  }
}
