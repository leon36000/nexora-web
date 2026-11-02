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
import { SessionLabel } from "./session-label";

/**
 * En-tête collant en verre sombre (identité « Signal ») : le logo, la navigation, puis la langue, la connexion et
 * l'action principale (bouton ion).
 * Navigation (refonte du 02/11/2026) : Solutions ▾ · Infrastructure ▾ · Outils ▾ · Tarifs · Ressources ;
 * à droite : langue, « Connexion » (lien) et « Planifier une consultation » (bouton).
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
  // le menu mobile affiche les menus dépliables, puis les liens
  const links = header.nav.flatMap((n) => (n.type === "link" ? [n] : []));
  const groups = header.nav.flatMap((n) => (n.type === "menu" ? [n] : []));

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
    "inline-flex h-full min-h-16 items-center px-3.5 text-[0.9375rem] font-medium text-fg-muted transition-colors duration-150 hover:text-fg aria-[current=page]:text-fg aria-[current=page]:shadow-[inset_0_-1px_0_var(--accent-graphic)]";

  return (
    <header className="theme-light sticky top-0 z-40 border-b border-line bg-bg text-fg">
      <div className="mx-auto flex min-h-16 w-full max-w-[96rem] items-stretch pl-gutter">
        <Link
          href={localizePath(lang, "/")}
          prefetch={false}
          aria-label={a11y.homeLink}
          className="mr-6 flex items-center rounded-sm"
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
          <div className="hidden items-center gap-1 pr-gutter nav:flex">
            <div className="flex items-center px-2">{switcher}</div>
            <NavLink href={login.href} path={login.path} className={cell}>
              <SessionLabel
                label={login.label}
                signedInLabel={dict.nav.accountLabel}
              />
            </NavLink>
            <Link
              href={cta.href}
              prefetch={false}
              className="ml-2 inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-[0.9375rem] font-semibold text-on-accent transition-[background-color,box-shadow] duration-150 hover:bg-accent-hover hover:shadow-[var(--glow-ion)]"
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
            }}
            links={links}
            groups={groups}
            login={login}
            accountLabel={dict.nav.accountLabel}
            cta={cta}
            logo={<Logo tone="light" />}
            languageSwitcher={mobileSwitcher}
          />
        </div>
      </div>
    </header>
  );
}
