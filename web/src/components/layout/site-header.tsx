import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Alternates } from "@/lib/alternates";
import type { HeaderModel } from "@/lib/chrome";
import { LanguageSwitcher } from "./language-switcher";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { ProductsMenu } from "./products-menu";

/**
 * En-tête collant, sur fond papier et cadré par des filets d'un pixel : le logo, chaque entrée de navigation et
 * chaque action occupent une « cellule » (comme le cadran d'un instrument) ; l'action principale est la dernière
 * cellule, pleine, en orange signal.
 * Navigation du §6 : IA souveraine · Solutions · Produits (menu) · Tarifs · Ressources ;
 * à droite : langue, « Connexion » (lien) et « Planifier un diagnostic » (bouton).
 * Les entrées viennent de Directus (`navigation`), avec repli sur les dictionnaires (voir lib/chrome.ts).
 * Sous le point de rupture « nav » (72 rem), la navigation devient un menu modal.
 */
export function SiteHeader({
  lang,
  dict,
  header,
  alternates,
}: {
  lang: Lang;
  dict: Dictionary;
  header: HeaderModel;
  alternates: Alternates;
}) {
  const { a11y, language } = dict;
  const { login, cta } = header;
  // le menu mobile affiche les liens, puis le menu « Produits » à plat
  const links = header.nav.flatMap((n) => (n.type === "link" ? [n] : []));
  const menu = header.nav.find((n) => n.type === "menu");
  const products = menu?.type === "menu" ? menu : null;

  const switcher = (
    <LanguageSwitcher
      current={lang}
      label={language.label}
      names={{ fr: language.fr, en: language.en }}
      alternates={alternates}
    />
  );
  // un second repère de langue (menu mobile) porte un nom distinct : deux repères identiques gêneraient la navigation
  const mobileSwitcher = (
    <LanguageSwitcher
      current={lang}
      label={`${language.label}, ${a11y.mobileNav.toLowerCase()}`}
      names={{ fr: language.fr, en: language.en }}
      alternates={alternates}
    />
  );
  const cell =
    "inline-flex h-full min-h-14 items-center border-l border-line px-5 text-[0.9375rem] font-medium text-fg-muted transition-colors duration-150 hover:bg-fg/[0.05] hover:text-fg aria-[current=page]:text-fg aria-[current=page]:shadow-[inset_0_-2px_0_var(--accent-graphic)]";

  return (
    <header className="theme-light sticky top-0 z-40 border-b border-line bg-bg/95 text-fg backdrop-blur-md">
      <div className="flex min-h-14 w-full items-stretch">
        <Link
          href={localizePath(lang, "/")}
          prefetch={false}
          aria-label={a11y.homeLink}
          className="flex items-center rounded-none px-gutter"
        >
          <Logo tone="light" />
        </Link>

        <nav aria-label={a11y.mainNav} className="hidden nav:block">
          <ul className="flex h-full items-stretch">
            {header.nav.map((item) =>
              item.type === "menu" ? (
                <li key={`menu|${item.label}`} className="flex">
                  <ProductsMenu
                    label={item.label}
                    items={item.items}
                    className={cell}
                  />
                </li>
              ) : (
                <li key={`${item.href}|${item.label}`} className="flex">
                  <NavLink href={item.href} path={item.path} className={cell}>
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="ml-auto flex items-stretch">
          <div className="hidden items-stretch nav:flex">
            <div className="flex items-center border-l border-line px-3">
              {switcher}
            </div>
            <NavLink href={login.href} path={login.path} className={cell}>
              {login.label}
            </NavLink>
            <Link
              href={cta.href}
              prefetch={false}
              className="inline-flex min-h-14 items-center bg-accent px-6 text-[0.9375rem] font-semibold text-on-accent transition-colors duration-150 hover:bg-ember-400"
            >
              {cta.label}
            </Link>
          </div>
          <MobileMenu
            labels={{
              menuButton: a11y.menuButton,
              closeButton: a11y.closeButton,
              openMenu: a11y.openMenu,
              closeMenu: a11y.closeMenu,
              title: a11y.menuTitle,
              nav: a11y.mobileNav,
              products: products?.label ?? "",
            }}
            links={links}
            products={products?.items ?? []}
            login={login}
            cta={cta}
            logo={<Logo tone="dark" />}
            languageSwitcher={mobileSwitcher}
          />
        </div>
      </div>
    </header>
  );
}
