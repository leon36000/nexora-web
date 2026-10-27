import { z } from "zod";
import { LANGS } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";
import { checkAdminAuth } from "@/server/auth";
import { isSafePreviewPath, signPreviewLink } from "@/server/preview-link";

const NO_STORE = { "cache-control": "no-store" };
const body = z.object({
  lang: z.enum(LANGS),
  path: z.string().max(200).refine(isSafePreviewPath),
});

/**
 * Génère un lien d'aperçu signé (valable 10 minutes) : POST { lang, path } avec le Bearer d'administration.
 * L'équipe éditoriale (ou un bouton de Directus) ouvre ce lien pour activer l'aperçu.
 */
export async function POST(request: Request) {
  const auth = checkAdminAuth(request, process.env.NEXORA_APP_ADMIN_TOKEN);
  if (auth === "not_configured")
    return Response.json(
      { error: "admin_not_configured" },
      { status: 503, headers: NO_STORE },
    );
  if (auth !== "ok")
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "invalid_request" },
      { status: 422, headers: NO_STORE },
    );
  try {
    const link = signPreviewLink({
      secret: process.env.NEXORA_PREVIEW_SECRET,
      ...parsed.data,
    });
    const q = new URLSearchParams({
      lang: link.lang,
      path: link.path,
      exp: String(link.exp),
      sig: link.sig,
    });
    return Response.json(
      {
        url: `${SITE_URL}/api/preview?${q}`,
        expiresAt: new Date(link.exp).toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { error: "preview_not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }
}
