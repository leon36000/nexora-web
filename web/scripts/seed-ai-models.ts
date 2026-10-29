#!/usr/bin/env bun
// Charge dans la base « app » les fournisseurs d'origine (OpenRouter en secours) et les cinq modèles du fondateur, en BROUILLON
// (fiches sourcées, prix du fournisseur d'origine, marge de 10 %). Rejouable : ne touche à rien d'existant.
//
//   bun web/scripts/seed-ai-models.ts
//
// Prérequis : un taux de change USD→CAD approuvé. Rien n'est publié : le fondateur saisit la clé de chaque
// fournisseur dans le coffre (références `llm.deepseek`, `llm.zai`, `llm.minimax`, `llm.moonshot`), puis
// approuve les modèles depuis le panneau.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@nexora/db";
import { seedAiModels } from "../src/server/gateway/catalog-ia-seed";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}
const local = readEnvFile(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
);
const url = process.env.DATABASE_URL ?? local.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL est absent");
const { db, close } = createDb(url, { max: 2 });
try {
  const out = await seedAiModels(db);
  console.log(
    `modèles créés en brouillon : ${out.created.join(", ") || "aucun (déjà présents)"}`,
  );
  console.log(`brouillons remis à jour : ${out.updated.join(", ") || "aucun"}`);
} finally {
  await close();
}
