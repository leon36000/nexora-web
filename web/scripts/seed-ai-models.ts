#!/usr/bin/env bun
// Charge dans la base « app » le catalogue DeepInfra de Nexora AI : fournisseurs (DeepInfra actif, OpenRouter désactivé en
// route de secours future), modèles, fiches, prix de vente (prix amont + marge de 10 %) et, si un taux de change USD→CAD
// est approuvé, mise en ligne par la chaîne officielle (approbation, publication de la version). Les modèles sont en
// « aperçu » : visibles au catalogue public, pas encore appelables, la clé de DeepInfra n'étant pas exigée.
//
//   bun run --cwd web models:seed [--nettoyer] [--service] [--dossier <chemin>]
//
//   --nettoyer         supprime les fournisseurs directs (deepseek, zai, minimax, moonshot) que plus aucun modèle ne référence
//   --service          charge les modèles directement EN SERVICE (exige la clé `llm.deepinfra` dans le Coffre) au lieu d'aperçu
//   --dossier <chemin> dossier de données (défaut : web/src/server/gateway/catalog-deepinfra)
//
// Rejouable : ne réécrit jamais un prix déjà versionné (nouvelle version seulement si l'amont a changé), ne remet pas en
// aperçu un modèle passé en service. Données : voir docs/catalogue-deepinfra.md.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@nexora/db";
import { loadDeepinfraCatalog } from "../src/server/gateway/deepinfra-loader";
import { readSourceFromDisk } from "../src/server/gateway/deepinfra-source";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const dirIndex = args.indexOf("--dossier");
const dir = dirIndex >= 0 ? args[dirIndex + 1] : undefined;
if (dirIndex >= 0 && !dir) throw new Error("--dossier demande un chemin");

const local = readEnvFile(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
);
const url = process.env.DATABASE_URL ?? local.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL est absent");

const list = (items: readonly string[]) =>
  items.length ? items.join(", ") : "aucun";
const source = readSourceFromDisk(dir);
const { db, close } = createDb(url, { max: 2 });
try {
  const r = await loadDeepinfraCatalog(db, source, {
    availability: flag("--service") ? "live" : "preview",
    nettoyer: flag("--nettoyer"),
  });
  console.log(
    `taux de change approuvé : ${r.fx ? "oui" : "NON (modèles en brouillon, sans prix)"}`,
  );
  console.log(`fournisseurs créés : ${list(r.providers.created)}`);
  for (const w of r.providers.warnings) console.log(`  attention : ${w}`);
  console.log(`modèles créés : ${list(r.created)}`);
  console.log(`modèles rattachés à DeepInfra : ${list(r.attached)}`);
  console.log(`fiches mises à jour : ${list(r.updated)}`);
  console.log(`nouvelles versions de prix : ${list(r.priced)}`);
  console.log(`modèles retirés : ${list(r.retired)}`);
  console.log(`modèles mis en ligne : ${list(r.published)}`);
  for (const d of r.drafts)
    console.log(`  brouillon : ${d.publicId} — ${JSON.stringify(d.reasons)}`);
  console.log(`modèles sautés : ${r.skipped.length}`);
  for (const s of r.skipped)
    console.log(`  ${s.kind} : ${s.publicId} — ${s.message}`);
  console.log(
    `version du catalogue : ${r.version.status}${r.version.short ? ` (${r.version.short})` : ""}${r.version.issues ? ` — ${JSON.stringify(r.version.issues)}` : ""}`,
  );
  if (flag("--nettoyer")) {
    console.log(`fournisseurs supprimés : ${list(r.cleaned.deleted)}`);
    for (const k of r.cleaned.kept)
      console.log(`  gardé : ${k.code} — ${k.reason}`);
  }
  if (r.version.status === "published")
    console.log(
      "La page publique se met à jour d'ici cinq minutes (cache de la liste) ; une publication depuis le module Modèles la rafraîchit tout de suite.",
    );
} finally {
  await close();
}
