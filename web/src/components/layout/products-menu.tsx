"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type ProductsMenuProps = {
  label: string;
  /** Classes de la cellule de l'en-tête (le bouton remplit la hauteur de la barre). */
  className?: string;
  items: ReadonlyArray<{ label: string; description: string; href: string }>;
};

/**
 * Menu « Produits » : bouton à divulgation (WAI-ARIA APG « Disclosure Navigation »).
 * - le bouton porte aria-expanded et aria-controls ;
 * - Échap referme et rend le focus au bouton ; un clic ou le focus hors du menu le referme ;
 * - un clic sur un lien referme le menu ; aucune trappe à focus (ce n'est pas une modale).
 */
export function ProductsMenu({ label, items, className }: ProductsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onOutside = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("focusin", onOutside);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group gap-1.5",
          className ??
            "inline-flex min-h-11 items-center px-3 text-[0.9375rem] text-fg-muted hover:text-fg",
          open && "bg-fg/[0.05] text-fg",
        )}
      >
        {label}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
          className={cn(
            "size-3 transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path
            d="M2 4.25 6 8l4-3.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="square"
          />
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="theme-light absolute left-0 top-full z-50 mt-px w-[min(42rem,calc(100vw-3rem))] overflow-hidden rounded-b-lg border border-t-0 border-line bg-bg/95 p-2 shadow-lift backdrop-blur-xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-graphic/70 to-transparent"
        />
        <ul className="grid gap-px sm:grid-cols-2">
          {items.map((item, i) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="group/item block rounded-md px-4 py-3.5 transition-colors duration-150 hover:bg-fg/[0.05]"
              >
                <span className="flex items-baseline gap-3 text-[0.9375rem] font-medium text-fg">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[0.6875rem] text-fg-muted transition-colors duration-150 group-hover/item:text-accent-text"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.label}
                </span>
                {item.description ? (
                  <span className="mt-1 block pl-8 text-small text-fg-muted">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
