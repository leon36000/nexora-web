/**
 * Démarrage du serveur Next.js (Node.js) : garde des méthodes HTTP exotiques (405 avant Next.js, voir
 * `server/http-method-guard.ts`) et arrêt propre de la passerelle (règlement des requêtes en vol au signal d'arrêt,
 * voir `server/gateway/drain.ts`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMethodGuard } = await import("./server/http-method-guard");
  installMethodGuard();
  const { installGatewayDrain } = await import("./server/gateway/drain");
  installGatewayDrain();
}
