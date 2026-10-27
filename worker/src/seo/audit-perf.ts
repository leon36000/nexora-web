import type { AuditFinding } from "./issues.ts";

/**
 * Volet « performance » : Lighthouse (Apache-2.0, API Node) en profil mobile par défaut, sur un nombre BORNÉ de pages
 * (`SEO_AUDIT_PERF_MAX_PAGES`, 6 par défaut : une mesure dure environ 20 s). Objectif du projet : ≥ 95 sur les pages clés.
 * Sous 95 : avertissement ; sous 80 : erreur. Les scores sont conservés dans le résumé de l'audit.
 */
export interface LighthouseScores {
  performance: number | null;
  accessibility: number | null;
  "best-practices": number | null;
  seo: number | null;
  metrics: { lcpMs: number | null; cls: number | null; tbtMs: number | null };
}
export type RunLighthouse = (url: string) => Promise<LighthouseScores>;

export const PERF_TARGET = 0.95;
export const PERF_ERROR_BELOW = 0.8;

export function scoresToFindings(
  publicUrl: string,
  s: LighthouseScores,
): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const cat of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ] as const) {
    const v = s[cat];
    if (v === null || v >= PERF_TARGET) continue;
    out.push({
      kind: "perf",
      rule: `perf.lighthouse-${cat}`,
      severity: v < PERF_ERROR_BELOW ? "error" : "warning",
      url: publicUrl,
      key: cat,
      message: `Lighthouse mobile — ${cat} : ${Math.round(v * 100)}/100 (objectif ${PERF_TARGET * 100}).`,
      detail: { score: Math.round(v * 100), category: cat, metrics: s.metrics },
    });
  }
  return out;
}

/** Exécution réelle : Lighthouse sur le Chromium de Playwright (déjà installé), sans interface. */
export async function createLighthouseRunner(): Promise<{
  run: RunLighthouse;
  close(): Promise<void>;
}> {
  const { chromium } = await import("playwright");
  const chromeLauncher = await import("chrome-launcher");
  const { default: lighthouse } = await import("lighthouse");
  const chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
  });
  return {
    async run(url) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      });
      const lhr = result?.lhr;
      if (!lhr) throw new Error("Lighthouse n'a rien produit");
      const cat = (id: string) => lhr.categories[id]?.score ?? null;
      const num = (id: string) => {
        const v = lhr.audits[id]?.numericValue;
        return typeof v === "number" ? Math.round(v * 1000) / 1000 : null;
      };
      return {
        performance: cat("performance"),
        accessibility: cat("accessibility"),
        "best-practices": cat("best-practices"),
        seo: cat("seo"),
        metrics: {
          lcpMs: num("largest-contentful-paint"),
          cls: num("cumulative-layout-shift"),
          tbtMs: num("total-blocking-time"),
        },
      };
    },
    close: async () => {
      await chrome.kill();
    },
  };
}

export async function auditPerf(
  pages: readonly { fetchUrl: string; publicUrl: string }[],
  run: RunLighthouse,
  maxPages = 6,
): Promise<{
  findings: AuditFinding[];
  measured: { url: string; scores: LighthouseScores }[];
  failedPages: string[];
  covered: string[];
}> {
  const findings: AuditFinding[] = [];
  const measured: { url: string; scores: LighthouseScores }[] = [];
  const failedPages: string[] = [];
  const covered: string[] = [];
  for (const p of pages.slice(0, maxPages)) {
    try {
      const scores = await run(p.fetchUrl);
      measured.push({ url: p.publicUrl, scores });
      findings.push(...scoresToFindings(p.publicUrl, scores));
      covered.push(p.publicUrl);
    } catch {
      failedPages.push(p.publicUrl);
    }
  }
  return { findings, measured, failedPages, covered };
}
