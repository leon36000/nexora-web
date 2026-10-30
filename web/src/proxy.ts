import { type NextRequest, NextResponse } from "next/server";
import { DEFAULT_LANG, LOCALIZED_ROUTES } from "@/i18n/config";
import { embedCspFor } from "@/lib/embed-policy";
import {
  API_CSP,
  billingFormCsp,
  mergeCsp,
  pageCsp,
} from "@/lib/security-headers";
import { isIndexableEnvironment, NOINDEX_HEADER } from "@/lib/seo/site-env";
import { SITE_URL } from "@/lib/site";
import { ADMIN_PATH, throttleAdminFailures } from "@/server/admin-throttle";
import {
  PREVIEW_SESSION_COOKIE,
  verifyPreviewSession,
} from "@/server/preview-link";

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
 * l'origine configurée s'y ajoute (voir lib/embed-policy.ts) ; sur le tableau de bord et la carte VPS de l'espace client,
 * les pages hébergées de Stripe s'ajoutent à `form-action` seulement (voir `billingFormCsp`). Les fichiers statiques (avec extension) et `/_next` ne passent pas ici (matcher) ;
 * `/api`, `/v1`, `/og` et `/code/ws` (mandataire de l'environnement Nexora Code : toutes les méthodes y passent) n'y passent que
 * pour le contrôle des adresses mal formées (400).
 */

/** Pourcentage invalide (`%E0%A4%A`, `%ff`) ou octet nul : Next répond 500 « Internal Server Error » à ces adresses. */
function isMalformedPath(pathname: string): boolean {
  try {
    return decodeURIComponent(pathname).includes("\0");
  } catch {
    return true;
  }
}

const DEDICATED_HOST = /^[0-9a-f]{32}\./i;
const API_PREFIX = /^\/(?:api|v1|og|code\/ws)(?:\/|$)/;
const PAGE_REFUSED_METHODS = new Set(["PUT", "PATCH", "DELETE"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Adresse mal formée : 400 net, avant tout routage (aucune page, aucune écriture de cache, aucun journal d'erreur).
  if (isMalformedPath(pathname))
    return new NextResponse("Bad Request", {
      status: 400,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": API_CSP,
      },
    });
  // Origine dédiée de l'interface de Nexora Code (`<32 hex>.<suffixe>`) : ni langue, ni CSP de page (c'est l'application de
  // l'environnement) ; `next.config.ts` réécrit vers `/code/ws/<id>/…`, la route vérifie le suffixe et le cookie.
  if (DEDICATED_HOST.test(request.headers.get("host") ?? ""))
    return NextResponse.next();
  // API d'administration : trop de jetons faux depuis une même adresse -> 429 (un jeton valide passe toujours).
  if (ADMIN_PATH.test(pathname)) {
    const limited = throttleAdminFailures(
      request,
      process.env.NEXORA_APP_ADMIN_TOKEN,
    );
    if (limited) return limited;
  }
  // Pages : ni PUT, ni PATCH, ni DELETE (les formulaires et actions serveur sont des POST) ; les routes /api et /v1
  // gardent leurs propres méthodes. Les méthodes exotiques (TRACE…) sont refusées avant Next.js (server/http-method-guard.ts).
  if (!API_PREFIX.test(pathname) && PAGE_REFUSED_METHODS.has(request.method))
    return new NextResponse("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD, POST, OPTIONS",
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": API_CSP,
      },
    });
  // /api, /v1, /og et /code/ws ne passent ici que pour le contrôle ci-dessus : ni langue, ni CSP de page (la leur vient de next.config).
  if (API_PREFIX.test(pathname)) return NextResponse.next();
  // Aperçu (Draft Mode) : le cookie `__prerender_bypass` est constant et sans expiration ; il n'est honoré que
  // accompagné de la session signée de 30 minutes posée par /api/preview. Sinon on l'efface (navigation : par une redirection
  // vers la même adresse, pour que la page soit rendue sans brouillons).
  const bypass = request.cookies.has("__prerender_bypass");
  const previewing =
    bypass &&
    verifyPreviewSession({
      secret: process.env.NEXORA_PREVIEW_SECRET,
      value: request.cookies.get(PREVIEW_SESSION_COOKIE)?.value,
    });
  if (bypass && !previewing) {
    const navigation = request.method === "GET" || request.method === "HEAD";
    const expired = navigation
      ? NextResponse.redirect(request.nextUrl, 307)
      : route(request);
    clearPreviewCookies(expired);
    expired.headers.set("cache-control", "no-store");
    if (navigation) return expired;
    return finish(request, expired, false);
  }
  return finish(request, route(request), previewing);
}

/** Efface les cookies d'aperçu (attributs identiques à ceux posés par Next.js et /api/preview). */
function clearPreviewCookies(response: NextResponse): void {
  for (const name of [
    "__prerender_bypass",
    "__next_preview_data",
    PREVIEW_SESSION_COOKIE,
  ])
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
}

async function finish(
  request: NextRequest,
  response: NextResponse,
  previewing: boolean,
): Promise<NextResponse> {
  // Aperçu valide : jamais indexable, quelle que soit la page.
  if (previewing)
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
    mergeCsp(
      mergeCsp(pageCsp({ dev, https: SITE_URL.startsWith("https://") }), embed),
      billingFormCsp(request.nextUrl.pathname),
    ),
  );
  return response;
}

function route(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    // Routes à adresse propre à la langue : /en/pricing est servi par la route /en/tarifs (une seule adresse
    // canonique : l'ancienne adresse redirige).
    const rest = pathname.slice(3).replace(/\/+$/, "") || "/";
    for (const [neutral, byLang] of Object.entries(LOCALIZED_ROUTES)) {
      const english = byLang.en;
      if (!english) continue;
      if (rest === english) {
        const url = request.nextUrl.clone();
        url.pathname = `/en${neutral}`;
        return NextResponse.rewrite(url);
      }
      if (rest === neutral) {
        const url = request.nextUrl.clone();
        url.pathname = `/en${english}`;
        return NextResponse.redirect(url, 308);
      }
    }
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
  matcher: [
    "/((?!api|v1|og/|_next|[^/]+\\.[a-zA-Z0-9]+$).*)",
    // Seulement pour répondre 400 aux adresses mal formées (voir `proxy`).
    "/(api|v1|og)(/.*)?",
  ],
};
