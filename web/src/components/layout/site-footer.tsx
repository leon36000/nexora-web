import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Alternates } from "@/lib/alternates";
import type { FooterModel } from "@/lib/chrome";
import { LanguageSwitcher } from "./language-switcher";

/**
 * Pied de page dense, sur fond papier et cadré par des filets : marque, quatre colonnes de liens (produits,
 * solutions, entreprise, centre de confiance), légal et sélecteur de langue. Aucune mention légale inventée : la
 * raison sociale et les numéros officiels seront fournis par le fondateur. Signature : le « N » en pixels posé sur la
 * bande braise (quatre barres franches) qu'un carré traverse lentement.
 */
export function SiteFooter({
  lang,
  dict,
  model,
  alternates,
}: {
  lang: Lang;
  dict: Dictionary;
  model: FooterModel;
  alternates: Alternates;
}) {
  const { footer, a11y, language } = dict;
  const linkClass =
    "inline-flex min-h-8 items-center rounded-xs text-small text-fg-muted transition-colors duration-150 hover:text-fg hover:underline hover:underline-offset-4";

  return (
    <footer className="theme-light relative isolate overflow-hidden border-t border-line bg-bg text-fg">
      <div aria-hidden="true" className="rails" />
      <div className="relative mx-auto w-full max-w-page px-gutter pt-14 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,3fr)]">
          <div>
            <Link
              href={localizePath(lang, "/")}
              prefetch={false}
              aria-label={a11y.homeLink}
              className="inline-block rounded-xs"
            >
              <Logo tone="light" />
            </Link>
            <p className="mt-5 max-w-xs font-display text-h4 text-fg">
              {footer.tagline}
            </p>
            <p className="mt-3 text-small text-fg-muted">{footer.location}</p>
          </div>

          <nav
            aria-label={a11y.footerNav}
            className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4"
          >
            {model.columns.map((column) => (
              <div key={column.title}>
                <h2 className="font-mono text-label uppercase text-fg-muted">
                  {column.title}
                </h2>
                <ul className="mt-4 flex flex-col">
                  {column.links.map((link) => (
                    <li key={`${link.href}|${link.label}`}>
                      <Link
                        href={link.href}
                        prefetch={false}
                        className={linkClass}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-line pt-6 lg:flex-row lg:items-center lg:justify-between">
          {model.legal.length > 0 ? (
            <div>
              <h2 className="sr-only">{footer.legalTitle}</h2>
              <ul className="flex flex-wrap gap-x-6">
                {model.legal.map((link) => (
                  <li key={`${link.href}|${link.label}`}>
                    <Link
                      href={link.href}
                      prefetch={false}
                      className={linkClass}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8 lg:ml-auto">
            <LanguageSwitcher
              current={lang}
              variant="full"
              label={`${language.label}, ${a11y.footerNav.toLowerCase()}`}
              names={{ fr: language.fr, en: language.en }}
              alternates={alternates}
            />
            <p className="text-small text-fg-muted">{footer.copyright}</p>
          </div>
        </div>
      </div>

      {/* Signature : le « N » en pixels sur la bande braise ; un carré la traverse (mouvement réduit : immobile). */}
      <div aria-hidden="true" className="relative mt-10 sm:mt-14">
        <div className="relative z-10 mx-auto w-full max-w-page px-gutter">
          <LogoMark tone="auto" className="-mb-px block size-24 sm:size-36" />
        </div>
        <div className="stripes relative h-16 overflow-hidden">
          <span className="stripe-cell absolute left-[12%] top-[25%] block size-4 bg-bone" />
        </div>
      </div>
    </footer>
  );
}
