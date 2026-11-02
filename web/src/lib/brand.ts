/**
 * LA MARQUE, EN UN SEUL ENDROIT (identité « Signal », 2 novembre 2026).
 *
 * Le nom et le logo de l'entreprise vont changer : tout ce qui nomme ou dessine la marque se règle ici.
 *  - nom, logotype, signature : ce fichier ;
 *  - couleurs : jetons de `web/src/app/globals.css` (section « Marque ») ;
 *  - polices : `web/src/app/fonts.ts` ;
 *  - logo dessiné (quand il arrivera) : fichiers SVG dans `web/public/marque/`, puis `logo.kind = "svg"` ci-dessous ;
 *  - favicon : `web/src/app/icon.svg`.
 * Les textes éditoriaux (pages) restent dans Directus et dans les dictionnaires ; les noms des produits
 * (Nexora Creative, WorkStudio…) restent ceux du catalogue. Procédure complète : `docs/marque/charte.md` §1.
 */

export type BrandLogo =
  /** Logo typographique provisoire : le nom composé en Geist, le suffixe en JetBrains Mono, et la marque « signal ». */
  | { kind: "typographique" }
  /** Logo dessiné : deux fichiers (fonds sombres et clairs) et leur rapport largeur / hauteur. */
  | { kind: "svg"; dark: string; light: string; ratio: number };

export const BRAND = {
  /** Nom complet de l'entreprise (métadonnées, données structurées, pied de page, courriels). */
  name: "Nexora AI",
  /** Logotype : la partie principale et un suffixe technique facultatif (« AI »). */
  wordmark: { base: "Nexora", suffix: "AI" as string | null },
  /** Signature de marque (une phrase), par langue. */
  signature: {
    fr: "Une lumière précise dans le noir.",
    en: "Precise light in the dark.",
  },
  logo: { kind: "typographique" } as BrandLogo,
} as const;
