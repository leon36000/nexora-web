#!/usr/bin/env bun
// Charge le catalogue VPS dans la base « app ».
//
//   bun web/scripts/seed-vps.ts            applications et 4 plans (prix SUGGÉRÉS) en BROUILLON seulement (rejouable, ne touche rien d'existant)
//   bun web/scripts/seed-vps.ts --dev      + serveur simulé, trois plans « [DEV] » à prix symboliques, tout publié
//   bun web/scripts/seed-vps.ts --dev --stripe   + « Publier vers Stripe » (stripe-mock en développement)
//
// --dev est REFUSÉ si NODE_ENV=production. Les plans de développement portent `isDevSample` : la garde de
// publication les refuse hors de la base de développement. Aucun prix réel n'est inventé.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createDb } from "@nexora/db";
import { seedApps, seedDevCatalog, seedDraftPlans } from "@nexora/vps";
import { createStripeClient } from "../src/server/stripe/client";
import { syncVpsCatalogToStripe } from "../src/server/vps/stripe-sync";

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
const val = (k: string) => process.env[k] ?? local[k] ?? "";

const url = val("DATABASE_URL");
if (!url) throw new Error("DATABASE_URL est absent");
const { db, close } = createDb(url, { max: 2 });
try {
  if (process.argv.includes("--dev")) {
    const out = await seedDevCatalog(db, { ...process.env, ...local });
    console.log(`catalogue de développement publié : ${out.published}`);
    if (process.argv.includes("--stripe")) {
      const stripe = createStripeClient({
        secretKey: val("STRIPE_SECRET_KEY"),
        mockUrl: val("STRIPE_API_BASE_URL") || undefined,
      });
      const synced = await syncVpsCatalogToStripe(db, stripe);
      console.log(
        `Stripe : ${Object.keys(synced.result.plans).length} plan(s) synchronisé(s)`,
      );
    }
  } else {
    const out = await seedApps(db);
    console.log(
      `applications créées en brouillon : ${out.created.join(", ") || "aucune (déjà présentes)"}`,
    );
    const plans = await seedDraftPlans(db);
    console.log(
      `plans créés en brouillon (prix suggérés, à confirmer) : ${plans.created.join(", ") || "aucun (déjà présents)"}`,
    );
  }
} finally {
  await close();
}
