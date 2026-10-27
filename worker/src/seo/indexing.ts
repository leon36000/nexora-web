import {
  type Database,
  desc,
  indexingSubmissions,
  sitemapSnapshots,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { scrubString } from "@nexora/log";
import { parseSitemapXml } from "@nexora/seo";
import {
  type AdapterDeps,
  adapterReadiness,
  getOrCreateIndexNowKey,
} from "./adapters.ts";
import { auditBaseUrl } from "./audit.ts";

/**
 * Indexation après publication : diff du sitemap (nouvelles URL ou `lastmod` changé) -> IndexNow et Bing.
 * Règles : rien n'est envoyé sans (1) clé présente, (2) vérification réussie, (3) autorisation d'écriture donnée par un
 * humain, (4) site en production (`SITE_ENV=production`). Sinon la soumission est journalisée « ignorée » avec sa raison.
 * La photographie du sitemap n'avance que si au moins un moteur a accepté : ce qui n'a pas pu être envoyé reste dans
 * le prochain diff (aucune URL perdue).
 */
export interface IndexingDeps extends AdapterDeps {
  log: Logger;
}
export interface IndexingJob {
  trigger: "manual" | "publish" | "schedule";
  dryRun?: boolean;
}
export interface IndexingOutcome {
  changed: string[];
  engines: { engine: string; status: string; detail: string }[];
  snapshotSaved: boolean;
}

export function diffSitemap(
  previous: Record<string, string | null> | null,
  current: Record<string, string | null>,
): string[] {
  if (!previous) return Object.keys(current);
  return Object.entries(current)
    .filter(([url, lastmod]) => !(url in previous) || previous[url] !== lastmod)
    .map(([url]) => url);
}

export async function runIndexing(
  deps: IndexingDeps,
  job: IndexingJob,
): Promise<IndexingOutcome> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = auditBaseUrl(env);
  const res = await doFetch(`${base}/sitemap.xml`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`sitemap.xml répond ${res.status}`);
  const entries = parseSitemapXml(await res.text());
  const current = Object.fromEntries(
    entries.map((e) => [e.url, e.lastmod ?? null]),
  );

  const [last] = await deps.db
    .select()
    .from(sitemapSnapshots)
    .orderBy(desc(sitemapSnapshots.takenAt))
    .limit(1);
  const changed = diffSitemap(last?.urls ?? null, current);
  const outcome: IndexingOutcome = {
    changed,
    engines: [],
    snapshotSaved: false,
  };
  if (changed.length === 0) {
    deps.log.info("indexation : sitemap inchangé", { urls: entries.length });
    return outcome;
  }

  const record = async (
    engine: string,
    status: "dry_run" | "submitted" | "failed" | "skipped",
    detail: string,
    httpStatus?: number,
  ) => {
    outcome.engines.push({ engine, status, detail });
    await deps.db.insert(indexingSubmissions).values({
      engine,
      trigger: job.trigger,
      urlCount: changed.length,
      urlsSample: changed.slice(0, 50),
      status,
      httpStatus: httpStatus ?? null,
      detail: scrubString(detail).slice(0, 400),
    });
  };

  const production = env.SITE_ENV === "production";
  const site = env.SITE_URL ? new URL(env.SITE_URL) : null;
  let anySubmitted = false;

  // --- IndexNow ---
  {
    const r = await adapterReadiness(deps.db, "indexnow");
    if (job.dryRun) {
      await record(
        "indexnow",
        "dry_run",
        `${changed.length} URL à soumettre (simulation, rien d'envoyé).`,
      );
    } else if (!production) {
      await record(
        "indexnow",
        "skipped",
        "Préproduction (SITE_ENV différent de « production ») : aucune soumission.",
      );
    } else if (r.state !== "write") {
      await record(
        "indexnow",
        "skipped",
        `Adaptateur non autorisé en écriture (état : ${r.state}).`,
      );
    } else if (!site) {
      await record("indexnow", "skipped", "SITE_URL est requis.");
    } else {
      const key = await getOrCreateIndexNowKey(deps.db);
      try {
        const r2 = await doFetch("https://api.indexnow.org/IndexNow", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({
            host: site.host,
            key,
            keyLocation: `${site.origin}/${key}.txt`,
            urlList: changed.slice(0, 10_000),
          }),
          signal: AbortSignal.timeout(20_000),
        });
        const ok = r2.status === 200 || r2.status === 202;
        if (ok) anySubmitted = true;
        await record(
          "indexnow",
          ok ? "submitted" : "failed",
          ok
            ? `${changed.length} URL envoyée(s).`
            : `IndexNow a répondu ${r2.status}.`,
          r2.status,
        );
      } catch (e) {
        await record(
          "indexnow",
          "failed",
          e instanceof Error ? e.message : "erreur réseau",
        );
      }
    }
  }

  // --- Bing Webmaster ---
  {
    const r = await adapterReadiness(deps.db, "bing");
    if (job.dryRun) {
      await record(
        "bing",
        "dry_run",
        `${changed.length} URL à soumettre (simulation, rien d'envoyé).`,
      );
    } else if (!production) {
      await record("bing", "skipped", "Préproduction : aucune soumission.");
    } else if (r.state !== "write") {
      await record(
        "bing",
        "skipped",
        r.present
          ? `Adaptateur non autorisé en écriture (état : ${r.state}).`
          : "Aucune clé Bing dans le Coffre : aucun appel.",
      );
    } else if (!site) {
      await record("bing", "skipped", "SITE_URL est requis.");
    } else {
      try {
        const apiKey = await deps.readSecret("seo.bing.api_key");
        const r2 = await doFetch(
          `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              siteUrl: site.origin,
              urlList: changed.slice(0, 500),
            }),
            signal: AbortSignal.timeout(20_000),
          },
        );
        if (r2.ok) anySubmitted = true;
        await record(
          "bing",
          r2.ok ? "submitted" : "failed",
          r2.ok
            ? `${Math.min(changed.length, 500)} URL envoyée(s).`
            : `Bing a répondu ${r2.status}.`,
          r2.status,
        );
      } catch (e) {
        await record(
          "bing",
          "failed",
          e instanceof Error ? e.message : "erreur réseau",
        );
      }
    }
  }

  if (anySubmitted && !job.dryRun) {
    await deps.db
      .insert(sitemapSnapshots)
      .values({ urls: current, urlCount: entries.length });
    outcome.snapshotSaved = true;
  }
  deps.log.info("indexation terminée", {
    changed: changed.length,
    engines: outcome.engines.map((e) => `${e.engine}:${e.status}`),
  });
  return outcome;
}

export type { Database };
