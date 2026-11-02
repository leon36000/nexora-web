import { type Lang, localizePath, stripLangPrefix } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { NavItem } from "@/server/cms/model";
import { type Alternates, resolveHrefForLang } from "./alternates";

/**
 * En-tête, pied de page et mentions légales : lus dans Directus (`navigation`) quand elle est disponible,
 * avec repli sur les dictionnaires (Directus muet sans instantané, ou navigation non publiée).
 * Tous les liens sortent localisés pour la langue d'affichage (voir `resolveHrefForLang`).
 */

type ChromeLink = { label: string; href: string; path: string };
type ChromeProduct = {
  label: string;
  description: string;
  href: string;
};
/** Entrée de la navigation principale, dans l'ordre de Directus : un lien, ou le menu « Produits ». */
type HeaderNavItem =
  | ({ type: "link" } & ChromeLink)
  | { type: "menu"; label: string; items: ChromeProduct[] };
export type HeaderModel = {
  nav: HeaderNavItem[];
  login: ChromeLink;
  cta: ChromeLink;
};
export type FooterModel = {
  columns: { title: string; links: { label: string; href: string }[] }[];
  legal: { label: string; href: string }[];
};
export type Chrome = {
  header: HeaderModel;
  footer: FooterModel;
  /** Vrai si au moins l'en-tête vient de Directus. */
  fromCms: boolean;
};

/** Chemin neutre (sans langue, sans barre finale) pour détecter la page courante. */
const pathOf = (href: string) => {
  const noQuery = href.split(/[?#]/)[0] ?? href;
  const neutral = stripLangPrefix(noQuery);
  return neutral.length > 1 ? neutral.replace(/\/+$/, "") : neutral;
};

/**
 * Le lien mène-t-il à une page qui existe ? Vrai pour un lien externe, une ancre, l'accueil, une page publiée dans
 * Directus (slug de l'une ou l'autre langue) ou une route de l'application (`appRoots`, sous-chemins compris).
 * `undefined` quand la table des pages publiées est vide (Directus muet sans instantané) : on ne sait pas, on ne
 * masque rien.
 */
export function targetExists(
  alt: Alternates,
  appRoots: readonly string[],
): ((href: string) => boolean) | undefined {
  if (Object.keys(alt.fr).length + Object.keys(alt.en).length === 0)
    return undefined;
  const roots = appRoots.map((r) => r.replace(/^\/+|\/+$/g, ""));
  return (href) => {
    if (!href.startsWith("/") || href.startsWith("//")) return true;
    const path = href.split(/[?#]/)[0] ?? "";
    const slug = stripLangPrefix(path).replace(/^\/+|\/+$/g, "");
    if (slug === "") return true;
    if (alt.fr[slug] !== undefined || alt.en[slug] !== undefined) return true;
    return roots.some((r) => slug === r || slug.startsWith(`${r}/`));
  };
}

/**
 * Lien vers une page éditoriale de Directus (politique de confidentialité, mentions légales…) depuis le corps d'une
 * page de l'application : localisé pour la langue d'affichage, ou `null` si la page n'est pas publiée (brouillon, pas
 * encore créée) pour ne jamais afficher un lien qui mène à un 404. Directus muet sans instantané : lien conservé.
 */
export function publishedPageHref(
  alt: Alternates,
  lang: Lang,
  neutralPath: string,
  appRoots: readonly string[] = [],
): string | null {
  const href = resolveHrefForLang(alt, lang, neutralPath);
  const exists = targetExists(alt, appRoots);
  return exists && !exists(href) ? null : href;
}

export function buildChrome(
  lang: Lang,
  dict: Dictionary,
  nav: readonly NavItem[],
  alt: Alternates,
  /** Voir `targetExists` : un lien interne vers une page absente est masqué plutôt que de mener à un 404. */
  exists?: (href: string) => boolean,
): Chrome {
  const live = (n: { href: string }) =>
    n.href !== "" && (!exists || exists(n.href));
  const link = (label: string, href: string): ChromeLink => {
    const resolved = href ? resolveHrefForLang(alt, lang, href) : "";
    return { label, href: resolved, path: pathOf(resolved) };
  };
  const dictLink = (e: { label: string; href: string }): ChromeLink => ({
    label: e.label,
    path: e.href,
    href: localizePath(lang, e.href),
  });

  // --- repli : exactement les dictionnaires (S1) ---
  const dictHeader: HeaderModel = {
    nav: [
      ...dict.nav.menus.map(
        (m): HeaderNavItem => ({
          type: "menu",
          label: m.label,
          items: m.items.map((i) => ({
            ...i,
            href: resolveHrefForLang(alt, lang, i.href),
          })),
        }),
      ),
      { type: "link", ...dictLink(dict.nav.pricing) },
      { type: "link", ...dictLink(dict.nav.resources) },
    ],
    login: dictLink(dict.nav.login),
    cta: dictLink(dict.nav.cta),
  };
  const dictFooter: FooterModel = {
    columns: dict.footer.columns.map((c) => ({
      title: c.title,
      links: c.links.map((l) => ({
        label: l.label,
        href: localizePath(lang, l.href),
      })),
    })),
    legal: dict.footer.legal.map((l) => ({
      label: l.label,
      href: localizePath(lang, l.href),
    })),
  };

  const headerRoots = nav.filter((n) => n.placement === "header");
  const footerRoots = nav.filter((n) => n.placement === "footer");
  const legalRoots = nav.filter((n) => n.placement === "legal");

  let header = dictHeader;
  if (headerRoots.length > 0) {
    const utility = headerRoots.find((n) => n.style === "utility");
    const button = headerRoots.find((n) => n.style === "button");
    const nav: HeaderNavItem[] = [];
    for (const n of headerRoots) {
      if (n.style !== "link") continue;
      if (n.children.length > 0) {
        const items = n.children.filter(live).map((c) => ({
          label: c.label,
          description: c.description ?? "",
          href: resolveHrefForLang(alt, lang, c.href),
        }));
        if (items.length > 0) nav.push({ type: "menu", label: n.label, items });
      } else if (live(n)) nav.push({ type: "link", ...link(n.label, n.href) });
    }
    header = {
      nav,
      login: utility ? link(utility.label, utility.href) : dictHeader.login,
      cta: button ? link(button.label, button.href) : dictHeader.cta,
    };
  }

  const footer: FooterModel = {
    columns:
      footerRoots.length > 0
        ? footerRoots
            .filter((c) => c.children.length > 0)
            .map((c) => ({
              title: c.label,
              links: c.children.filter(live).map((l) => ({
                label: l.label,
                href: resolveHrefForLang(alt, lang, l.href),
              })),
            }))
            // Une colonne dont tous les liens sont masqués disparaît avec son titre.
            .filter((c) => c.links.length > 0)
        : dictFooter.columns,
    legal:
      legalRoots.length > 0
        ? legalRoots.filter(live).map((l) => ({
            label: l.label,
            href: resolveHrefForLang(alt, lang, l.href),
          }))
        : dictFooter.legal,
  };

  return { header, footer, fromCms: headerRoots.length > 0 };
}
