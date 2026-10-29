"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { type Lang, localizePath } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { PANEL_NAV, type PanelSection, sectionOfPath } from "./panel-logic";

const ITEM =
  "flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border px-4 py-2 text-[0.9375rem] transition-colors duration-150 lg:w-full";
const IDLE =
  "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg lg:border-l-2 lg:rounded-l-none";
const CURRENT =
  "border-line-strong bg-surface-2 font-medium text-fg lg:border-transparent lg:border-l-accent-graphic lg:rounded-l-none";

/**
 * Navigation du panneau client : colonne à gauche sur grand écran, onglets qui défilent sur téléphone. Ce sont de
 * vrais liens (`aria-current="page"` sur la page ouverte), pas des onglets ARIA : chaque entrée change de page.
 * L'entrée active est ramenée dans la zone visible quand la bande d'onglets défile.
 */
export function PanelNav({
  lang,
  label,
  soonLabel,
  items,
  appsAvailable,
}: {
  lang: Lang;
  label: string;
  soonLabel: string;
  items: Record<PanelSection, string>;
  /** La page publique `/apps` existe-t-elle dans ce déploiement ? Sinon l'entrée annonce « Bientôt ». */
  appsAvailable: boolean;
}) {
  const current = sectionOfPath(usePathname() ?? "");
  const listRef = useRef<HTMLUListElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: l'entrée active change avec `current`
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.scrollWidth <= list.clientWidth) return;
    list
      .querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [current]);

  return (
    <nav aria-label={label}>
      <ul
        ref={listRef}
        className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-2 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {PANEL_NAV.map((item) => {
          const text = items[item.id];
          if (item.id === "apps" && !appsAvailable)
            return (
              <li key={item.id} className="shrink-0 lg:shrink">
                <span className={cn(ITEM, IDLE, "cursor-default")}>
                  {text}
                  <span className="rounded-xs border border-line px-1.5 py-0.5 font-mono text-label uppercase text-fg-muted">
                    {soonLabel}
                  </span>
                </span>
              </li>
            );
          const active = item.id === current;
          return (
            <li key={item.id} className="shrink-0 lg:shrink">
              <Link
                href={localizePath(lang, item.path)}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(ITEM, active ? CURRENT : IDLE)}
              >
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
