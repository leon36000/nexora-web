// Contrôle des contrastes WCAG 2.x par calcul, à partir des jetons réels de globals.css.
// Usage : bun web/scripts/contrast.mjs   (code de sortie 1 si une paire est sous son seuil)
import { readFileSync, writeFileSync } from "node:fs";
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
  ["Texte sur fond sombre", T.bone, T["ink-950"], 4.5, ""],
  ["Texte sur surface sombre", T.bone, T["ink-900"], 4.5, ""],
  ["Texte sur bande nuit", T.bone, T["night-900"], 4.5, ""],
  ["Texte secondaire sur fond sombre", T.mist, T["ink-950"], 4.5, ""],
  ["Texte secondaire sur surface sombre", T.mist, T["ink-900"], 4.5, ""],
  ["Texte secondaire sur surface sombre élevée", T.mist, T["ink-800"], 4.5, "survol"],
  ["Texte secondaire sur bande nuit", T.mist, T["night-900"], 4.5, ""],
  ["Accent en texte sur fond sombre", T["ember-400"], T["ink-950"], 4.5, ""],
  ["Accent en texte sur surface sombre", T["ember-400"], T["ink-900"], 4.5, ""],
  ["Accent en texte sur bande nuit", T["ember-400"], T["night-900"], 4.5, ""],
  ["Succès sur fond sombre", T["mint-400"], T["ink-950"], 4.5, ""],
  ["Texte sur fond clair", T["graphite-900"], T["paper-50"], 4.5, ""],
  ["Texte sur surface claire", T["graphite-900"], T["paper-100"], 4.5, ""],
  ["Texte secondaire sur fond clair", T["graphite-600"], T["paper-50"], 4.5, ""],
  ["Texte secondaire sur surface claire", T["graphite-600"], T["paper-100"], 4.5, ""],
  ["Accent en texte sur fond clair", T["ember-700"], T["paper-50"], 4.5, ""],
  ["Accent en texte sur surface claire", T["ember-700"], T["paper-100"], 4.5, ""],
  ["Succès sur fond clair", T["mint-700"], T["paper-50"], 4.5, ""],
  ["Succès sur surface claire", T["mint-700"], T["paper-100"], 4.5, ""],
  ["Bouton d'accent : texte encre sur orange signal", T["ink-950"], T["ember-500"], 4.5, ""],
  ["Bouton d'accent au survol : encre sur orange clair", T["ink-950"], T["ember-400"], 4.5, ""],
  ["Lien d'évitement : encre sur orange signal", T["ink-950"], T["ember-500"], 4.5, ""],
  ["Orange signal sur fond sombre (graphisme)", T["ember-500"], T["ink-950"], 3, "non textuel >= 3:1"],
  ["Orange sur fond clair (graphisme)", T["ember-600"], T["paper-50"], 3, "non textuel >= 3:1"],
  ["Anneau de focus sur fond sombre", T["ember-400"], T["ink-950"], 3, "2.4.11 / 1.4.11"],
  ["Anneau de focus sur fond clair", T["ember-700"], T["paper-50"], 3, "2.4.11 / 1.4.11"],
  ["Bordure de bouton secondaire sur fond sombre", mix(T.bone, 0.52, T["ink-950"]), T["ink-950"], 3, "1.4.11"],
  ["Bordure de bouton secondaire sur fond clair", mix(T["graphite-900"], 0.58, T["paper-50"]), T["paper-50"], 3, "1.4.11"],
  ["Orange signal en texte courant sur fond sombre (toléré, on lui préfère ember-400)", T["ember-500"], T["ink-950"], 0, "informatif"],
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
if (process.argv.includes("--write")) writeFileSync(join(here, "../../docs/captures/s1/contrastes.txt"), lines.join("\n") + "\n");
process.exit(rows.every((x) => x.ok) ? 0 : 1);
