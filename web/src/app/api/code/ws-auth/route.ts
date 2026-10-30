import { connection, NextResponse } from "next/server";
import { workspaceProxyDeps } from "@/server/code/proxy-deps";
import { handleWorkspaceAuth } from "@/server/code/workspace-proxy";

// GET ?id=<proxy_id> avec le cookie de session → 204 + X-Nexora-Upstream / X-Nexora-Authorization (mandataire de bordure
// qui porte les WebSocket) · 401 · 404 · 409 environnement arrêté. À n'exposer qu'au réseau interne. docs/nexora-code.md.
export async function GET(request: Request) {
  await connection();
  const deps = workspaceProxyDeps();
  if (!deps)
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  return handleWorkspaceAuth(request, deps);
}
