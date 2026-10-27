"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HTML_LANG,
  LANGS,
  type Lang,
  localizePath,
  stripLangPrefix,
} from "@/i18n/config";
import {
  type Alternates,
  alternatePath,
  NO_ALTERNATES,
} from "@/lib/alternates";
import { cn } from "@/lib/cn";

type LanguageSwitcherProps = {
  current: Lang;
  /** Libellé du groupe (« Langue »). */
  label: string;
  names: Record<Lang, { short: string; name: string }>;
  /** "compact" : FR / EN (en-tête, menu mobile) ; "full" : noms complets (pied de page). */
  variant?: "compact" | "full";
  className?: string;
  /** Table de correspondance des slugs (Directus) : l'autre langue utilise le slug traduit de la page courante. */
  alternates?: Alternates;
};

/**
 * Sélecteur de langue : un lien par langue vers la même page dans l'autre langue
 * (fr-CA à la racine, en-CA sous /en), avec le slug TRADUIT de la page quand il diffère (souverainete ↔
 * sovereignty ; table tirée de Directus). Navigation par liens, donc fonctionnelle sans JavaScript
 * côté clic et indexable ; `lang` et `hrefLang` indiquent la langue de chaque cible.
 */
export function LanguageSwitcher({
  current,
  label,
  names,
  variant = "compact",
  className,
  alternates = NO_ALTERNATES,
}: LanguageSwitcherProps) {
  const neutral = stripLangPrefix(usePathname());
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex items-center",
        variant === "compact" ? "gap-1" : "gap-5",
        className,
      )}
    >
      {LANGS.map((lang) => {
        const isCurrent = lang === current;
        const info = names[lang];
        return (
          <Link
            key={lang}
            href={localizePath(
              lang,
              isCurrent ? neutral : alternatePath(alternates, current, neutral),
            )}
            prefetch={false}
            lang={HTML_LANG[lang]}
            hrefLang={HTML_LANG[lang]}
            aria-current={isCurrent ? "true" : undefined}
            className={cn(
              "inline-flex items-center justify-center rounded-xs transition-colors duration-150",
              variant === "compact"
                ? "min-h-11 min-w-11 px-2 font-mono text-label uppercase"
                : "min-h-11 text-small",
              isCurrent ? "text-fg" : "text-fg-muted hover:text-fg",
              isCurrent &&
                variant === "compact" &&
                "underline decoration-accent-graphic decoration-2 underline-offset-[6px]",
              isCurrent &&
                variant === "full" &&
                "underline decoration-accent-graphic decoration-2 underline-offset-[6px]",
            )}
          >
            {variant === "compact" ? (
              <>
                <span aria-hidden="true">{info.short}</span>
                <span className="sr-only">{info.name}</span>
              </>
            ) : (
              info.name
            )}
          </Link>
        );
      })}
    </nav>
  );
}
