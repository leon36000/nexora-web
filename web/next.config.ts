import type { NextConfig } from "next";
import {
  API_CORP,
  API_CSP,
  SECURITY_HEADERS,
} from "./src/lib/security-headers";

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
    // AVIF d’abord (plus léger), WebP sinon : les photos du site (produits, infrastructure) sont lourdes.
    formats: ["image/avif", "image/webp"],
    // Les images du CMS passent par /api/media/<id> (jeton lecteur côté serveur, raster seulement).
    localPatterns: [{ pathname: "/api/media/*" }],
  },
  // Les polices des images Open Graph (route /og) sont lues sur disque : à inclure dans une sortie tracée.
  outputFileTracingIncludes: {
    "/og/**": ["./src/fonts/og/**"],
    // Guide de branchement Proxmox (PDF) servi aux administrateurs.
    "/api/admin/vps/**": ["../docs/vps/*.pdf"],
  },
  // En-têtes de sécurité (S9) sur toutes les routes ; la CSP des pages est posée par proxy.ts (elle dépend de la bulle).
  async headers() {
    const csp = [{ key: "Content-Security-Policy", value: API_CSP }];
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/api/:path*", headers: [...csp, API_CORP] },
      { source: "/v1/:path*", headers: [...csp, API_CORP] },
      // Réponses qui ne sont pas des pages : images, texte, XML et icône n'ont besoin d'aucune ressource.
      { source: "/og/:path*", headers: csp },
      { source: "/llms.txt", headers: csp },
      { source: "/sitemap.xml", headers: csp },
      { source: "/robots.txt", headers: csp },
      { source: "/icon.svg", headers: csp },
      { source: "/favicon.ico", headers: csp },
      { source: "/apple-icon.png", headers: csp },
      { source: "/manifest.webmanifest", headers: csp },
      { source: "/icon-:size.png", headers: csp },
      { source: "/icon-maskable-:size.png", headers: csp },
    ];
  },
  async rewrites() {
    return {
      // Interface web de Nexora Code sur son origine dédiée : `<id de 32 hex>.<suffixe>/…` → `/code/ws/<id>/…`, TOUS les
      // chemins (fichiers statiques compris). Le suffixe est vérifié à l'exécution par la route (NEXORA_CODE_HOST_SUFFIX).
      beforeFiles: [
        {
          source: "/:path*",
          has: [{ type: "host", value: "(?<wsid>[0-9a-f]{32})\\..+" }],
          destination: "/code/ws/:wsid/:path*",
        },
      ],
      // Fichier de clé IndexNow à la racine (`/<clé de 32 hex>.txt`), servi seulement si la clé correspond.
      afterFiles: [
        {
          source: "/:key([a-f0-9]{32}).txt",
          destination: "/api/seo/indexnow-key/:key",
        },
      ],
      fallback: [],
    };
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
