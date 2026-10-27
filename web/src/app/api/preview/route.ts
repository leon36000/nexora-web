import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { verifyPreviewLink } from "@/server/preview-link";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Active l'aperçu (Draft Mode) à partir d'un lien SIGNÉ côté serveur : /api/preview?lang&path&exp&sig.
 * Sans signature valide, rien n'est activé. La redirection ne mène qu'à un chemin du site.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const verdict = verifyPreviewLink({
    secret: process.env.NEXORA_PREVIEW_SECRET,
    lang: q.get("lang") ?? "",
    path: q.get("path") ?? "",
    exp: Number(q.get("exp")),
    sig: q.get("sig") ?? "",
  });
  if (!verdict.ok) {
    const status = verdict.reason === "not_configured" ? 503 : 401;
    return new Response("Lien d’aperçu invalide ou expiré.", {
      status,
      headers: { ...NO_STORE, "content-type": "text/plain; charset=utf-8" },
    });
  }
  (await draftMode()).enable();
  redirect(localizePath(verdict.lang, verdict.path));
}
