import { forgeUrl } from "@/lib/forge";

export const dynamic = "force-dynamic";

/**
 * Bouton « Ouvrir GitLab » de la page Gitspace : le contenu du CMS ne porte pas l'adresse de la forge (c'est une
 * configuration, `GITSPACE_FORGE_URL`), il pointe ici et on redirige.
 */
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: forgeUrl(), "Cache-Control": "no-store" },
  });
}
