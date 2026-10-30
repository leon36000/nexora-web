import { connection, NextResponse } from "next/server";
import { workspaceProxyDeps } from "@/server/code/proxy-deps";
import { handleCodeOpen } from "@/server/code/workspace-dedicated";

// GET (session) → 302 vers l'interface web de l'environnement de la personne, sur son hôte dédié, avec un billet d'entrée de 60 s.
// 401 sans session · 403 courriel non vérifié / 2FA du personnel · 404 pas d'environnement ou origine dédiée non configurée · 409 arrêté.
export async function GET(request: Request) {
  await connection();
  const deps = workspaceProxyDeps();
  if (!deps)
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  return handleCodeOpen(request, deps);
}
