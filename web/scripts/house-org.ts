#!/usr/bin/env bun
// Organisation « maison » (accès gratuit du fondateur et de l'équipe, G9).
//
//   bun web/scripts/house-org.ts                   crée (ou retrouve) « Nexora — maison » et la passe en mode maison
//   bun web/scripts/house-org.ts --key <fichier>   + crée une clé d'API et l'écrit dans <fichier> (droits 600), jamais à l'écran
//   bun web/scripts/house-org.ts --standard        remet l'organisation en mode ordinaire
//
// Les requêtes de cette organisation passent par la passerelle sans solde et sans débit ; l'usage, la valeur
// offerte et le coût amont réel restent comptés.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb, eq, organizations } from "@nexora/db";
import { setBillingMode } from "../src/server/gateway/house";
import { createApiKey } from "../src/server/gateway/keys";

const SLUG = "nexora-maison";

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

const args = process.argv.slice(2);
const keyIndex = args.indexOf("--key");
const keyFile = keyIndex >= 0 ? args[keyIndex + 1] : undefined;
if (keyIndex >= 0 && !keyFile)
  throw new Error("--key attend un nom de fichier");
const mode = args.includes("--standard") ? "standard" : "house";

const { db, close } = createDb(url, { max: 2 });
try {
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, SLUG));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ id: `org_${SLUG}`, name: "Nexora — maison", slug: SLUG })
      .returning();
  }
  if (!org) throw new Error("organisation non créée");
  await setBillingMode(db, org.id, mode, "script house-org");
  console.log(`organisation ${org.id} : mode ${mode}`);
  if (keyFile) {
    const { key } = await createApiKey(db, {
      organizationId: org.id,
      name: "maison",
    });
    writeFileSync(keyFile, `${key}\n`, { mode: 0o600 });
    chmodSync(keyFile, 0o600);
    console.log(`clé d'API écrite dans ${keyFile} (jamais affichée)`);
  }
} finally {
  await close();
}
