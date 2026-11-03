import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LightField } from "@/components/signal/light-field";
import { MotionToggle } from "@/components/signal/motion";
import { ArrowIcon } from "@/components/ui/button";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { getVisualsDictionary } from "@/i18n/visuals";
import type { Alternates } from "@/lib/alternates";
import { BRAND } from "@/lib/brand";
import type { FooterModel } from "@/lib/chrome";
import { LanguageSwitcher } from "./language-switcher";

/**
 * Pied de page (identité « Signal ») : accès rapides, marque, quatre colonnes de liens (solutions, infrastructure,
 * outils, entreprise), légal, langue et bouton de pause des animations. Aucune mention légale inventée : la raison
 * sociale et les numéros officiels seront fournis par le fondateur. Signature : le nom de la marque, composé très grand
 * au trait de lumière, posé sur un horizon de points (champ de lumière figé).
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
  const motion = getVisualsDictionary(lang).signal.motion;
  const linkClass =
    "inline-flex min-h-11 min-w-11 items-center rounded-xs text-small text-fg-muted transition-colors duration-150 hover:text-fg hover:underline hover:underline-offset-4 md:min-h-9 md:min-w-0";
  const quick = [
    footer.quick.myTools,
    footer.quick.pricing,
    footer.quick.contact,
  ];

  return (
    <footer className="theme-dark relative isolate overflow-hidden border-t border-line bg-bg text-fg">
      <div aria-hidden="true" className="rails" />
      <div className="relative mx-auto w-full max-w-page px-gutter pt-10 sm:pt-14">
        <nav aria-label={footer.quick.title}>
          <ul className="grid gap-px overflow-hidden rounded-frame border border-line bg-line sm:grid-cols-3">
            {quick.map((item, i) => (
              <li key={item.href} className="flex">
                <Link
                  href={localizePath(lang, item.href)}
                  prefetch={false}
                  className="group/btn flex min-h-11 w-full flex-col justify-between gap-3 bg-surface p-5 transition-colors duration-200 hover:bg-surface-2 sm:p-6"
                >
                  <span className="flex items-center justify-between gap-3 font-display text-h4 text-fg">
                    {item.label}
                    <ArrowIcon
                      className={i === 0 ? "text-accent-text" : "text-fg-muted"}
                    />
                  </span>
                  <span className="text-small text-fg-muted">{item.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 grid gap-12 sm:mt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,3fr)]">
          <div>
            <Link
              href={localizePath(lang, "/")}
              prefetch={false}
              aria-label={a11y.homeLink}
              className="inline-flex min-h-11 items-center rounded-xs"
            >
              <Logo tone="dark" />
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
            <MotionToggle labels={motion} />
            <p className="text-small text-fg-muted">{footer.copyright}</p>
          </div>
        </div>
      </div>

      {/* Signature : le nom très grand au trait de lumière, sur un horizon de points (figé). */}
      <div
        aria-hidden="true"
        className="relative mt-12 h-[clamp(7rem,22vw,20rem)] overflow-hidden sm:mt-16"
      >
        <div className="absolute inset-x-0 bottom-0 h-[70%] opacity-80 [mask-image:linear-gradient(to_top,#000,transparent)]">
          <LightField animated={false} horizon={0.02} relief={0.08} cols={96} />
        </div>
        <p className="absolute inset-x-0 bottom-[-0.18em] select-none text-center font-display text-[clamp(5rem,21vw,19rem)] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(255_102_0/0.45)]">
          {BRAND.wordmark.base}
        </p>
      </div>
    </footer>
  );
}
