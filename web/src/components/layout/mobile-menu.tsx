"use client";

import Link from "next/link";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { NavLink } from "./nav-link";
import { SessionLabel } from "./session-label";

type NavItem = { label: string; href: string; path: string };

type MobileMenuProps = {
  labels: {
    menuButton: string;
    closeButton: string;
    openMenu: string;
    closeMenu: string;
    title: string;
    nav: string;
    products: string;
  };
  links: ReadonlyArray<NavItem>;
  /** Entrées du menu Produits, affichées à plat dans le menu mobile. */
  products: ReadonlyArray<{ label: string; description: string; href: string }>;
  login: NavItem;
  accountLabel: string;
  cta: NavItem;
  /** Logo et sélecteur de langue, rendus côté serveur. */
  logo: ReactNode;
  languageSwitcher: ReactNode;
};

/**
 * Menu mobile complet, en <dialog> modal natif :
 * - focus piégé dans la boîte (le reste de la page est inerte) ;
 * - Échap ferme ; le focus revient au bouton d'ouverture ;
 * - un clic sur un lien ferme et navigue ; le défilement de la page est bloqué (CSS :has).
 * Se referme aussi si la fenêtre dépasse le point de rupture de la navigation complète.
 */
export function MobileMenu({
  labels,
  links,
  products,
  login,
  accountLabel,
  cta,
  logo,
  languageSwitcher,
}: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const dialogId = useId();

  useEffect(() => {
    const query = window.matchMedia("(min-width: 72rem)");
    const onChange = () => {
      if (query.matches) dialogRef.current?.close();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /** Piège le focus : Tab sur le dernier élément revient au premier, Maj+Tab sur le premier va au dernier. */
  const trapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled])",
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const openMenu = () => {
    dialogRef.current?.showModal();
    setOpen(true);
  };
  const closeMenu = () => dialogRef.current?.close();

  return (
    <div className="flex nav:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.openMenu}
        onClick={openMenu}
        className="flex h-full min-h-14 items-center gap-2.5 border-l border-line px-5 font-mono text-label uppercase text-fg transition-colors duration-150 hover:bg-fg/[0.05]"
      >
        <span aria-hidden="true" className="flex w-4 flex-col gap-1">
          <span className="h-0.5 w-full bg-current" />
          <span className="h-0.5 w-full bg-current" />
          <span className="h-0.5 w-3 bg-current" />
        </span>
        <span aria-hidden="true">{labels.menuButton}</span>
      </button>

      <dialog
        ref={dialogRef}
        id={dialogId}
        aria-labelledby={titleId}
        onKeyDown={trapFocus}
        onClose={() => {
          setOpen(false);
          buttonRef.current?.focus();
        }}
        className="theme-dark m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-bg p-0 text-fg"
      >
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-gutter pb-10 pt-3">
          <div className="flex min-h-14 items-center justify-between">
            <span aria-hidden="true">{logo}</span>
            <h2 id={titleId} className="sr-only">
              {labels.title}
            </h2>
            <button
              type="button"
              aria-label={labels.closeMenu}
              onClick={closeMenu}
              className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-line-strong px-4 font-mono text-label uppercase text-fg transition-colors duration-150 hover:bg-fg/10"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
                className="size-4"
              >
                <path
                  d="m3 3 10 10M13 3 3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              </svg>
              <span aria-hidden="true">{labels.closeButton}</span>
            </button>
          </div>

          <nav aria-label={labels.nav} className="mt-8 flex-1">
            <ul className="divide-y divide-line border-y border-line">
              {links.map((item) => (
                <li key={item.href}>
                  <NavLink
                    href={item.href}
                    path={item.path}
                    onNavigate={closeMenu}
                    className="flex min-h-14 items-center font-display text-h3 text-fg-muted transition-colors duration-150 hover:text-fg"
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {products.length > 0 ? (
              <div className="mt-8">
                <Badge>{labels.products}</Badge>
                <ul className="mt-3 divide-y divide-line border-y border-line">
                  {products.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={false}
                        onClick={closeMenu}
                        className="block py-3.5"
                      >
                        <span className="block text-base font-medium text-fg">
                          {item.label}
                        </span>
                        {item.description ? (
                          <span className="mt-0.5 block text-small text-fg-muted">
                            {item.description}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </nav>

          <div className="mt-10 flex flex-col gap-3">
            <ButtonLink
              href={cta.href}
              size="lg"
              onClick={closeMenu}
              className="w-full"
            >
              {cta.label}
            </ButtonLink>
            <ButtonLink
              href={login.href}
              variant="secondary"
              size="lg"
              onClick={closeMenu}
              className="w-full"
            >
              <SessionLabel label={login.label} signedInLabel={accountLabel} />
            </ButtonLink>
          </div>

          <div className="mt-8 flex justify-start border-t border-line pt-4">
            {languageSwitcher}
          </div>
        </div>
      </dialog>
    </div>
  );
}
