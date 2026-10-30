import { panelServicesDeps } from "@/server/products/deps";
import { handleCreateRag } from "@/server/products/panel-handlers";

// POST { name } → 201 { base, key: { id, prefix, secret }, connection: { apiUrl, mcpUrl } }
//   La valeur de la clé (`secret`) n'est rendue qu'ici, une seule fois, avec `Cache-Control: no-store`.
//   401 sans session · 403 origine étrangère ou membre simple · 404 produit pas encore allumé (NEXORA_PRODUCT_RAG)
//   402 espace ou crédits manquants · 409 nom déjà pris, limite de bases ou de clés · 422 corps invalide · 429 · 503.
export async function POST(request: Request) {
  return handleCreateRag(request, await panelServicesDeps());
}
