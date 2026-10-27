// Génère le PDF du guide de branchement Proxmox à partir de docs/vps/guide-branchement-proxmox.md.
//   bun run guide:vps            (depuis la racine du dépôt)
// Chromium (Playwright, déjà utilisé par les audits) imprime la page : aucune autre dépendance.
// Le titre du PDF porte l'empreinte du texte source ; le test worker/src/vps-guide/guide.test.ts échoue
// si le PDF commité ne correspond plus à la source.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  buildGuideHtml,
  GUIDE_MD,
  GUIDE_PDF,
  sourceHash,
} from "../src/vps-guide/guide.ts";

const md = readFileSync(GUIDE_MD, "utf8");
const date = new Date().toLocaleDateString("fr-CA", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Rien ne doit sortir : le guide est autonome.
  await page.route("**/*", (route) =>
    route.request().url().startsWith("data:") ||
    route.request().url() === "about:blank"
      ? route.continue()
      : route.abort(),
  );
  await page.setContent(buildGuideHtml(md, { date }), { waitUntil: "load" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#6b7a90;padding:0 18mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>Nexora — Guide de branchement d\'un serveur Proxmox VE</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: "16mm", bottom: "18mm", left: "18mm", right: "18mm" },
  });
  writeFileSync(GUIDE_PDF, pdf);
  console.log(
    `PDF écrit : ${GUIDE_PDF} (${pdf.length} octets, source ${sourceHash(md)})`,
  );
} finally {
  await browser.close();
}
