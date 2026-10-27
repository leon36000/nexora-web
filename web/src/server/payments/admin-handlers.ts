import {
  and,
  asc,
  count,
  type Database,
  desc,
  eq,
  isNull,
  paymentAudit,
  promoCodes,
  sql,
  staffAccounts,
  users,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import type Stripe from "stripe";
import { z } from "zod";
import type { PlanSource } from "../billing/plans";
import type { BillingConfig } from "../ledger/config";
import {
  allowMethods,
  HttpError,
  json,
  limitParam,
  readBody,
  runAdminRoute,
  uuidParam,
} from "../site-agents/http";
import { PublishPlanError, publishPlanToStripe } from "../stripe/publish-plan";
import type { ConnectDeps } from "./connect";
import { connectStripe, readStripeStatus } from "./connect";
import { GiftError, listGifts, revokeGift, setStaffFlag } from "./gifts";
import {
  createPromo,
  createPromoBatch,
  listPromos,
  PromoError,
  promoInputSchema,
  setPromoStatus,
} from "./promo";
import {
  ensureCreditsProducts,
  type ScopeProducts,
  scopeProductsFrom,
  syncPromo,
} from "./promo-sync";
import { getSettings, settingsPatchSchema, updateSettings } from "./settings";
import type { PaymentVault } from "./vault";

/**
 * API d'administration des paiements : `/api/admin/payments/*`. Consommée par le module Directus « Paiements »
 * (relais fermé, jeton de service). Directus ne parle JAMAIS à Stripe : tout passe par ici. Aucun secret dans
 * une réponse (la clé et le secret du webhook ne sortent pas du Coffre).
 */
export interface PaymentsAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  vault: () => PaymentVault;
  siteUrl: string;
  createClient: ConnectDeps["createClient"];
  allowLocalUrl: boolean;
  /** Client Stripe d'exploitation (clé du Coffre) ; lève si le branchement n'est pas fait. */
  stripe: () => Promise<Stripe>;
  plans: () => PlanSource;
  billingConfig: BillingConfig;
  log: Logger;
  now: () => Date;
}

const PATCH_SETTINGS = settingsPatchSchema
  .extend({ confirmLive: z.boolean().optional() })
  .strict();
const batchBody = z
  .object({
    prefix: z.string().max(12).optional(),
    count: z.number().int().min(1).max(5000),
    length: z.number().int().min(4).max(24),
    definition: z.record(z.string(), z.unknown()),
  })
  .strict();
const statusBody = z
  .object({ status: z.enum(["active", "disabled"]) })
  .strict();
const syncBody = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    all: z.boolean().optional(),
    after: z.string().uuid().optional(),
  })
  .strict();
const staffBody = z
  .object({
    email: z.string().email().max(254),
    on: z.boolean(),
    note: z.string().max(200).optional(),
  })
  .strict();
const publishBody = z.object({ code: z.string().min(1).max(100) }).strict();
const revokeBody = z
  .object({ reason: z.string().max(300).optional() })
  .strict();

export async function handlePaymentsAdmin(
  request: Request,
  path: string[],
  deps: PaymentsAdminDeps,
): Promise<Response> {
  return runAdminRoute(
    request,
    path,
    { adminToken: deps.adminToken, log: deps.log },
    "paiements",
    () => route(request, path, deps),
    (error) => {
      if (error instanceof PromoError)
        return json(
          {
            error: `promo_${error.code}`,
            message: error.message,
            issues: error.issues,
          },
          error.code === "not_found"
            ? 404
            : error.code === "duplicate"
              ? 409
              : 422,
        );
      if (error instanceof GiftError)
        return json(
          {
            error: `gift_${error.code}`,
            message: error.message,
            remainingCents: error.remainingCents,
          },
          error.code === "not_found" ? 404 : 409,
        );
      return null;
    },
  );
}

/** Synchronise des codes avec Stripe ; sans branchement, renvoie un état d'erreur lisible plutôt qu'une exception. */
async function syncSome(
  deps: PaymentsAdminDeps,
  rows: Array<typeof promoCodes.$inferSelect>,
) {
  const db = deps.db();
  let stripe: Stripe;
  try {
    stripe = await deps.stripe();
  } catch {
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      state: "error" as const,
      code_: "stripe_unavailable",
      message:
        "Stripe n'est pas branché : collez la clé au Coffre puis « Vérifier et brancher Stripe ».",
    }));
  }
  const needsCredits = rows.some((r) => r.scopes.includes("credits"));
  if (needsCredits) await ensureCreditsProducts(db, stripe);
  const products = await scopeProductsFrom(db, deps.plans());
  const cache: ScopeProducts = products;
  const out = [];
  for (const row of rows) {
    const res = await syncPromo(
      { db, stripe, products: async () => cache, now: deps.now },
      row,
    );
    out.push({ id: row.id, code: row.code, ...res });
  }
  return out;
}

async function route(
  request: Request,
  path: string[],
  deps: PaymentsAdminDeps,
): Promise<Response> {
  const db = deps.db();
  const url = new URL(request.url);
  const [a, b, c] = path;

  if (!a) {
    allowMethods(request, "GET");
    const stripe = await readStripeStatus({
      db,
      vault: deps.vault(),
      siteUrl: deps.siteUrl,
    });
    const settings = await getSettings(db);
    const [promos] = await db.select({ n: count() }).from(promoCodes);
    const [unsynced] = await db
      .select({ n: count() })
      .from(promoCodes)
      .where(
        and(
          eq(promoCodes.status, "active"),
          isNull(promoCodes.stripePromotionCodeId),
          sql`${promoCodes.kind} IN ('percent', 'amount', 'free')`,
        ),
      );
    const [staff] = await db
      .select({ n: count() })
      .from(staffAccounts)
      .where(isNull(staffAccounts.revokedAt));
    return json({
      stripe,
      settings: publicSettings(settings),
      promos: { total: promos?.n ?? 0, unsynced: unsynced?.n ?? 0 },
      staff: staff?.n ?? 0,
    });
  }

  if (a === "stripe" && b === "connect" && !c) {
    allowMethods(request, "POST");
    const result = await connectStripe({
      db,
      vault: deps.vault(),
      siteUrl: deps.siteUrl,
      createClient: deps.createClient,
      allowLocalUrl: deps.allowLocalUrl,
      log: deps.log,
      now: deps.now,
    });
    const status = await readStripeStatus({
      db,
      vault: deps.vault(),
      siteUrl: deps.siteUrl,
    });
    return json({ ...result, status }, result.ok ? 200 : 422);
  }

  if (a === "settings" && !b) {
    const method = allowMethods(request, "GET", "PATCH");
    if (method === "GET") return json(publicSettings(await getSettings(db)));
    const body = await readBody(request, PATCH_SETTINGS);
    const { confirmLive, ...patch } = body;
    if (patch.liveModeAllowed === true && confirmLive !== true)
      throw new HttpError(422, "confirmation_required", {
        message:
          "Autoriser les paiements réels exige une confirmation explicite.",
      });
    return json(publicSettings(await updateSettings(db, patch, "admin")));
  }

  if (a === "plans" && b === "publish" && !c) {
    allowMethods(request, "POST");
    const { code } = await readBody(request, publishBody);
    const plan = await deps.plans().getByCode(code);
    if (!plan)
      throw new HttpError(404, "plan_not_found", {
        message:
          "Offre introuvable ou non publiée : publiez-la dans Directus avant « Publier vers Stripe ».",
      });
    let stripe: Stripe;
    try {
      stripe = await deps.stripe();
    } catch {
      throw new HttpError(503, "stripe_unavailable", {
        message:
          "Stripe n'est pas branché : collez la clé au Coffre puis « Vérifier et brancher Stripe ».",
      });
    }
    try {
      const result = await publishPlanToStripe(stripe, plan);
      deps.log.info("paiements : offre publiée vers Stripe", {
        code: plan.code,
      });
      return json({
        code: plan.code,
        ...result,
        appliedAt: deps.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof PublishPlanError)
        throw new HttpError(422, "invalid_plan", { message: error.message });
      throw new HttpError(502, "stripe_error");
    }
  }

  if (a === "promos") {
    if (!b) {
      const method = allowMethods(request, "GET", "POST");
      if (method === "GET") {
        const status = url.searchParams.get("status");
        const batchId = url.searchParams.get("batchId");
        return json(
          await listPromos(db, {
            q: url.searchParams.get("q") ?? undefined,
            status:
              status === "active" || status === "disabled" ? status : undefined,
            batchId: batchId ? uuidParam(batchId) : undefined,
            limit: limitParam(url, 100, 500),
            offset: Math.max(Number(url.searchParams.get("offset")) || 0, 0),
          }),
        );
      }
      const body = await readBody(request, z.record(z.string(), z.unknown()));
      const row = await createPromo(db, body, "admin");
      const [sync] = await syncSome(deps, [row]);
      const [fresh] = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.id, row.id));
      return json({ promo: fresh ?? row, sync }, 201);
    }
    if (b === "batch" && !c) {
      allowMethods(request, "POST");
      const body = await readBody(request, batchBody);
      const out = await createPromoBatch(
        db,
        {
          prefix: body.prefix,
          count: body.count,
          length: body.length,
          definition: body.definition as never,
        },
        "admin",
      );
      // Pas de synchronisation en ligne (jusqu'à 5 000 codes) : « Synchroniser avec Stripe » s'en charge par paquets.
      return json(
        {
          batchId: out.batchId,
          count: out.codes.length,
          codes: out.codes.slice(0, 20),
        },
        201,
      );
    }
    if (b === "sync" && !c) {
      allowMethods(request, "POST");
      const body = await readBody(request, syncBody, { optional: true });
      const limit = body.limit ?? 25;
      const needsStripe = sql`${promoCodes.kind} IN ('percent', 'amount', 'free')`;
      const where = body.all
        ? and(
            eq(promoCodes.status, "active"),
            needsStripe,
            body.after ? sql`${promoCodes.id} > ${body.after}` : undefined,
          )
        : and(
            eq(promoCodes.status, "active"),
            needsStripe,
            isNull(promoCodes.stripePromotionCodeId),
          );
      const rows = await db
        .select()
        .from(promoCodes)
        .where(where)
        .orderBy(asc(promoCodes.id))
        .limit(limit);
      const results = await syncSome(deps, rows);
      const [{ n: remaining } = { n: 0 }] = body.all
        ? [{ n: 0 }]
        : await db
            .select({ n: count() })
            .from(promoCodes)
            .where(
              and(
                eq(promoCodes.status, "active"),
                needsStripe,
                isNull(promoCodes.stripePromotionCodeId),
              ),
            );
      const failed = results.filter((r) => r.state === "error");
      return json({
        processed: results.length,
        errors: failed.length,
        firstError:
          (failed[0] as { message?: string } | undefined)?.message ?? null,
        remaining,
        next:
          body.all && rows.length === limit ? rows[rows.length - 1]?.id : null,
      });
    }
    const id = uuidParam(b);
    if (!c) {
      allowMethods(request, "PATCH");
      const body = await readBody(request, statusBody);
      const row = await setPromoStatus(db, id, body.status, "admin");
      const [sync] = await syncSome(deps, [row]);
      return json({ promo: row, sync });
    }
    if (c === "sync") {
      allowMethods(request, "POST");
      const [row] = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.id, id));
      if (!row) throw new HttpError(404, "not_found");
      const [sync] = await syncSome(deps, [row]);
      return json({ sync });
    }
  }

  if (a === "staff" && !b) {
    const method = allowMethods(request, "GET", "POST");
    if (method === "GET") {
      const rows = await db
        .select({
          userId: staffAccounts.userId,
          email: users.email,
          name: users.name,
          note: staffAccounts.note,
          grantedBy: staffAccounts.grantedBy,
          createdAt: staffAccounts.createdAt,
          revokedAt: staffAccounts.revokedAt,
        })
        .from(staffAccounts)
        .innerJoin(users, eq(users.id, staffAccounts.userId))
        .orderBy(desc(staffAccounts.createdAt));
      return json({ items: rows });
    }
    const body = await readBody(request, staffBody);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${body.email.toLowerCase()}`);
    if (!user)
      throw new HttpError(404, "user_not_found", {
        message:
          "Aucun compte client avec ce courriel : la personne doit d'abord s'inscrire.",
      });
    await setStaffFlag(db, {
      userId: user.id,
      on: body.on,
      actor: "admin",
      note: body.note,
    });
    return json({ userId: user.id, on: body.on });
  }

  if (a === "gifts") {
    if (!b) {
      allowMethods(request, "GET");
      return json({
        items: await listGifts(db, { limit: limitParam(url, 100, 500) }),
      });
    }
    if (c === "revoke") {
      allowMethods(request, "POST");
      const body = await readBody(request, revokeBody, { optional: true });
      const gift = await revokeGift(db, uuidParam(b), {
        actor: "admin",
        reason: body.reason,
        now: deps.now(),
        config: deps.billingConfig,
      });
      return json({ gift });
    }
  }

  if (a === "audit" && !b) {
    allowMethods(request, "GET");
    const rows = await db
      .select()
      .from(paymentAudit)
      .orderBy(desc(paymentAudit.createdAt))
      .limit(limitParam(url, 50, 200));
    return json({ items: rows });
  }

  throw new HttpError(404, "not_found");
}

/** Réglages tels que l'admin les voit (aucun secret n'y figure de toute façon). */
function publicSettings(s: Awaited<ReturnType<typeof getSettings>>) {
  return {
    liveModeAllowed: s.liveModeAllowed,
    trialRequiresCard: s.trialRequiresCard,
    stripePageCodes: s.stripePageCodes,
    staffMonthlyCreditCapCents: s.staffMonthlyCreditCapCents,
    creditsFeeEnabled: s.creditsFeeEnabled,
    creditsFeeBps: s.creditsFeeBps,
    creditsFeeMinCents: s.creditsFeeMinCents,
    updatedAt: s.updatedAt,
  };
}
