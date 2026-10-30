import { connection } from "next/server";
import { panelServicesDeps } from "@/server/products/deps";
import { handleCodeWorkspace } from "@/server/products/panel-handlers";

// GET  → 200 { status: "stopped" | "starting" | "ready" | "error", usedBytes, openUrl } (l'environnement de la personne connectée)
// POST → 202 même forme (démarre l'environnement) · 402 espace épuisé · 503 service indisponible
// DELETE → 204 (supprime l'environnement et son volume, libère l'espace) · 501 si le service ne sait pas le faire
//   401 sans session · 403 origine étrangère (POST) · 404 produit pas encore allumé (NEXORA_PRODUCT_CODE) · 429.
export async function GET(request: Request) {
  await connection();
  return handleCodeWorkspace(request, await panelServicesDeps());
}

export async function POST(request: Request) {
  return handleCodeWorkspace(request, await panelServicesDeps());
}

export async function DELETE(request: Request) {
  return handleCodeWorkspace(request, await panelServicesDeps());
}
