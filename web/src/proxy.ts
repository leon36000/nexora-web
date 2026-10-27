import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LANG } from "@/i18n/config";

/**
 * Routage des langues (Next.js 16 : `proxy.ts` remplace `middleware.ts`).
 *
 * - `/en` et `/en/…` : servis tels quels (en-CA).
 * - `/fr` et `/fr/…` : redirigés (308) vers l'URL sans préfixe, pour éviter un doublon de contenu.
 * - tout le reste (`/`, `/solutions`…) : réécrit en interne vers `/fr/…` (fr-CA par défaut).
 *
 * Aucune détection de `Accept-Language` : l'URL fait foi (référencement, partage de liens).
 * En aperçu (cookie du Draft Mode), l'en-tête `X-Robots-Tag: noindex` est ajouté à toute réponse.
 * Les fichiers statiques (avec extension), `/api`, `/v1` et `/_next` ne passent pas ici (matcher).
 */
export function proxy(request: NextRequest) {
  const response = route(request);
  // Aperçu (Draft Mode, cookie posé par /api/preview) : jamais indexable, quelle que soit la page.
  if (request.cookies.has("__prerender_bypass"))
    response.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
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
  // Exclut /api, /v1, /_next et tout chemin contenant un point (fichiers statiques, robots.txt, sitemap.xml…).
  // Tout nouveau préfixe non localisé (webhooks, etc.) doit être ajouté ici.
  matcher: ["/((?!api|v1|_next|.*\\..*).*)"],
};
