import type { NextConfig } from "next";
import { API_CSP, SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Aucun « X-Powered-By: Next.js ».
  poweredByHeader: false,
  // Désactivé exprès : avec le prefetch partiel (App Shell), la première visite d'une URL absente de
  // generateStaticParams reçoit l'enveloppe en 200 AVANT que notFound() ne s'exécute (soft 404). Sans lui,
  // la première requête attend le rendu complet : une page inconnue répond un vrai 404.
  partialPrefetching: false,
  images: {
    // D11 : le SVG reste désactivé (valeur par défaut, écrite pour qu'elle ne change pas par mégarde).
    dangerouslyAllowSVG: false,
    // Les images du CMS passent par /api/media/<id> (jeton lecteur côté serveur, raster seulement).
    localPatterns: [{ pathname: "/api/media/*" }],
  },
  // Les polices des images Open Graph (route /og) sont lues sur disque : à inclure dans une sortie tracée.
  outputFileTracingIncludes: { "/og/**": ["./src/fonts/og/**"] },
  // En-têtes de sécurité (S9) sur toutes les routes ; la CSP des pages est posée par proxy.ts (elle dépend de la bulle).
  async headers() {
    const csp = [{ key: "Content-Security-Policy", value: API_CSP }];
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: csp },
      { source: "/v1/:path*", headers: csp },
    ];
  },
  async rewrites() {
    // Fichier de clé IndexNow à la racine (`/<clé de 32 hex>.txt`), servi seulement si la clé correspond.
    return [
      {
        source: "/:key([a-f0-9]{32}).txt",
        destination: "/api/seo/indexnow-key/:key",
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
