// Contrôle des contrastes WCAG 2.x par calcul, à partir des jetons réels de globals.css.
// Usage : bun web/scripts/contrast.mjs   (code de sortie 1 si une paire est sous son seuil)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../src/app/globals.css"), "utf8");
const token = Object.fromEntries([...css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
token.white = "#ffffff";

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Mélange d'un filet translucide (rgba) sur un fond, pour les bordures de composants.
const mix = (fg, alpha, bg) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(fg.slice(i, i + 2), 16) * alpha + parseInt(bg.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("");

// [description, premier plan, arrière-plan, seuil, source]
const T = token;
const pairs = [
  // --- identité « Signal » : site public sombre d'abord ---
  ["Texte (givre) sur abysse", T.frost, T["abyss-950"], 4.5, ""],
  ["Texte sur bande nuit", T.frost, T["abyss-850"], 4.5, ""],
  ["Texte sur surface", T.frost, T["abyss-900"], 4.5, ""],
  ["Texte sur surface relevée", T.frost, T["abyss-800"], 4.5, ""],
  ["Texte secondaire (brume) sur abysse", T.haze, T["abyss-950"], 4.5, ""],
  ["Texte secondaire sur bande nuit", T.haze, T["abyss-850"], 4.5, ""],
  ["Texte secondaire sur surface", T.haze, T["abyss-900"], 4.5, ""],
  ["Texte secondaire sur surface relevée", T.haze, T["abyss-800"], 4.5, "survol"],
  ["Accent ion en texte sur abysse", T["ion-400"], T["abyss-950"], 4.5, ""],
  ["Accent ion en texte sur surface relevée", T["ion-400"], T["abyss-800"], 4.5, ""],
  ["Bouton principal : abysse sur ion", T["abyss-950"], T["ion-400"], 4.5, ""],
  ["Bouton principal au survol : abysse sur ion clair", T["abyss-950"], T["ion-300"], 4.5, ""],
  ["Bouton flare (seul point chaud) : abysse sur flare", T["abyss-950"], T["flare-500"], 4.5, ""],
  ["Bouton flare au survol", T["abyss-950"], T["flare-400"], 4.5, ""],
  ["Flare en texte sur abysse (alerte, libellé)", T["flare-500"], T["abyss-950"], 4.5, ""],
  ["Alerte sur abysse", T["alert-400"], T["abyss-950"], 4.5, ""],
  ["Succès sur abysse", T["ok-400"], T["abyss-950"], 4.5, ""],
  ["Lien d'évitement : abysse sur ion", T["abyss-950"], T["ion-400"], 4.5, ""],
  ["Anneau de focus ion sur abysse", T["ion-400"], T["abyss-950"], 3, "2.4.11 / 1.4.11"],
  ["Anneau de focus ion sur surface relevée", T["ion-400"], T["abyss-800"], 3, "2.4.11 / 1.4.11"],
  ["Bordure de bouton secondaire (acier) sur abysse", T.steel, T["abyss-950"], 3, "1.4.11"],
  ["Bordure de bouton secondaire (acier) sur nuit", T.steel, T["abyss-850"], 3, "1.4.11"],
  ["Ion en graphisme sur abysse", T["ion-400"], T["abyss-950"], 3, "non textuel >= 3:1"],
  // --- papier : espace client et pages claires ---
  ["Texte sur papier", T["graphite-900"], T["paper-50"], 4.5, ""],
  ["Texte sur surface claire", T["graphite-900"], T["paper-100"], 4.5, ""],
  ["Texte secondaire sur papier", T["graphite-600"], T["paper-50"], 4.5, ""],
  ["Texte secondaire sur surface claire", T["graphite-600"], T["paper-100"], 4.5, ""],
  ["Accent en texte (ion foncé) sur papier", T["ion-700"], T["paper-50"], 4.5, ""],
  ["Accent en texte (ion foncé) sur surface claire", T["ion-700"], T["paper-100"], 4.5, ""],
  ["Succès sur papier", T["ok-700"], T["paper-50"], 4.5, ""],
  ["Alerte sur papier", T["alert-700"], T["paper-50"], 4.5, ""],
  ["Flare foncé sur papier", T["flare-700"], T["paper-50"], 4.5, ""],
  ["Ion en graphisme sur papier", T["ion-600"], T["paper-50"], 3, "non textuel >= 3:1"],
  ["Anneau de focus sur papier", T["ion-700"], T["paper-50"], 3, "2.4.11 / 1.4.11"],
  ["Bordure de bouton secondaire sur papier", mix(T["graphite-900"], 0.58, T["paper-50"]), T["paper-50"], 3, "1.4.11"],
];

const rows = pairs.map(([name, fg, bg, min, note]) => {
  const r = ratio(fg, bg);
  return { name, fg, bg, r, min, note, ok: r >= min };
});
const lines = [
  "Contrastes calculés (WCAG 2.x, luminance relative) à partir des jetons de src/app/globals.css",
  "",
  ...rows.map((x) => `${x.ok ? "OK " : "ÉCHEC"} ${x.r.toFixed(2).padStart(5)}:1  (seuil ${x.min || "—"})  ${x.name}  ${x.fg} / ${x.bg}${x.note ? "  [" + x.note + "]" : ""}`),
];
console.log(lines.join("\n"));
process.exit(rows.every((x) => x.ok) ? 0 : 1);
