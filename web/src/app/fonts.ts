import localFont from "next/font/local";

/**
 * Polices libres (SIL OFL 1.1) servies localement : voir src/fonts/README.md.
 * Variables CSS consommées par `@theme` dans globals.css.
 */
export const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "optional",
});

export const inter = localFont({
  src: "../fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  // Préchargée (48 Ko) et en `optional`, comme Geist : le chapeau du héros (premier écran) est en Inter, et un échange de
  // police tardif le décalerait de quelques pixels (CLS) et ferait repeindre le plus grand texte de la page (LCP en
  // deux temps). Si la police n'est pas là dans les ~100 ms, la page garde sa police de repli (métriques ajustées) pour
  // cette visite ; les visites suivantes la trouvent en cache.
  display: "optional",
  preload: true,
});

export const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
  preload: false, // libellés seulement : pas nécessaire au premier affichage
});
