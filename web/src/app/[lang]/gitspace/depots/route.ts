import { connection } from "next/server";
import { forgeUrl } from "@/lib/forge";
import { gitspaceVisible } from "@/lib/gitspace-flag";

/**
 * Bouton « Ouvrir GitLab » de la page Gitspace : le contenu du CMS ne porte pas l'adresse de la forge (c'est une
 * configuration, `GITSPACE_FORGE_URL`), il pointe ici et on redirige. `connection()` garde la route dynamique : elle
 * lit l'environnement à chaque requête, jamais à la compilation.
 */
export async function GET() {
  await connection();
  if (!gitspaceVisible()) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 307,
    headers: { Location: forgeUrl(), "Cache-Control": "no-store" },
  });
}
