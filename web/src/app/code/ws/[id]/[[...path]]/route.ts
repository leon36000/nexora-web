import { connection, NextResponse } from "next/server";
import { workspaceProxyDeps } from "@/server/code/proxy-deps";
import { handleDedicatedProxy } from "@/server/code/workspace-dedicated";
import { handleWorkspaceProxy } from "@/server/code/workspace-proxy";

// Mandataire inverse de l'environnement Nexora Code hébergé : /code/ws/<id>/… → le conteneur de la personne.
// Authentifié par la session du site (propriétaire seulement). HTTP et SSE ; les WebSocket : 426 (voir docs/nexora-code.md).
// Sur l'origine dédiée de l'interface web (NEXORA_CODE_HOST_SUFFIX), l'accès passe par un billet puis un cookie propre à l'hôte.
// Éteint (NEXORA_PRODUCT_CODE) ou pilote absent : 404. `proxy.ts` laisse passer toutes les méthodes sur ce préfixe.
async function handle(
  request: Request,
  context: { params: Promise<{ id: string; path?: string[] }> },
) {
  await connection();
  const deps = workspaceProxyDeps();
  if (!deps)
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  const { id, path } = await context.params;
  // Hôte dédié (<id>.<NEXORA_CODE_HOST_SUFFIX>, réécrit par next.config.ts) : cookie propre à l'hôte, interface HTML admise.
  const dedicated = await handleDedicatedProxy(request, { id, path }, deps);
  if (dedicated) return dedicated;
  return handleWorkspaceProxy(request, id, deps);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};
