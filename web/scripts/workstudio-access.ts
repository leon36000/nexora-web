#!/usr/bin/env bun
// Accès modèle d'une instance WorkStudio : crée (ou relit) la clé de la passerelle d'une organisation et écrit les trois
// réglages que WorkStudio lit dans un fichier (droits 600). La clé n'est JAMAIS affichée.
//
//   bun web/scripts/workstudio-access.ts --org org_nexora-maison --gateway https://…/v1 --model nexora/glm-5.3 --out deploy/.env.modele
//
// L'organisation « maison » (administrateur) est gratuite ; toute autre est facturée à son portefeuille.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@nexora/db";
import { ensureModelAccess } from "../src/server/gateway/provision";
import { loadKeyring } from "../src/server/vault/crypto";

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
const env = { ...local, ...process.env } as Record<string, string | undefined>;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const org = arg("org");
const gateway = arg("gateway");
const model = arg("model");
const out = arg("out");
if (!org || !gateway || !model || !out)
  throw new Error(
    "usage : --org <id> --gateway <url/v1> --model <id public> --out <fichier>",
  );
const url = env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL est absent");

const { db, close } = createDb(url, { max: 2 });
try {
  const access = await ensureModelAccess(db, loadKeyring(env), {
    organizationId: org,
    gatewayUrl: gateway,
    defaultModel: model,
    allowLoopback: env.NODE_ENV !== "production",
  });
  const lines = Object.entries(access.env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(out, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(out, 0o600);
  console.log(
    `${access.created ? "clé créée" : "clé existante"} ; réglages écrits dans ${out} (droits 600, clé non affichée)`,
  );
} finally {
  await close();
}
