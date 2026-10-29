import { type Database, WEBPILOT_UNITS } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import { checkAdminAuth } from "../auth";
import {
  createSheet,
  listSheets,
  publishDraft,
  WebpilotPriceError,
} from "./prices";

/**
 * API d'administration de la feuille de prix : `/api/admin/webpilot/prices` (même jeton d'administration que le
 * catalogue, comparaison en temps constant, échec fermé). GET : feuille en vigueur et historique. PUT : crée une
 * feuille (brouillon ou publiée) ou publie un brouillon existant ; la garde de marge s'applique à la publication.
 * Montants en micro-unités, en chaînes décimales dans les réponses.
 */
export interface PricesAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  log: Logger;
  now: () => Date;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });
const error = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

const micro = z
  .union([
    z.string().regex(/^\d{1,18}$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v));
const unitPrice = z
  .object({ sellCadMicro: micro, upstreamUsdMicro: micro.optional() })
  .strict();

const createBody = z
  .object({
    prices: z.partialRecord(z.enum(WEBPILOT_UNITS), unitPrice),
    status: z.enum(["draft", "published"]),
    effectiveAt: z.iso.datetime().optional(),
    marginFloorBps: z.number().int().min(0).max(100_000).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();
const publishBody = z
  .object({
    publishDraft: z.uuid(),
    effectiveAt: z.iso.datetime().optional(),
  })
  .strict();

export async function handlePricesAdmin(
  request: Request,
  deps: PricesAdminDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return error(
      503,
      "admin_not_configured",
      "Jeton d'administration non configuré.",
    );
  if (auth !== "ok") return error(401, "unauthorized", "Jeton invalide.");
  try {
    const db = deps.db();
    const now = deps.now();
    if (request.method === "GET") return json(await listSheets(db, now));
    if (request.method !== "PUT")
      return error(405, "method_not_allowed", "GET ou PUT seulement.");
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error(400, "invalid_json", "Le corps doit être un JSON valide.");
    }
    const pub = publishBody.safeParse(raw);
    if (pub.success) {
      const done = await publishDraft(db, pub.data.publishDraft, {
        ...(pub.data.effectiveAt
          ? { effectiveAt: new Date(pub.data.effectiveAt) }
          : {}),
        now,
      });
      deps.log.info("webpilot : feuille de prix publiée", {
        version: done.version,
      });
      return json({ id: done.id, version: done.version, status: done.status });
    }
    const parsed = createBody.safeParse(raw);
    if (!parsed.success)
      return error(
        400,
        "invalid_request",
        "Corps invalide : prices (sellCadMicro, upstreamUsdMicro), status, effectiveAt, marginFloorBps, note — ou publishDraft.",
      );
    const b = parsed.data;
    const sheet = await createSheet(
      db,
      {
        prices: Object.fromEntries(
          Object.entries(b.prices).map(([unit, p]) => [
            unit,
            {
              sellCadMicro: p.sellCadMicro,
              upstreamUsdMicro: p.upstreamUsdMicro ?? 0n,
            },
          ]),
        ),
        status: b.status,
        ...(b.effectiveAt ? { effectiveAt: new Date(b.effectiveAt) } : {}),
        ...(b.marginFloorBps !== undefined
          ? { marginFloorBps: b.marginFloorBps }
          : {}),
        ...(b.note ? { note: b.note } : {}),
        createdBy: "api d'administration",
      },
      now,
    );
    deps.log.info("webpilot : feuille de prix enregistrée", {
      version: sheet.version,
      status: sheet.status,
    });
    return json(
      { id: sheet.id, version: sheet.version, status: sheet.status },
      201,
    );
  } catch (e) {
    if (e instanceof WebpilotPriceError) {
      const status =
        e.code === "not_found"
          ? 404
          : e.code === "fx_missing"
            ? 409
            : e.code === "margin_floor"
              ? 422
              : e.code === "not_a_draft"
                ? 409
                : 400;
      return error(status, e.code, e.message);
    }
    deps.log.error("webpilot : prix (erreur interne)", {
      errorName: e instanceof Error ? e.name : typeof e,
    });
    return error(500, "internal_error", "Erreur interne.");
  }
}
