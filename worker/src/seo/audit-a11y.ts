import type { AuditFinding } from "./issues.ts";

/**
 * Volet « accessibilité » : axe-core via Playwright (Chromium) sur chaque page, à 390 px (mobile) et 1440 px
 * (bureau). Un constat par règle et par page ; `impact` axe -> gravité (critique/sérieux = erreur).
 */
export interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; html?: string }[];
}
export type RunAxe = (
  url: string,
  viewport: { width: number; height: number },
) => Promise<AxeViolation[]>;

export const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "bureau", width: 1440, height: 900 },
] as const;

const severityOf = (impact?: string | null): AuditFinding["severity"] =>
  impact === "critical" || impact === "serious"
    ? "error"
    : impact === "moderate"
      ? "warning"
      : "info";

export function violationsToFindings(
  publicUrl: string,
  viewport: string,
  violations: readonly AxeViolation[],
): AuditFinding[] {
  return violations.map((v) => ({
    kind: "a11y" as const,
    rule: `a11y.${v.id}`,
    severity: severityOf(v.impact),
    url: publicUrl,
    key: `${v.id}@${viewport}`,
    message: `${v.help} (${v.nodes.length} élément(s), ${viewport})`,
    detail: {
      impact: v.impact ?? null,
      viewport,
      helpUrl: v.helpUrl,
      targets: v.nodes.slice(0, 3).map((n) => n.target),
    },
  }));
}

/** Exécution réelle : un navigateur pour tout le volet. */
export async function createAxeRunner(): Promise<{
  run: RunAxe;
  close(): Promise<void>;
}> {
  const { chromium } = await import("playwright");
  const { AxeBuilder } = await import("@axe-core/playwright");
  const browser = await chromium.launch({ headless: true });
  return {
    async run(url, viewport) {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        return result.violations as unknown as AxeViolation[];
      } finally {
        await context.close();
      }
    },
    close: () => browser.close(),
  };
}

export async function auditA11y(
  pages: readonly { fetchUrl: string; publicUrl: string }[],
  runner: { run: RunAxe },
): Promise<{
  findings: AuditFinding[];
  checked: number;
  failedPages: string[];
}> {
  const findings: AuditFinding[] = [];
  const failedPages: string[] = [];
  for (const p of pages)
    for (const vp of VIEWPORTS) {
      try {
        const violations = await runner.run(p.fetchUrl, vp);
        findings.push(
          ...violationsToFindings(p.publicUrl, vp.name, violations),
        );
      } catch {
        failedPages.push(`${p.publicUrl} (${vp.name})`);
      }
    }
  return { findings, checked: pages.length, failedPages };
}
