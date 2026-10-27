import { and, type Database, eq, seoAudits, sql } from "@nexora/db";
import type { Logger } from "@nexora/log";
import { scrubString } from "@nexora/log";
import { keepJobAlive } from "../keepalive.ts";
import type { JobHandler } from "../registry.ts";
import { auditA11y, createAxeRunner, type RunAxe } from "./audit-a11y.ts";
import { auditLinks, type RunLychee } from "./audit-links.ts";
import {
  auditPerf,
  createLighthouseRunner,
  type LighthouseScores,
  type RunLighthouse,
} from "./audit-perf.ts";
import {
  auditStructure,
  readSitemap,
  type SitemapPages,
} from "./audit-structure.ts";
import { type AuditFinding, recordFindings } from "./issues.ts";

/**
 * Audit planifié (file `jobs`, type `seo.audit`, charge { auditId }). Quatre volets sur les pages du sitemap :
 * structure SEO, liens cassés (lychee), accessibilité (axe), performance (Lighthouse). Chaque volet réussit ou échoue
 * SEUL : un volet en échec n'efface pas les constats des autres. Résultats : `seo_audits` (résumé) et `seo_issues`.
 */
type Env = Record<string, string | undefined>;
type Volet = "structure" | "links" | "a11y" | "perf";
const VOLETS: Volet[] = ["structure", "links", "a11y", "perf"];

export interface AuditDeps {
  db: Database;
  log: Logger;
  env?: Env;
  fetchImpl?: typeof fetch;
  runLychee?: RunLychee;
  axe?: () => Promise<{ run: RunAxe; close(): Promise<void> }>;
  lighthouse?: () => Promise<{ run: RunLighthouse; close(): Promise<void> }>;
}

export function auditBaseUrl(env: Env): string {
  return (
    env.SEO_AUDIT_BASE_URL ??
    env.NEXORA_APP_INTERNAL_URL ??
    env.SITE_URL ??
    "http://127.0.0.1:3500"
  ).replace(/\/+$/, "");
}

const clean = (e: unknown) =>
  scrubString(e instanceof Error ? e.message : "erreur inconnue").slice(0, 300);

/** Pages « clés » d'abord (chemins courts, français avant anglais) pour le volet coûteux. */
export function keyPagesFirst(pages: readonly SitemapPages[]): SitemapPages[] {
  const depth = (p: SitemapPages) =>
    p.path
      .replace(/^\/en(?=\/|$)/, "")
      .split("/")
      .filter(Boolean).length;
  const isEn = (p: SitemapPages) => /^\/en(\/|$)/.test(p.path);
  return [...pages].sort(
    (a, b) => depth(a) - depth(b) || Number(isEn(a)) - Number(isEn(b)),
  );
}

export async function executeAudit(
  deps: AuditDeps,
  auditId: string,
): Promise<"succeeded" | "failed" | "skipped"> {
  const { db, log } = deps;
  const env = deps.env ?? process.env;
  const [claimed] = await db
    .update(seoAudits)
    .set({ status: "running", startedAt: new Date() })
    .where(
      and(
        eq(seoAudits.id, auditId),
        // Réclamation unique ; un audit « en cours » depuis plus de 30 minutes est celui d'un worker mort : on le reprend.
        sql`(${seoAudits.status} = 'queued' OR (${seoAudits.status} = 'running' AND ${seoAudits.startedAt} < now() - interval '30 minutes'))`,
      ),
    )
    .returning();
  if (!claimed) return "skipped";
  const base = auditBaseUrl(env);
  const wanted: Volet[] =
    claimed.kind === "all" ? VOLETS : [claimed.kind as Volet];
  const summary: Record<string, unknown> = {};
  let total = 0;
  let okVolets = 0;

  let pages: SitemapPages[];
  try {
    pages = await readSitemap(base, deps.fetchImpl);
  } catch (e) {
    const error = `sitemap illisible : ${clean(e)}`;
    await db
      .update(seoAudits)
      .set({ status: "failed", error, baseUrl: base, finishedAt: new Date() })
      .where(eq(seoAudits.id, auditId));
    return "failed";
  }
  if (pages.length === 0) {
    await db
      .update(seoAudits)
      .set({
        status: "failed",
        error: "le sitemap ne liste aucune page",
        baseUrl: base,
        finishedAt: new Date(),
      })
      .where(eq(seoAudits.id, auditId));
    return "failed";
  }

  const finishVolet = async (
    volet: Volet,
    findings: AuditFinding[],
    covered: string[],
    extra: Record<string, unknown>,
  ) => {
    const r = await recordFindings(db, auditId, volet, findings, covered);
    total += r.recorded;
    okVolets += 1;
    summary[volet] = {
      status: "ok",
      issues: r.recorded,
      resolved: r.resolved,
      errors: findings.filter((f) => f.severity === "error").length,
      warnings: findings.filter((f) => f.severity === "warning").length,
      ...extra,
    };
  };
  const failVolet = (volet: Volet, e: unknown) => {
    summary[volet] = { status: "error", error: clean(e) };
    log.warn("volet d'audit en échec", { auditId, volet, error: clean(e) });
  };
  const allPublic = pages.map((p) => p.publicUrl);

  for (const volet of wanted) {
    try {
      if (volet === "structure") {
        const r = await auditStructure(base, pages, deps.fetchImpl);
        await finishVolet("structure", r.findings, allPublic, {
          pages: r.pages,
        });
      } else if (volet === "links") {
        const r = await auditLinks(pages, deps.runLychee, {
          internalOrigin: base,
          publicOrigin: new URL(pages[0]?.publicUrl ?? base).origin,
        });
        await finishVolet("links", r.findings, allPublic, {
          linksChecked: r.checked,
        });
      } else if (volet === "a11y") {
        const runner = await (deps.axe ?? createAxeRunner)();
        try {
          const r = await auditA11y(pages, runner);
          const failed = new Set(r.failedPages.map((s) => s.split(" (")[0]));
          await finishVolet(
            "a11y",
            r.findings,
            allPublic.filter((u) => !failed.has(u)),
            {
              pages: r.checked,
              viewports: ["390", "1440"],
              failedPages: r.failedPages,
            },
          );
        } finally {
          await runner.close();
        }
      } else {
        const max = Number(env.SEO_AUDIT_PERF_MAX_PAGES) || 6;
        const runner = await (deps.lighthouse ?? createLighthouseRunner)();
        try {
          const r = await auditPerf(keyPagesFirst(pages), runner.run, max);
          await finishVolet("perf", r.findings, r.covered, {
            pages: r.measured.length,
            profile: "mobile (Lighthouse)",
            scores: r.measured.map((m) => ({
              url: m.url,
              ...scoreSummary(m.scores),
            })),
            failedPages: r.failedPages,
          });
        } finally {
          await runner.close();
        }
      }
    } catch (e) {
      failVolet(volet, e);
    }
  }

  const status = okVolets > 0 ? "succeeded" : "failed";
  await db
    .update(seoAudits)
    .set({
      status,
      baseUrl: base,
      pagesChecked: pages.length,
      issuesFound: total,
      summary,
      error:
        status === "failed"
          ? "tous les volets ont échoué"
          : Object.values(summary).some(
                (v) => (v as { status?: string }).status === "error",
              )
            ? "au moins un volet a échoué (voir le résumé)"
            : null,
      finishedAt: new Date(),
    })
    .where(eq(seoAudits.id, auditId));
  log.info("audit terminé", {
    auditId,
    status,
    pages: pages.length,
    issues: total,
  });
  return status;
}

const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
const scoreSummary = (s: LighthouseScores) => ({
  performance: pct(s.performance),
  accessibility: pct(s.accessibility),
  bestPractices: pct(s["best-practices"]),
  seo: pct(s.seo),
  ...s.metrics,
});

export function createAuditHandler(deps: AuditDeps): JobHandler {
  return async (job) => {
    const auditId = job.payload.auditId;
    if (typeof auditId !== "string") throw new Error("auditId manquant");
    const stop = keepJobAlive(deps.db, job.id);
    try {
      await executeAudit(deps, auditId);
    } finally {
      stop();
    }
  };
}
