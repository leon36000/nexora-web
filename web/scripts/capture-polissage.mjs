// Captures pleine page des pages publiques clés (1440, 1024 et 375 px) + mesures de mise en page.
// Usage : BASE_URL=http://localhost:3711 bun web/scripts/capture-polissage.mjs <avant|apres> [dossier] [filtre]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const base = process.env.BASE_URL ?? "http://localhost:3711";
const label = process.argv[2] ?? "avant";
const root = process.argv[3] || join(homedir(), "Desktop/NexoraSite-wt/captures-polissage");
const filter = process.argv[4];
const out = join(root, label);
mkdirSync(out, { recursive: true });

export const PAGES = [
  ["accueil", "/"],
  ["solutions", "/solutions"],
  ["solution-courriels", "/solutions/courriels"],
  ["workstudio", "/workstudio"],
  ["suite", "/suite"],
  ["apps", "/apps"],
  ["apps-code", "/apps/code"],
  ["apps-rag", "/apps/rag"],
  ["modeles", "/modeles"],
  ["modeles-fiche", "/modeles/nexora/glm-5.3"],
  ["modeles-comparer", "/modeles/comparer"],
  ["modeles-benchmarks", "/modeles/benchmarks"],
  ["docs-api", "/docs/api"],
  ["faq", "/faq"],
  ["contact", "/contact"],
  ["vps", "/vps"],
  ["vps-fiche", "/vps/n8n"],
  ["tarifs", "/tarifs"],
  ["agents", "/agents"],
  ["404", "/page-inconnue-polissage"],
];
const WIDTHS = [1440, 1024, 375];

const browser = await chromium.launch();
const metrics = {};
for (const [name, path] of PAGES) {
  if (filter && !name.includes(filter)) continue;
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 768 ? 812 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      hasTouch: width < 768,
    });
    const page = await context.newPage();
    try {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const vw = window.innerWidth;
        const small = [...document.querySelectorAll("a, button, input, select, textarea, summary")]
          .filter((el) => {
            // une case ou une pastille radio se touche par son libellé : on mesure la cible réelle
            const target = el.matches("input[type=checkbox], input[type=radio]") ? (el.closest("label") ?? el) : el;
            const r = target.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 44 || r.width < 44) && !(el.matches("input[type=checkbox], input[type=radio]") && r.height >= 44)
              && !el.closest(".sr-only, [hidden]") && !(el.tagName === "A" && cs.display === "inline" );
          })
          .map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
        const wide = [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > vw + 1 && !el.closest("[aria-hidden=true]"))
          .slice(0, 5)
          .map((el) => el.tagName.toLowerCase() + "." + String(el.className).slice(0, 40));
        return {
          overflow: document.documentElement.scrollWidth - vw,
          height: document.documentElement.scrollHeight,
          smallTargets: small.length,
          smallSample: small.slice(0, 6),
          wide,
          title: document.title,
        };
      });
      metrics[`${name}@${width}`] = m;
      await page.screenshot({ path: join(out, `${name}-${width}.png`), fullPage: true });
      console.log("capture", name, width, `h=${m.height}`, `débord=${m.overflow}`, `cibles<44=${m.smallTargets}`);
    } catch (e) {
      console.log("ÉCHEC", name, width, String(e).slice(0, 120));
      metrics[`${name}@${width}`] = { error: String(e).slice(0, 200) };
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(join(out, filter ? `mesures-${filter}.json` : "mesures.json"), JSON.stringify(metrics, null, 2));
