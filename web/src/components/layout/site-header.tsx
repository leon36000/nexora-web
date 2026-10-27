import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Alternates } from "@/lib/alternates";
import type { HeaderModel } from "@/lib/chrome";
import { LanguageSwitcher } from "./language-switcher";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { ProductsMenu } from "./products-menu";

/**
 * En-tête collant, toujours sur fond sombre (thème « encre forêt »).
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
  const linkClass =
    "inline-flex min-h-11 items-center rounded-xs px-3 text-[0.9375rem] text-fg-muted transition-colors duration-150 hover:text-fg";

  return (
    <header className="theme-dark sticky top-0 z-40 border-b border-line bg-bg/90 text-fg backdrop-blur-md">
      <div className="mx-auto flex min-h-16 w-full max-w-page items-center justify-between gap-6 px-gutter">
        <Link
          href={localizePath(lang, "/")}
          prefetch={false}
          aria-label={a11y.homeLink}
          className="rounded-xs py-2"
        >
          <Logo tone="dark" />
        </Link>

        <nav aria-label={a11y.mainNav} className="hidden nav:block">
          <ul className="flex items-center gap-1">
            {header.nav.map((item) =>
              item.type === "menu" ? (
                <li key={`menu|${item.label}`}>
                  <ProductsMenu label={item.label} items={item.items} />
                </li>
              ) : (
                <li key={`${item.href}|${item.label}`}>
                  <NavLink
                    href={item.href}
                    path={item.path}
                    className={linkClass}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 nav:flex">
            {switcher}
            <span aria-hidden="true" className="h-5 w-px bg-line" />
            <NavLink href={login.href} path={login.path} className={linkClass}>
              {login.label}
            </NavLink>
            <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
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
