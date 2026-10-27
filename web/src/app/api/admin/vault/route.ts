import { vaultDeps } from "@/server/vault/deps";
import { handleList, handlePost } from "@/server/vault/handlers";

// Contrat figé (consommé par le module « Coffre » de Directus) :
//   POST { ref: ^[a-z0-9._-]{3,64}$, value: 1..4096, kind: llm_provider|payment|proxmox|other }
//   → 200 { ref, last4, kind, updatedAt } · 401 sans jeton valide · 422 si invalide.
export async function POST(request: Request) {
  return handlePost(request, vaultDeps());
}

export async function GET(request: Request) {
  return handleList(request, vaultDeps());
}
