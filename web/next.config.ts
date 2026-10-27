import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
