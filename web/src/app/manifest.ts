import type { MetadataRoute } from "next";
import { getDictionary } from "@/i18n/get-dictionary";
import { SITE_NAME } from "@/lib/site";

/**
 * Manifeste d'application (installation sur l'écran d'accueil). Tuile noir profond et symbole Nexora AI ;
 * les trois PNG sont dans `public/` (générés par `docs/marque/outils/rasteriser.mjs`). Le site est français d'abord :
 * `lang` fr-CA ; la version anglaise reste atteignable par le sélecteur de langue.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: getDictionary("fr").meta.home.description,
    lang: "fr-CA",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#14171a",
    theme_color: "#14171a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
