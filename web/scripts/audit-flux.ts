#!/usr/bin/env bun
// Flux sortants des pages publiques, vus par un navigateur réel (S9) : charge 5 pages en français et en anglais sur un
// site de PRODUCTION lancé, journalise chaque requête réseau (hôte, type) et chaque violation de CSP, et échoue si une
// requête quitte l'origine du site (polices, CDN, analytique, cartes, vidéos, iframes…).
//   BASE_URL=http://localhost:3790 bun web/scripts/audit-flux.ts [--json sortie.json]
// Aucun formulaire n'est soumis. Le navigateur est lancé sans extension ni profil.
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = (process.env.BASE_URL ?? "http://localhost:3500").replace(
  /\/+$/,
  "",
);
const origin = new URL(BASE).origin;
const PAGES = ["/", "/modeles", "/vps", "/agents", "/compte"];
const jsonOut = process.argv.includes("--json")
  ? process.argv[process.argv.indexOf("--json") + 1]
  : null;

type Row = {
  page: string;
  finalUrl: string;
  status: number;
  requests: number;
  byType: Record<string, number>;
  external: string[];
  csp: string[];
  consoleErrors: string[];
  cookies: string[];
};

const browser = await chromium.launch();
const rows: Row[] = [];
for (const lang of ["fr", "en"] as const) {
  for (const p of PAGES) {
    const path = lang === "en" ? `/en${p === "/" ? "" : p}` : p;
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const urls: Array<{ url: string; type: string }> = [];
    const csp: string[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (r) =>
      urls.push({ url: r.url(), type: r.resourceType() }),
    );
    page.on("console", (m) => {
      const t = m.text();
      if (
        /content security policy|refused to (load|connect|frame|execute)/i.test(
          t,
        )
      )
        csp.push(t.slice(0, 200));
      else if (m.type() === "error") consoleErrors.push(t.slice(0, 200));
    });
    const res = await page.goto(BASE + path, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    // fait défiler la page pour déclencher le chargement différé
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForLoadState("networkidle");
    const cookies = (await context.cookies()).map(
      (c) =>
        `${c.name} (httpOnly=${c.httpOnly}, secure=${c.secure}, sameSite=${c.sameSite})`,
    );
    const byType: Record<string, number> = {};
    for (const u of urls) byType[u.type] = (byType[u.type] ?? 0) + 1;
    const external = [
      ...new Set(
        urls
          .filter(
            (u) =>
              !u.url.startsWith(origin) &&
              !u.url.startsWith("data:") &&
              !u.url.startsWith("blob:") &&
              !u.url.startsWith("about:"),
          )
          .map((u) => `${u.type} ${new URL(u.url).origin}`),
      ),
    ];
    rows.push({
      page: path,
      finalUrl: page.url().replace(origin, ""),
      status: res?.status() ?? 0,
      requests: urls.length,
      byType,
      external,
      csp,
      consoleErrors,
      cookies,
    });
    await context.close();
  }
}
await browser.close();

console.log(
  "| Page | Chargée | HTTP | Requêtes | Types | Hors origine | Violations CSP | Témoins |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows)
  console.log(
    `| ${r.page} | ${r.finalUrl} | ${r.status} | ${r.requests} | ${Object.entries(
      r.byType,
    )
      .map(([k, v]) => `${k} ${v}`)
      .join(
        ", ",
      )} | ${r.external.length ? r.external.join(" ; ") : "aucune"} | ${r.csp.length} | ${r.cookies.length ? r.cookies.join(" ; ") : "aucun"} |`,
  );
const bad = rows.filter((r) => r.external.length > 0 || r.csp.length > 0);
if (rows.some((r) => r.consoleErrors.length))
  console.log(
    "\nErreurs de console :",
    JSON.stringify(
      rows
        .filter((r) => r.consoleErrors.length)
        .map((r) => [r.page, r.consoleErrors]),
    ),
  );
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
console.log(
  bad.length === 0
    ? "\nTOUT EST VERT : aucune requête hors origine, aucune violation de CSP."
    : `\nÉCHEC : ${bad.length} page(s) avec requête externe ou violation de CSP.`,
);
process.exit(bad.length === 0 ? 0 : 1);
