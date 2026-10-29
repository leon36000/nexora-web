import { PRIVACY_LEVELS } from "@nexora/db";
import { z } from "zod";
import { isSameOriginRequest } from "../auth/origin";
import { consumeRateLimit } from "../billing/rate-limit";
import type {
  AccountContext,
  AccountKeysDeps,
} from "../gateway/account-handlers";
import { CSV_BOM, csvText } from "../gateway/activity-csv";
import { privacyConfigSchema, resolvePolicy } from "./policy";
import { InvalidPolicyError, monthlyReportRows, savePolicy } from "./store";
import { configView, loadPrivacyView } from "./view";

/**
 * Confidentialité de l'espace client :
 *  - `GET /api/account/privacy` : politique en vigueur, décisions des 30 derniers jours (compteurs), historique ;
 *  - `PUT /api/account/privacy` : nouvelle version de la politique ;
 *  - `GET /api/account/privacy/report?month=AAAA-MM` : rapport mensuel en CSV.
 *
 * Mêmes règles que les clés d'API : contrôle d'origine (CSRF), session confrontée aux adhésions, l'organisation
 * vient de la session et jamais du corps. Seul le propriétaire (administrateur) de l'organisation lit et modifie.
 * Métadonnées seulement : le journal des décisions ne contient jamais de contenu.
 */

export interface PrivacyAccountDeps extends AccountKeysDeps {
  /** Appelé après un nouvel enregistrement : vide le cache de politiques du routeur (ce processus). */
  onPolicyChanged?: (organizationId: string) => void;
}

const NO_STORE = { "cache-control": "no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

const READ_LIMIT = { limit: 60, windowSeconds: 60 } as const;
const WRITE_LIMIT = { limit: 20, windowSeconds: 60 } as const;
const EXPORT_LIMIT = { limit: 10, windowSeconds: 60 } as const;

type Authorized = { response: Response } | { ctx: AccountContext };

async function authorize(
  request: Request,
  deps: PrivacyAccountDeps,
  bucket: "read" | "write" | "export",
): Promise<Authorized> {
  if (!isSameOriginRequest(request, deps.siteUrl))
    return { response: json({ error: "invalid_origin" }, 403) };
  const ctx = await deps.getContext(request.headers);
  if (!ctx) return { response: json({ error: "unauthenticated" }, 401) };
  if (ctx.role !== "owner")
    return { response: json({ error: "forbidden" }, 403) };
  const limit = await consumeRateLimit(
    deps.db(),
    `acct-privacy-${bucket}:${ctx.userId}`,
    {
      ...(bucket === "read"
        ? READ_LIMIT
        : bucket === "write"
          ? WRITE_LIMIT
          : EXPORT_LIMIT),
      now: deps.now(),
    },
  );
  if (!limit.allowed)
    return {
      response: Response.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "retry-after": String(limit.retryAfterSeconds),
          },
        },
      ),
    };
  return { ctx };
}

const putSchema = z
  .object({
    level: z.enum(PRIVACY_LEVELS),
    config: privacyConfigSchema.optional(),
  })
  .strict();

export async function handlePrivacyGet(
  request: Request,
  deps: PrivacyAccountDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps, "read");
    if ("response" in auth) return auth.response;
    return json(
      await loadPrivacyView(deps.db(), auth.ctx.organizationId, deps.now()),
    );
  } catch (error) {
    deps.log.error("confidentialité : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

export async function handlePrivacyPut(
  request: Request,
  deps: PrivacyAccountDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps, "write");
    if ("response" in auth) return auth.response;
    let body: z.infer<typeof putSchema>;
    try {
      const result = putSchema.safeParse(await request.json());
      if (!result.success) return json({ error: "invalid_request" }, 422);
      body = result.data;
    } catch {
      return json({ error: "invalid_json" }, 422);
    }
    const org = auth.ctx.organizationId;
    const config = privacyConfigSchema.parse(body.config ?? {});
    const saved = await savePolicy(deps.db(), {
      organizationId: org,
      level: body.level,
      config,
      createdBy: auth.ctx.userId,
    });
    if (saved.changed) {
      deps.onPolicyChanged?.(org);
      deps.log.info("politique de confidentialité enregistrée", {
        organizationId: org,
        userId: auth.ctx.userId,
        version: saved.version,
        level: body.level,
      });
    }
    return json({
      version: saved.version,
      changed: saved.changed,
      level: body.level,
      config: configView(resolvePolicy(body.level, config)),
    });
  } catch (error) {
    if (error instanceof InvalidPolicyError)
      return json({ error: "invalid_request" }, 422);
    deps.log.error("confidentialité : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}

const EOL = "\r\n";
const REPORT_COLUMNS = [
  "day",
  "product",
  "operation",
  "decision",
  "destination",
  "rules",
  "count",
  "masked_items",
] as const;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export async function handlePrivacyReport(
  request: Request,
  deps: PrivacyAccountDeps,
): Promise<Response> {
  try {
    const auth = await authorize(request, deps, "export");
    if ("response" in auth) return auth.response;
    const now = deps.now();
    const raw =
      new URL(request.url).searchParams.get("month") ??
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = MONTH.exec(raw);
    const year = Number(m?.[1]);
    if (!m || year < 2020 || year > 2100)
      return json({ error: "invalid_month" }, 422);
    const month = Number(m[2]);
    const rows = await monthlyReportRows(
      deps.db(),
      auth.ctx.organizationId,
      year,
      month,
    );
    const lines = rows.map((r) =>
      [
        r.day,
        csvText(r.product),
        csvText(r.operation),
        csvText(r.decision),
        csvText(r.destination),
        csvText(r.rules),
        String(r.count),
        String(r.maskedItems),
      ].join(","),
    );
    const csv = `${CSV_BOM}${REPORT_COLUMNS.join(",")}${EOL}${lines.map((l) => l + EOL).join("")}`;
    deps.log.info("export CSV du rapport de confidentialité", {
      organizationId: auth.ctx.organizationId,
      month: raw,
      rows: rows.length,
    });
    return new Response(csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="nexora-confidentialite-${raw}.csv"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    deps.log.error("rapport de confidentialité : erreur interne", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
