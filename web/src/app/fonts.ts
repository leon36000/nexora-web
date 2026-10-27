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
  display: "swap",
  preload: false, // le LCP est un titre en Geist : on ne met pas Inter en concurrence sur le réseau
});

export const jetbrainsMono = localFont({
  src: "../fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
  preload: false, // libellés seulement : pas nécessaire au premier affichage
});
