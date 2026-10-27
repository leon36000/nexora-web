// Génère les actifs vectoriels de la marque Nexora AI (symbole, logotype, monochromes) et le module TypeScript du composant.
//
// Le logotype « Nexora AI » est dessiné en contours (aucune police à charger, aucun saut de mise en page) :
//   - « Nexora » et le « A » sont les contours de Geist 500 (OFL, voir web/src/fonts/LICENSE-geist.txt) ;
//   - le « I » est dessiné à la main avec des empattements, pour qu'on ne lise jamais « Al » (en Geist, I majuscule
//     et l minuscule sont identiques).
//
// Dépendance d'outil seulement (pas du site) : opentype.js. Usage, depuis un dossier de travail vierge :
//   bun add opentype.js && bun /chemin/vers/build-marque.mjs <racine-du-dépôt>
import opentype from "opentype.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const FONT = join(root, "web/src/fonts/og/geist-latin-500-normal.woff");
const buf = readFileSync(FONT);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// --- Couleurs (conception §5) -----------------------------------------------------------------------------------
const INK = "#0e1613";
const FOREST = "#17221e";
const BONE = "#f4f1ea";
const EMBER = "#ce411c"; // orange Nexora
const EMBER_TEXT_LIGHT = "#b83a18"; // 5,4:1 sur papier
const EMBER_TEXT_DARK = "#f07a52"; // 6,7:1 sur encre

// --- Symbole : deux périmètres qui se recouvrent -----------------------------------------------------------------
// Grille de 64 unités ; l'encre occupe 6..58. L'intersection (22..42) est l'orange Nexora.
const SQ_A = "M6 6h36v36H6z";
const SQ_B = "M22 22h36v36H22z";
const OVERLAP = "M22 22h20v20H22z";
const SYMBOL_BOX = [6, 6, 52, 52];

// --- Logotype ------------------------------------------------------------------------------------------------------
const CAP = 36; // hauteur des capitales, en unités du symbole
const UPM = font.unitsPerEm;
const CAP_UNITS = 710;
const size = (CAP / CAP_UNITS) * UPM; // taille de police équivalente
const k = size / UPM; // unités de police -> unités du dessin
const baseline = 32 + CAP / 2; // capitales centrées sur le symbole
const TRACK = -0.03; // approche serrée (em)
const x0 = 72;

const fmt = (n) => Number(n.toFixed(2));
const nexora = font.getPath("Nexora", x0, baseline, size, { kerning: true, letterSpacing: TRACK });
const nexoraWidth = font.getAdvanceWidth("Nexora", size, { kerning: true, letterSpacing: TRACK });
const nexoraD = nexora.toPathData(2);

const gapWord = 0.2 * size; // espace entre les deux mots
const ax = x0 + nexoraWidth + gapWord;
const aPath = font.getPath("A", ax, baseline, size);
const aD = aPath.toPathData(2);
const aAdv = font.getAdvanceWidth("A", size);

// I à empattements : fût de 108 unités de police, empattements de 300 x 82, centrés.
const stemW = 108 * k;
const serifW = 300 * k;
const serifH = 82 * k;
const ix = ax + aAdv + 0.012 * size; // approche A -> I
const top = baseline - CAP;
const iD =
  `M${fmt(ix)} ${fmt(top)}h${fmt(serifW)}v${fmt(serifH)}h${fmt(-(serifW - stemW) / 2)}v${fmt(CAP - 2 * serifH)}` +
  `h${fmt((serifW - stemW) / 2)}v${fmt(serifH)}h${fmt(-serifW)}v${fmt(-serifH)}h${fmt((serifW - stemW) / 2)}` +
  `v${fmt(-(CAP - 2 * serifH))}h${fmt(-(serifW - stemW) / 2)}z`;
const END = ix + serifW;

const W = fmt(END - SYMBOL_BOX[0]);
const lockBox = [SYMBOL_BOX[0], SYMBOL_BOX[1], W, SYMBOL_BOX[3]];

// --- Gabarits SVG --------------------------------------------------------------------------------------------------
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const mark = (ink, ember) =>
  `<path fill="${ink}" d="${SQ_A}${SQ_B}"/><path fill="${ember}" d="${OVERLAP}"/>`;
const markMono = (c) => `<path fill="${c}" fill-rule="evenodd" d="${SQ_A}${SQ_B}"/>`;

const symbolSvg = (ink, ember) =>
  `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}" role="img" aria-label="Nexora AI">${mark(ink, ember)}</svg>\n`;
const symbolMonoSvg = (c) =>
  `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}" role="img" aria-label="Nexora AI">${markMono(c)}</svg>\n`;
const lockSvg = (ink, ai, ember) =>
  `<svg ${NS} viewBox="${lockBox.join(" ")}" role="img" aria-label="Nexora AI">${mark(ink, ember)}<path fill="${ink}" d="${nexoraD}"/><path fill="${ai}" d="${aD}${iD}"/></svg>\n`;
const lockMonoSvg = (c) =>
  `<svg ${NS} viewBox="${lockBox.join(" ")}" role="img" aria-label="Nexora AI">${markMono(c)}<path fill="${c}" d="${nexoraD}${aD}${iD}"/></svg>\n`;

const out = join(root, "docs/marque/logos");
mkdirSync(out, { recursive: true });
const files = {
  "nexora-ai-symbole.svg": symbolSvg(FOREST, EMBER),
  "nexora-ai-symbole-sombre.svg": symbolSvg(BONE, EMBER),
  "nexora-ai-symbole-noir.svg": symbolMonoSvg("#000000"),
  "nexora-ai-symbole-blanc.svg": symbolMonoSvg("#ffffff"),
  "nexora-ai-logo.svg": lockSvg(FOREST, EMBER_TEXT_LIGHT, EMBER),
  "nexora-ai-logo-sombre.svg": lockSvg(BONE, EMBER_TEXT_DARK, EMBER),
  "nexora-ai-logo-noir.svg": lockMonoSvg("#000000"),
  "nexora-ai-logo-blanc.svg": lockMonoSvg("#ffffff"),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg);

// Favicon SVG adaptatif (clair / sombre) : sans tuile, l'encre devient os en thème sombre.
const favicon = `<svg ${NS} viewBox="${SYMBOL_BOX.join(" ")}"><style>.s{fill:${FOREST}}@media (prefers-color-scheme:dark){.s{fill:${BONE}}}</style><path class="s" d="${SQ_A}${SQ_B}"/><path fill="${EMBER}" d="${OVERLAP}"/></svg>\n`;
writeFileSync(join(root, "web/src/app/icon.svg"), favicon);

// Tuile d'application (ICO, apple-touch, manifeste) : encre forêt + symbole os, lisible sur tout fond.
export const tile = (scale, rounded) => {
  const t = `translate(${fmt(32 - 32 * scale)} ${fmt(32 - 32 * scale)}) scale(${scale})`;
  return `<svg ${NS} viewBox="0 0 64 64">${rounded ? `<rect width="64" height="64" rx="14" fill="${INK}"/>` : `<rect width="64" height="64" fill="${INK}"/>`}<g transform="${t}">${mark(BONE, EMBER)}</g></svg>`;
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
  /** Deux périmètres qui se recouvrent. */
  squares: ${JSON.stringify(SQ_A + SQ_B)},
  /** L'intersection, en orange Nexora. */
  overlap: ${JSON.stringify(OVERLAP)},
  /** « Nexora » en contours Geist 500. */
  nexora: ${JSON.stringify(nexoraD)},
  /** « AI » : A de Geist 500 et I à empattements. */
  ai: ${JSON.stringify(aD + iD)},
  symbolBox: ${JSON.stringify(SYMBOL_BOX.join(" "))},
  lockupBox: ${JSON.stringify(lockBox.join(" "))},
  /** Rapport largeur / hauteur du logo complet. */
  lockupRatio: ${fmt(W / SYMBOL_BOX[3])},
} as const;
`;
writeFileSync(join(root, "web/src/components/brand/logo-geometry.ts"), ts);
console.log("logotype", W, "x", SYMBOL_BOX[3], "ratio", fmt(W / SYMBOL_BOX[3]));
