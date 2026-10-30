// Poids de l'accueil : octets transférés (en-têtes compris), par type de ressource, et JavaScript chargé.
// Usage : BASE_URL=http://localhost:3590 bun web/scripts/perf-accueil.mjs [chemin] [passes]
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://localhost:3711";
const path = process.argv[2] ?? "/";
const runs = Number(process.argv[3] ?? 5);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const browser = await chromium.launch();
const results = [];
for (let i = 0; i < runs; i++) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const sizes = { document: 0, script: 0, stylesheet: 0, font: 0, image: 0, other: 0 };
  let count = 0;
  const pending = [];
  page.on("response", (r) => {
    pending.push(
      (async () => {
        try {
          const s = await r.request().sizes();
          const type = r.request().resourceType();
          const key = type in sizes ? type : "other";
          sizes[key] += s.responseBodySize + s.responseHeadersSize;
          count++;
        } catch {}
      })(),
    );
  });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  results.push({ ...sizes, total, count });
  await context.close();
}
await browser.close();
const out = {};
for (const k of Object.keys(results[0])) out[k] = median(results.map((r) => r[k]));
const kb = (n) => `${(n / 1024).toFixed(1)} Ko`;
console.log(`${base}${path} — médiane de ${runs} passes`);
console.log(`  total transféré : ${kb(out.total)} (${out.count} requêtes)`);
console.log(`  JavaScript      : ${kb(out.script)}`);
console.log(`  CSS             : ${kb(out.stylesheet)}`);
console.log(`  document HTML   : ${kb(out.document)}`);
console.log(`  polices         : ${kb(out.font)}`);
console.log(`  images          : ${kb(out.image)}`);
console.log(`  autres          : ${kb(out.other)}`);
