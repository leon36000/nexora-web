import { createHash } from "node:crypto";
import { type Database, seoIssues, sql } from "@nexora/db";
import type { SeoFinding } from "@nexora/seo";

/** Un constat rattaché à un volet d'audit (`structure`, `links`, `a11y`, `perf`). */
export interface AuditFinding extends SeoFinding {
  kind: "structure" | "links" | "a11y" | "perf";
  /** Élément précis au sein de la page (lien visé, règle axe…), pour dédoublonner. */
  key?: string;
}

export const fingerprintOf = (
  f: Pick<AuditFinding, "kind" | "rule" | "url" | "key">,
) =>
  createHash("sha256")
    .update(`${f.kind}|${f.rule}|${f.url}|${f.key ?? ""}`)
    .digest("hex")
    .slice(0, 40);

/**
 * Enregistre les constats d'un volet. Un constat déjà connu est mis à jour (jamais dupliqué) ; un constat résolu
 * qui revient est rouvert ; un constat ignoré par un humain le reste. Après un volet COMPLET, les constats ouverts
 * du volet qu'aucune page contrôlée ne confirme plus passent à « résolu » (`coveredUrls` = pages réellement contrôlées).
 */
export async function recordFindings(
  db: Database,
  auditId: string,
  kind: AuditFinding["kind"],
  findings: readonly AuditFinding[],
  coveredUrls: readonly string[],
): Promise<{ recorded: number; resolved: number }> {
  const seen = new Map<string, AuditFinding>();
  for (const f of findings) seen.set(fingerprintOf(f), f);
  for (const [fingerprint, f] of seen) {
    await db
      .insert(seoIssues)
      .values({
        auditId,
        kind: f.kind,
        severity: f.severity,
        rule: f.rule,
        url: f.url,
        message: f.message.slice(0, 600),
        detail: f.detail ?? {},
        fingerprint,
      })
      .onConflictDoUpdate({
        target: seoIssues.fingerprint,
        set: {
          auditId,
          severity: f.severity,
          message: f.message.slice(0, 600),
          detail: f.detail ?? {},
          lastSeenAt: sql`now()`,
          status: sql`CASE WHEN ${seoIssues.status} = 'resolved' THEN 'open' ELSE ${seoIssues.status} END`,
          resolvedAt: sql`CASE WHEN ${seoIssues.status} = 'resolved' THEN NULL ELSE ${seoIssues.resolvedAt} END`,
        },
      });
  }
  let resolved = 0;
  if (coveredUrls.length > 0) {
    const res = await db.execute(sql`
      UPDATE seo_issues
         SET status = 'resolved', resolved_at = now()
       WHERE kind = ${kind}
         AND status = 'open'
         AND audit_id IS DISTINCT FROM ${auditId}::uuid
         AND url IN (${sql.join(
           coveredUrls.map((u) => sql`${u}`),
           sql`, `,
         )})`);
    resolved = Number((res as unknown as { count?: number }).count ?? 0);
  }
  return { recorded: seen.size, resolved };
}
