import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LANG } from "@/i18n/config";
import { embedCspFor } from "@/lib/embed-policy";
import { mergeCsp, pageCsp } from "@/lib/security-headers";
import { isIndexableEnvironment, NOINDEX_HEADER } from "@/lib/seo/site-env";

/**
 * Routage des langues (Next.js 16 : `proxy.ts` remplace `middleware.ts`).
 *
 * - `/en` et `/en/…` : servis tels quels (en-CA).
 * - `/fr` et `/fr/…` : redirigés (308) vers l'URL sans préfixe, pour éviter un doublon de contenu.
 * - tout le reste (`/`, `/solutions`…) : réécrit en interne vers `/fr/…` (fr-CA par défaut).
 *
 * Aucune détection de `Accept-Language` : l'URL fait foi (référencement, partage de liens).
 * En aperçu (cookie du Draft Mode), l'en-tête `X-Robots-Tag: noindex` est ajouté à toute réponse.
 * Hors production (`SITE_ENV` différent de « production », ou absent) : `X-Robots-Tag: noindex, nofollow` sur
 * toute page, en plus du `Disallow: /` de robots.txt (voir lib/seo/site-env.ts).
 * CSP : politique de base sur toutes les pages (voir lib/security-headers.ts) ; sur les pages de la bulle WorkStudio,
 * l'origine configurée s'y ajoute (voir lib/embed-policy.ts). Les fichiers statiques (avec extension), `/api`, `/v1`, `/og` et `/_next` ne passent pas ici (matcher).
 */
export async function proxy(request: NextRequest) {
  const response = route(request);
  // Aperçu (Draft Mode, cookie posé par /api/preview) : jamais indexable, quelle que soit la page.
  if (request.cookies.has("__prerender_bypass"))
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  else if (!isIndexableEnvironment())
    response.headers.set("x-robots-tag", NOINDEX_HEADER);
  // CSP des pages : politique de base (aucune origine tierce) sur toute réponse du proxy. Sur les pages qui accueillent
  // la bulle WorkStudio, l'origine configurée s'y ajoute (script, cadre, connexion), jamais ailleurs.
  const dev = process.env.NODE_ENV !== "production";
  let embed: string | null = null;
  if (
    (request.method === "GET" || request.method === "HEAD") &&
    response.status < 300
  )
    embed = await embedCspFor(request.nextUrl.pathname, { dev });
  response.headers.set(
    "content-security-policy",
    mergeCsp(pageCsp({ dev }), embed),
  );
  return response;
}

function route(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    return NextResponse.next();
  }

  if (pathname === "/fr" || pathname.startsWith("/fr/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LANG}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Exclut /api, /v1, /og, /_next et les fichiers À LA RACINE (robots.txt, sitemap.xml, icon.svg, clé IndexNow…).
  // Un point plus loin dans le chemin reste une page : fiche d'un modèle `/modeles/openai/gpt-4.1`.
  // Tout nouveau préfixe non localisé (webhooks, etc.) doit être ajouté ici.
  matcher: ["/((?!api|v1|og/|_next|[^/]+\\.[a-zA-Z0-9]+$).*)"],
};
