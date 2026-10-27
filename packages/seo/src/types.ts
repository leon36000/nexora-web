/** Constat d'un contrôle SEO. `rule` est un identifiant stable (sert à dédoublonner les problèmes dans la base). */
export interface SeoFinding {
  rule: string;
  severity: "error" | "warning" | "info";
  url: string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface Hreflang {
  hreflang: string;
  href: string;
}

/** Ce qu'une page expose aux moteurs, extrait de son HTML rendu. */
export interface PageSeo {
  url: string;
  status?: number;
  lang: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** Valeur combinée en minuscules : balise meta robots + en-tête X-Robots-Tag. Vide si aucune directive. */
  robots: string;
  noindex: boolean;
  alternates: Hreflang[];
  h1s: string[];
  /** Blocs JSON-LD parsés (une valeur par balise). */
  jsonLd: unknown[];
  /** Balises JSON-LD illisibles (message de parse). */
  jsonLdErrors: string[];
  /** Texte visible : sans script, style, JSON-LD ni gabarits. */
  visibleText: string;
  og: {
    title: string | null;
    description: string | null;
    image: string | null;
    url: string | null;
  };
}

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  alternates: Hreflang[];
}
