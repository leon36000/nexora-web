"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type ProductsMenuProps = {
  label: string;
  items: ReadonlyArray<{ label: string; description: string; href: string }>;
};

/**
 * Menu « Produits » : bouton à divulgation (WAI-ARIA APG « Disclosure Navigation »).
 * - le bouton porte aria-expanded et aria-controls ;
 * - Échap referme et rend le focus au bouton ; un clic ou le focus hors du menu le referme ;
 * - un clic sur un lien referme le menu ; aucune trappe à focus (ce n'est pas une modale).
 */
export function ProductsMenu({ label, items }: ProductsMenuProps) {
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
          "group inline-flex min-h-11 items-center gap-1.5 rounded-xs px-3 text-[0.9375rem] transition-colors duration-150 hover:text-fg",
          open ? "text-fg" : "text-fg-muted",
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
        className="absolute left-1/2 top-full z-50 mt-2 w-[min(40rem,calc(100vw-3rem))] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-pop"
      >
        <ul className="grid gap-1 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch={false}
                onClick={() => setOpen(false)}
                className="block rounded-md px-4 py-3 transition-colors duration-150 hover:bg-surface-2"
              >
                <span className="block text-[0.9375rem] font-medium text-fg">
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
    </div>
  );
}
