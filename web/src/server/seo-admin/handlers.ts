import {
  and,
  type Database,
  desc,
  enqueue,
  eq,
  inArray,
  indexingSubmissions,
  isNull,
  SEO_ADAPTER_KEYS,
  SEO_AUDIT_KINDS,
  type SeoAdapterKey,
  type SeoAuditKind,
  type SeoIssueSeverity,
  seoAdapters,
  seoAudits,
  seoIssues,
  seoSettings,
  sitemapSnapshots,
  sql,
  vaultSecrets,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import {
  allowMethods,
  HttpError,
  json,
  limitParam,
  readBody,
  runAdminRoute,
  uuidParam,
} from "../site-agents/http";
import {
  type AdapterState,
  adapterState,
  adapterStateDetail,
  SEO_ADAPTER_LABELS,
  SEO_ADAPTER_SECRET_REFS,
} from "./adapters";

/**
 * API d'administration du SEO : `/api/admin/seo/*` (S8). Consommée par le module Directus « SEO ». Lecture des audits,
 * problèmes, soumissions d'indexation et état des adaptateurs ; lancement d'audits et d'indexations par la file de
 * tâches (le worker fait le travail). Aucun appel externe ici, aucun secret dans les réponses.
 */

export interface SeoAdminDeps {
  db: () => Database;
  adminToken: string | undefined;
  log: Logger;
  now: () => Date;
  env: Record<string, string | undefined>;
}

const SEVERITY_ORDER = sql`CASE ${seoIssues.severity} WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`;

const auditsBody = z
  .object({ kinds: z.array(z.enum(SEO_AUDIT_KINDS)).min(1).max(5) })
  .partial()
  .strict();
const indexingBody = z.object({ dryRun: z.boolean() }).partial().strict();
const adapterPatch = z.object({ writeEnabled: z.boolean() }).strict();
const issuePatch = z.object({ status: z.enum(["ignored", "open"]) }).strict();

const isAdapterKey = (k: string | undefined): k is SeoAdapterKey =>
  !!k && (SEO_ADAPTER_KEYS as readonly string[]).includes(k);

export async function handleSeoAdmin(
  request: Request,
  path: string[],
  deps: SeoAdminDeps,
): Promise<Response> {
  return runAdminRoute(
    request,
    path,
    { adminToken: deps.adminToken, log: deps.log },
    "seo",
    () => route(request, path, deps),
  );
}

async function loadAdapters(db: Database) {
  await db
    .insert(seoAdapters)
    .values(SEO_ADAPTER_KEYS.map((key) => ({ key })))
    .onConflictDoNothing();
  const rows = await db.select().from(seoAdapters);
  const refs: string[] = [];
  for (const r of Object.values(SEO_ADAPTER_SECRET_REFS)) if (r) refs.push(r);
  const present = await db
    .select({ ref: vaultSecrets.ref })
    .from(vaultSecrets)
    .where(
      and(inArray(vaultSecrets.ref, refs), isNull(vaultSecrets.revokedAt)),
    );
  const presentRefs = new Set(present.map((r) => r.ref));
  const [indexnow] = await db
    .select({ value: seoSettings.value })
    .from(seoSettings)
    .where(eq(seoSettings.key, "indexnow_key"));
  return SEO_ADAPTER_KEYS.map((key) => {
    const row = rows.find((r) => r.key === key);
    const ref = SEO_ADAPTER_SECRET_REFS[key];
    const secretPresent =
      key === "indexnow" ? !!indexnow?.value : !!ref && presentRefs.has(ref);
    const lastCheckStatus = row?.lastCheckStatus ?? "never";
    const writeEnabled = row?.writeEnabled ?? false;
    const state: AdapterState = adapterState({
      secretPresent,
      lastCheckStatus,
      writeEnabled,
    });
    return {
      key,
      label: SEO_ADAPTER_LABELS[key].label,
      role: SEO_ADAPTER_LABELS[key].role,
      state,
      stateDetail: adapterStateDetail({
        key,
        secretPresent,
        lastCheckStatus,
        lastCheckDetail: row?.lastCheckDetail ?? null,
      }),
      secretRef: ref,
      secretPresent,
      writeEnabled,
      lastCheckAt: row?.lastCheckAt ?? null,
      lastCheckStatus,
      lastCheckDetail: row?.lastCheckDetail ?? null,
    };
  });
}

async function route(
  request: Request,
  path: string[],
  deps: SeoAdminDeps,
): Promise<Response> {
  const db = deps.db();
  const now = deps.now();
  const url = new URL(request.url);
  const [a, b, c] = path;

  if (!a) {
    allowMethods(request, "GET");
    const [adapters, audits, counts, submissions, snapshot] = await Promise.all(
      [
        loadAdapters(db),
        db
          .selectDistinctOn([seoAudits.kind])
          .from(seoAudits)
          .orderBy(seoAudits.kind, desc(seoAudits.createdAt)),
        db
          .select({
            severity: seoIssues.severity,
            n: sql<number>`count(*)::int`,
          })
          .from(seoIssues)
          .where(eq(seoIssues.status, "open"))
          .groupBy(seoIssues.severity),
        db
          .select()
          .from(indexingSubmissions)
          .orderBy(desc(indexingSubmissions.createdAt))
          .limit(10),
        db
          .select({
            takenAt: sitemapSnapshots.takenAt,
            urlCount: sitemapSnapshots.urlCount,
          })
          .from(sitemapSnapshots)
          .orderBy(desc(sitemapSnapshots.takenAt))
          .limit(1),
      ],
    );
    const open: Record<SeoIssueSeverity, number> = {
      error: 0,
      warning: 0,
      info: 0,
    };
    for (const row of counts) open[row.severity] = row.n;
    return json({
      adapters,
      audits,
      issues: { open },
      indexing: {
        lastSubmissions: submissions,
        lastSnapshotAt: snapshot[0]?.takenAt ?? null,
        lastSnapshotCount: snapshot[0]?.urlCount ?? null,
      },
      robots: {
        siteEnv: deps.env.SITE_ENV ?? "development",
        aiTraining: deps.env.ROBOTS_AI_TRAINING ?? "disallow",
      },
    });
  }

  if (a === "audits") {
    if (!b) {
      const method = allowMethods(request, "GET", "POST");
      if (method === "GET") {
        const rows = await db
          .select()
          .from(seoAudits)
          .orderBy(desc(seoAudits.createdAt))
          .limit(limitParam(url, 20, 100));
        return json({ audits: rows });
      }
      const body = await readBody(request, auditsBody, { optional: true });
      const kinds: SeoAuditKind[] = [
        ...new Set<SeoAuditKind>(
          body.kinds?.includes("all") || !body.kinds ? ["all"] : body.kinds,
        ),
      ];
      const ids: string[] = [];
      await db.transaction(async (tx) => {
        const t = tx as unknown as Database;
        for (const kind of kinds) {
          const [audit] = await t
            .insert(seoAudits)
            .values({ kind, status: "queued", trigger: "manual" })
            .returning({ id: seoAudits.id });
          if (!audit) throw new Error("audit non créé");
          await enqueue(t, {
            type: "seo.audit",
            payload: { auditId: audit.id },
            idempotencyKey: `seo-audit:${audit.id}`,
            maxAttempts: 1,
          });
          ids.push(audit.id);
        }
      });
      deps.log.info("seo : audit demandé", { kinds });
      return json({ auditId: ids[0], auditIds: ids }, 202);
    }
    allowMethods(request, "GET");
    const [audit] = await db
      .select()
      .from(seoAudits)
      .where(eq(seoAudits.id, uuidParam(b)));
    if (!audit) throw new HttpError(404, "not_found");
    const issues = await db
      .select()
      .from(seoIssues)
      .where(eq(seoIssues.auditId, audit.id))
      .orderBy(SEVERITY_ORDER, desc(seoIssues.lastSeenAt))
      .limit(500);
    return json({ audit, issues });
  }

  if (a === "issues") {
    if (!b) {
      allowMethods(request, "GET");
      const status = url.searchParams.get("status") ?? "open";
      const kind = url.searchParams.get("kind");
      const severity = url.searchParams.get("severity");
      if (!["open", "resolved", "ignored", "all"].includes(status))
        throw new HttpError(422, "invalid_request");
      if (severity && !["error", "warning", "info"].includes(severity))
        throw new HttpError(422, "invalid_request");
      if (kind && !/^[a-z0-9_-]{1,30}$/.test(kind))
        throw new HttpError(422, "invalid_request");
      const filters = [
        status === "all"
          ? undefined
          : eq(seoIssues.status, status as "open" | "resolved" | "ignored"),
        kind ? eq(seoIssues.kind, kind) : undefined,
        severity
          ? eq(seoIssues.severity, severity as SeoIssueSeverity)
          : undefined,
      ].filter((f) => f !== undefined);
      const rows = await db
        .select()
        .from(seoIssues)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(SEVERITY_ORDER, desc(seoIssues.lastSeenAt))
        .limit(limitParam(url, 100, 500));
      return json({ issues: rows });
    }
    allowMethods(request, "PATCH");
    const id = uuidParam(b);
    const body = await readBody(request, issuePatch);
    const [issue] = await db
      .select()
      .from(seoIssues)
      .where(eq(seoIssues.id, id));
    if (!issue) throw new HttpError(404, "not_found");
    const ok =
      (issue.status === "open" && body.status === "ignored") ||
      (issue.status === "ignored" && body.status === "open") ||
      issue.status === body.status;
    if (!ok) throw new HttpError(409, "invalid_transition");
    const [updated] = await db
      .update(seoIssues)
      .set({ status: body.status, resolvedAt: null })
      .where(eq(seoIssues.id, id))
      .returning();
    return json({ issue: updated });
  }

  if (a === "indexing") {
    if (!b) {
      allowMethods(request, "GET");
      const [submissions, snapshot] = await Promise.all([
        db
          .select()
          .from(indexingSubmissions)
          .orderBy(desc(indexingSubmissions.createdAt))
          .limit(limitParam(url, 50, 200)),
        db
          .select({
            takenAt: sitemapSnapshots.takenAt,
            urlCount: sitemapSnapshots.urlCount,
          })
          .from(sitemapSnapshots)
          .orderBy(desc(sitemapSnapshots.takenAt))
          .limit(1),
      ]);
      return json({ submissions, lastSnapshot: snapshot[0] ?? null });
    }
    if (b === "run" && !c) {
      allowMethods(request, "POST");
      const body = await readBody(request, indexingBody, { optional: true });
      const dryRun = body.dryRun === true;
      const job = await enqueue(db, {
        type: "seo.index",
        payload: { trigger: "manual", dryRun },
        idempotencyKey: `seo-index:manual:${dryRun ? "dry" : "live"}:${Math.floor(now.getTime() / 60_000)}`,
        maxAttempts: 1,
      });
      deps.log.info("seo : indexation demandée", { dryRun });
      return json({ jobId: job.id, dryRun }, 202);
    }
    throw new HttpError(404, "not_found");
  }

  if (a === "adapters") {
    if (!isAdapterKey(b)) throw new HttpError(404, "not_found");
    const key = b;
    if (!c) {
      allowMethods(request, "PATCH");
      const body = await readBody(request, adapterPatch);
      const before = (await loadAdapters(db)).find((x) => x.key === key);
      if (!before) throw new HttpError(404, "not_found");
      if (body.writeEnabled) {
        const readable = adapterState({
          secretPresent: before.secretPresent,
          lastCheckStatus: before.lastCheckStatus,
          writeEnabled: false,
        });
        if (readable === "not_connected")
          throw new HttpError(409, "adapter_not_ready");
      }
      await db
        .update(seoAdapters)
        .set({ writeEnabled: body.writeEnabled, updatedAt: sql`now()` })
        .where(eq(seoAdapters.key, key));
      deps.log.info("seo : autorisation d’écriture modifiée", {
        adapter: key,
        writeEnabled: body.writeEnabled,
      });
      return json({
        adapter: (await loadAdapters(db)).find((x) => x.key === key),
      });
    }
    if (c === "check") {
      allowMethods(request, "POST");
      const job = await enqueue(db, {
        type: "seo.adapter-check",
        payload: { key },
        idempotencyKey: `seo-adapter-check:${key}:${Math.floor(now.getTime() / 60_000)}`,
        maxAttempts: 1,
      });
      return json({ jobId: job.id }, 202);
    }
    throw new HttpError(404, "not_found");
  }

  throw new HttpError(404, "not_found");
}
