import { connection } from "next/server";
import { getDb } from "@/server/db";
import { log } from "@/server/log";
import { handlePricesAdmin } from "@/server/webpilot/prices-admin";

// Contrat : voir docs/webpilot.md. Authentification : Authorization: Bearer <NEXORA_APP_ADMIN_TOKEN> (temps constant).
const handle = async (request: Request) => {
  // Cache Components : sans cet appel, la route est préparée au build (sans jeton ni base) et fige sa réponse.
  await connection();
  return handlePricesAdmin(request, {
    db: getDb,
    adminToken: process.env.NEXORA_APP_ADMIN_TOKEN,
    log,
    now: () => new Date(),
  });
};

export const GET = handle;
export const PUT = handle;
