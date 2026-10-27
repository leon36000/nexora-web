// Rastérise les tuiles d'application (SVG) en PNG et assemble le favicon.ico.
// Usage : bun docs/marque/outils/rasteriser.mjs <racine-du-dépôt>   (Playwright vient de web/node_modules)
import { chromium } from "../../../web/node_modules/@playwright/test/index.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const at = (p) => join(root, p);
const tiles = at("docs/marque/logos/app/") + "/";
const svg = (name) => readFileSync(`${tiles}${name}`, "utf8");

const browser = await chromium.launch();
async function png(source, px) {
  const page = await browser.newPage({ viewport: { width: px, height: px } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${source}`,
  );
  const data = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
  await page.close();
  return data;
}

mkdirSync(at("web/public"), { recursive: true });
writeFileSync(at("web/src/app/apple-icon.png"), await png(svg("tuile-apple.svg"), 180));
writeFileSync(at("web/public/icon-192.png"), await png(svg("tuile-apple.svg"), 192));
writeFileSync(at("web/public/icon-512.png"), await png(svg("tuile-apple.svg"), 512));
writeFileSync(at("web/public/icon-maskable-512.png"), await png(svg("tuile-maskable.svg"), 512));

// favicon.ico : trois images PNG (16, 32, 48 px).
const sizes = [16, 32, 48];
const images = [];
for (const s of sizes) images.push(await png(svg("tuile-petite.svg"), s));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((img, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(sizes[i], 0);
  e.writeUInt8(sizes[i], 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.length;
  return e;
});
writeFileSync(at("web/src/app/favicon.ico"), Buffer.concat([head, ...entries, ...images]));
await browser.close();
console.log("png et ico écrits");
