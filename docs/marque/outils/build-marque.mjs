// Génère les actifs vectoriels de la marque Nexora AI (symbole, logotype, monochromes) et le module TypeScript du composant.
//
// Le logotype « Nexora AI » est dessiné en contours (aucune police à charger, aucun saut de mise en page) :
//   - « Nexora » et le « A » sont les contours de Geist 500 (OFL, voir web/src/fonts/LICENSE-geist.txt) ;
//   - le « I » est dessiné à la main avec des empattements, pour qu'on ne lise jamais « Al » (en Geist, I majuscule
//     et l minuscule sont identiques).
//
// Refonte d'octobre 2026 : le symbole n'est plus deux carrés qui se recouvrent mais un « N » en pixels (quatre
// colonnes, quatre rangées) dont la diagonale est l'orange signal : le point de passage. Le logotype ne change pas.
//
// Dépendance d'outil facultative (pas du site) : opentype.js. Avec elle, le logotype est redessiné depuis Geist 500 ;
// sans elle, les contours déjà générés sont relus dans web/src/components/brand/logo-geometry.ts (même résultat).
//   bun add opentype.js && bun /chemin/vers/build-marque.mjs <racine-du-dépôt>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const fmt = (n) => Number(n.toFixed(2));

// --- Couleurs (voir docs/marque/charte.md) ------------------------------------------------------------------------
const INK = "#0a0a0e";
const GRAPHITE = "#121218";
const BONE = "#f5f4ef";
const EMBER = "#ff5a1f"; // orange signal : remplissage, graphisme sur fond sombre
const EMBER_LIGHT = "#f04a10"; // graphisme sur fond clair (3,6:1 sur papier)
const EMBER_TEXT_LIGHT = "#b53a0a"; // 5,7:1 sur papier
const EMBER_TEXT_DARK = "#ff7a45"; // 7,6:1 sur encre

// --- Symbole : un « N » en pixels ---------------------------------------------------------------------------------
// Grille de 64 unités ; l'encre occupe 6..58. Cinq colonnes et cinq rangées de 10,4 unités, sans jeu : les deux
// montants sont l'encre (un rectangle chacun, sans couture), la diagonale (trois carrés qui se touchent par un angle)
// est l'orange signal.
const SYMBOL_BOX = [6, 6, 52, 52];
const N = 5;
const CELL = 10.4;
const GRID = ["x...x", "xo..x", "x.o.x", "x..ox", "x...x"];
/** Rectangles d'une même teinte : les cellules voisines d'une colonne sont fondues en un seul rectangle. */
const pathOf = (ch) => {
  const rects = [];
  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      if (GRID[r][c] !== ch) {
        r++;
        continue;
      }
      let end = r;
      while (end + 1 < N && GRID[end + 1][c] === ch) end++;
      rects.push(`M${fmt(6 + c * CELL)} ${fmt(6 + r * CELL)}h${CELL}v${fmt((end - r + 1) * CELL)}h${-CELL}z`);
      r = end + 1;
    }
  }
  return rects.join("");
};
const BARS = pathOf("x");
const PASSAGE = pathOf("o");

// --- Logotype -----------------------------------------------------------------------------------------------------
let nexoraD;
let aiD;
let lockBox;
let W;
let opentype = null;
try {
  opentype = (await import("opentype.js")).default;
} catch {
  opentype = null;
}
if (opentype) {
  const FONT = join(root, "web/src/fonts/og/geist-latin-500-normal.woff");
  const buf = readFileSync(FONT);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const CAP = 36; // hauteur des capitales, en unités du symbole
  const UPM = font.unitsPerEm;
  const CAP_UNITS = 710;
  const size = (CAP / CAP_UNITS) * UPM;
  const k = size / UPM;
  const baseline = 32 + CAP / 2; // capitales centrées sur le symbole
  const TRACK = -0.03; // approche serrée (em)
  const x0 = 72;
  const nexora = font.getPath("Nexora", x0, baseline, size, { kerning: true, letterSpacing: TRACK });
  const nexoraWidth = font.getAdvanceWidth("Nexora", size, { kerning: true, letterSpacing: TRACK });
  nexoraD = nexora.toPathData(2);
  const ax = x0 + nexoraWidth + 0.2 * size;
  const aPath = font.getPath("A", ax, baseline, size);
  const aAdv = font.getAdvanceWidth("A", size);
  const stemW = 108 * k;
  const serifW = 300 * k;
  const serifH = 82 * k;
  const ix = ax + aAdv + 0.012 * size;
  const top = baseline - CAP;
  const iD =
    `M${fmt(ix)} ${fmt(top)}h${fmt(serifW)}v${fmt(serifH)}h${fmt(-(serifW - stemW) / 2)}v${fmt(CAP - 2 * serifH)}` +
    `h${fmt((serifW - stemW) / 2)}v${fmt(serifH)}h${fmt(-serifW)}v${fmt(-serifH)}h${fmt((serifW - stemW) / 2)}` +
    `v${fmt(-(CAP - 2 * serifH))}h${fmt(-(serifW - stemW) / 2)}z`;
  aiD = aPath.toPathData(2) + iD;
  W = fmt(ix + serifW - SYMBOL_BOX[0]);
  lockBox = [SYMBOL_BOX[0], SYMBOL_BOX[1], W, SYMBOL_BOX[3]];
} else {
  const previous = readFileSync(join(root, "web/src/components/brand/logo-geometry.ts"), "utf8");
  const grab = (key) => previous.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
  nexoraD = grab("nexora");
  aiD = grab("ai");
  lockBox = grab("lockupBox").split(" ").map(Number);
  W = lockBox[2];
}

// --- Gabarits SVG --------------------------------------------------------------------------------------------------
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const mark = (ink, ember) => `<path fill="${ink}" d="${BARS}"/><path fill="${ember}" d="${PASSAGE}"/>`;
const markMono = (c) => `<path fill="${c}" d="${BARS}${PASSAGE}"/>`;

const symbolSvg = (ink, ember) =>
  `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}" role="img" aria-label="Nexora AI">${mark(ink, ember)}</svg>\n`;
const symbolMonoSvg = (c) =>
  `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}" role="img" aria-label="Nexora AI">${markMono(c)}</svg>\n`;
const lockSvg = (ink, ai, ember) =>
  `<svg ${NS} viewBox="${lockBox.join(" ")}" role="img" aria-label="Nexora AI">${mark(ink, ember)}<path fill="${ink}" d="${nexoraD}"/><path fill="${ai}" d="${aiD}"/></svg>\n`;
const lockMonoSvg = (c) =>
  `<svg ${NS} viewBox="${lockBox.join(" ")}" role="img" aria-label="Nexora AI">${markMono(c)}<path fill="${c}" d="${nexoraD}${aiD}"/></svg>\n`;

const out = join(root, "docs/marque/logos");
mkdirSync(out, { recursive: true });
const files = {
  "nexora-ai-symbole.svg": symbolSvg(GRAPHITE, EMBER_LIGHT),
  "nexora-ai-symbole-sombre.svg": symbolSvg(BONE, EMBER),
  "nexora-ai-symbole-noir.svg": symbolMonoSvg("#000000"),
  "nexora-ai-symbole-blanc.svg": symbolMonoSvg("#ffffff"),
  "nexora-ai-logo.svg": lockSvg(GRAPHITE, EMBER_TEXT_LIGHT, EMBER_LIGHT),
  "nexora-ai-logo-sombre.svg": lockSvg(BONE, EMBER_TEXT_DARK, EMBER),
  "nexora-ai-logo-noir.svg": lockMonoSvg("#000000"),
  "nexora-ai-logo-blanc.svg": lockMonoSvg("#ffffff"),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg);

// Favicon SVG adaptatif (clair / sombre) : sans tuile, l'encre devient os en thème sombre, l'orange s'éclaircit.
const favicon = `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}"><style>.s{fill:${GRAPHITE}}.e{fill:${EMBER_LIGHT}}@media (prefers-color-scheme:dark){.s{fill:${BONE}}.e{fill:${EMBER}}}</style><path class="s" d="${BARS}"/><path class="e" d="${PASSAGE}"/></svg>\n`;
writeFileSync(join(root, "web/src/app/icon.svg"), favicon);

// Tuile d'application (ICO, apple-touch, manifeste) : encre + symbole os, lisible sur tout fond.
export const tile = (scale, rounded) => {
  const t = `translate(${fmt(32 - 32 * scale)} ${fmt(32 - 32 * scale)}) scale(${scale})`;
  return `<svg ${NS} viewBox="0 0 64 64">${rounded ? `<rect width="64" height="64" rx="12" fill="${INK}"/>` : `<rect width="64" height="64" fill="${INK}"/>`}<g transform="${t}">${mark(BONE, EMBER)}</g></svg>`;
};
const tilesDir = join(root, "docs/marque/logos/app");
mkdirSync(tilesDir, { recursive: true });
writeFileSync(join(tilesDir, "tuile-petite.svg"), tile(0.86, true) + "\n");
writeFileSync(join(tilesDir, "tuile-apple.svg"), tile(0.7, false) + "\n");
writeFileSync(join(tilesDir, "tuile-maskable.svg"), tile(0.56, false) + "\n");

// Module TypeScript du composant <Logo> : uniquement des données.
const ts = `// Fichier généré par docs/marque/outils/build-marque.mjs : ne pas modifier à la main.
/** Géométrie du logo Nexora AI (grille de 64 unités). */
export const LOGO = {
  /** Les deux montants du « N » en pixels, en encre. */
  bars: ${JSON.stringify(BARS)},
  /** La diagonale du « N » : le point de passage, en orange signal. */
  passage: ${JSON.stringify(PASSAGE)},
  /** « Nexora » en contours Geist 500. */
  nexora: ${JSON.stringify(nexoraD)},
  /** « AI » : A de Geist 500 et I à empattements. */
  ai: ${JSON.stringify(aiD)},
  symbolBox: ${JSON.stringify(SYMBOL_BOX.join(" "))},
  lockupBox: ${JSON.stringify(lockBox.join(" "))},
  /** Rapport largeur / hauteur du logo complet. */
  lockupRatio: ${fmt(W / SYMBOL_BOX[3])},
} as const;
`;
writeFileSync(join(root, "web/src/components/brand/logo-geometry.ts"), ts);
console.log("logotype", W, "x", SYMBOL_BOX[3], "ratio", fmt(W / SYMBOL_BOX[3]), opentype ? "(opentype)" : "(contours relus)");
