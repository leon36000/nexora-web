"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Props = {
  entries: ReadonlyArray<{ id: string; label: string }>;
  label: string;
  openLabel: string;
};

/**
 * Sommaire des pages longues (au moins trois blocs avec ancre) :
 * - bureau : barre collante sous l'en-tête, la section en cours est soulignée (aria-current="location") ;
 * - mobile : menu déroulant natif (<details>), refermé après le choix d'une rubrique.
 * Sans JavaScript, les liens d'ancre fonctionnent ; seule la mise en évidence de la section courante est perdue.
 */
export function PageToc({ entries, label, openLabel }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const targets = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || !("IntersectionObserver" in window)) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (items) => {
        for (const item of items) {
          if (item.isIntersecting) visible.add(item.target.id);
          else visible.delete(item.target.id);
        }
        // la première rubrique visible, dans l'ordre de la page
        setActive(entries.find((e) => visible.has(e.id))?.id ?? null);
      },
      { rootMargin: "-20% 0px -55% 0px" },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [entries]);

  const close = () => {
    if (details.current) details.current.open = false;
  };

  return (
    <div className="theme-light sticky top-16 z-30 border-b border-line bg-bg/95 text-fg backdrop-blur-md">
      <nav aria-label={label} className="mx-auto w-full max-w-page px-gutter">
        <details ref={details} className="group md:hidden">
          <summary
            aria-label={openLabel}
            className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 font-mono text-label uppercase text-fg [&::-webkit-details-marker]:hidden"
          >
            <span>{label}</span>
            <svg
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
              className="size-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            >
              <path
                d="M2 4.25 6 8l4-3.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="square"
              />
            </svg>
          </summary>
          <ul className="border-t border-line pb-3 pt-1">
            {entries.map((e) => (
              <li key={e.id}>
                <a
                  href={`#${e.id}`}
                  onClick={close}
                  aria-current={active === e.id ? "location" : undefined}
                  className={cn(
                    "flex min-h-11 items-center text-[0.9375rem]",
                    active === e.id ? "text-fg" : "text-fg-muted",
                  )}
                >
                  {e.label}
                </a>
              </li>
            ))}
          </ul>
        </details>

        <ul className="hidden items-center gap-1 overflow-x-auto md:flex">
          <li className="mr-3 shrink-0 font-mono text-label uppercase text-fg-muted">
            {label}
          </li>
          {entries.map((e) => (
            <li key={e.id} className="shrink-0">
              <a
                href={`#${e.id}`}
                aria-current={active === e.id ? "location" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center px-3 text-[0.9375rem] transition-colors duration-150 hover:text-fg",
                  active === e.id
                    ? "text-fg underline decoration-accent decoration-2 underline-offset-[10px]"
                    : "text-fg-muted",
                )}
              >
                {e.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
