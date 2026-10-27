#!/usr/bin/env bun
// Crée (ou relit) la clé IndexNow du site dans la base `app` et affiche son emplacement public. La clé n'est pas un
// secret (le protocole la publie à la racine du site).
//   bun web/scripts/indexnow-key.ts
import { createDb } from "@nexora/db";
import { loadRootEnv } from "@nexora/db/env";
import { getOrCreateIndexNowKey } from "../src/lib/seo/indexnow-key";

loadRootEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL absent");
const handle = createDb(url, { max: 1 });
const key = await getOrCreateIndexNowKey(handle.db);
console.log(`/${key}.txt`);
await handle.close();
