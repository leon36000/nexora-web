import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LanguageSwitcher } from "./language-switcher";
import { MobileMenu } from "./mobile-menu";
import { NavLink } from "./nav-link";
import { ProductsMenu } from "./products-menu";

/**
 * En-tête collant, toujours sur fond sombre (thème « encre forêt »).
 * Navigation du §6 : IA souveraine · Solutions · Produits (menu) · Tarifs · Ressources ;
 * à droite : langue, « Connexion » (lien) et « Planifier un diagnostic » (bouton).
 * Sous le point de rupture « nav » (72 rem), la navigation devient un menu modal.
 */
export function SiteHeader({ lang, dict }: { lang: Lang; dict: Dictionary }) {
  const { nav, a11y, language } = dict;
  const toItem = (entry: { label: string; href: string }) => ({
    label: entry.label,
    path: entry.href,
    href: localizePath(lang, entry.href),
  });

  const links = [
    nav.sovereignty,
    nav.solutions,
    nav.pricing,
    nav.resources,
  ].map(toItem);
  const [sovereignty, solutions, pricing, resources] = links;
  const products = nav.products.items.map((item) => ({
    ...item,
    href: localizePath(lang, item.href),
  }));
  const login = toItem(nav.login);
  const cta = toItem(nav.cta);

  const switcher = (
    <LanguageSwitcher
      current={lang}
      label={language.label}
      names={{ fr: language.fr, en: language.en }}
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
            <li>
              <NavLink
                href={sovereignty.href}
                path={sovereignty.path}
                className={linkClass}
              >
                {sovereignty.label}
              </NavLink>
            </li>
            <li>
              <NavLink
                href={solutions.href}
                path={solutions.path}
                className={linkClass}
              >
                {solutions.label}
              </NavLink>
            </li>
            <li>
              <ProductsMenu label={nav.products.label} items={products} />
            </li>
            <li>
              <NavLink
                href={pricing.href}
                path={pricing.path}
                className={linkClass}
              >
                {pricing.label}
              </NavLink>
            </li>
            <li>
              <NavLink
                href={resources.href}
                path={resources.path}
                className={linkClass}
              >
                {resources.label}
              </NavLink>
            </li>
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
              products: nav.products.label,
            }}
            links={links}
            products={products}
            login={login}
            cta={cta}
            logo={<Logo tone="dark" />}
            languageSwitcher={switcher}
          />
        </div>
      </div>
    </header>
  );
}
