// Mesure Lighthouse mobile (profil par défaut) de quelques pages, 3 mesures chacune, et affiche la médiane.
//   SEO_AUDIT_BASE_URL=http://localhost:3521 node worker/scripts/dev-lighthouse.ts / /vps /modeles
import { createLighthouseRunner } from "../src/seo/audit-perf.ts";

const base = process.env.SEO_AUDIT_BASE_URL ?? "http://localhost:3521";
const paths = process.argv.slice(2);
const runs = Number(process.env.RUNS ?? 3);
const median = (a: number[]) =>
  [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const { run, close } = await createLighthouseRunner();
for (const p of paths) {
  const rows = [];
  for (let i = 0; i < runs; i++) rows.push(await run(base + p));
  const m = (f: (r: (typeof rows)[number]) => number | null) =>
    median(rows.map((r) => f(r) ?? 0));
  console.log(
    `${p}  perf ${Math.round(m((r) => r.performance) * 100)} (${rows.map((r) => Math.round((r.performance ?? 0) * 100)).join("/")})` +
      `  a11y ${Math.round(m((r) => r.accessibility) * 100)}  bp ${Math.round(m((r) => r["best-practices"]) * 100)}  seo ${Math.round(m((r) => r.seo) * 100)}` +
      `  LCP ${Math.round(m((r) => r.metrics.lcpMs))} ms  CLS ${m((r) => r.metrics.cls)}  TBT ${Math.round(m((r) => r.metrics.tbtMs))} ms`,
  );
}
await close();
