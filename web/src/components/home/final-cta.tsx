import { MosaicBackdrop } from "@/components/brand/mosaic-backdrop";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Appel à l'action final, sur fond clair, avec la grille de périmètre en filigrane. */
export function FinalCta({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["home"]["finalCta"];
}) {
  return (
    <Section
      tone="light"
      surface
      aria-labelledby="cta-title"
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden opacity-40 md:block"
        >
          <MosaicBackdrop shape="wide" animated={false} />
        </div>
      }
    >
      <div className="max-w-2xl">
        <h2 id="cta-title" className="text-h1 text-fg">
          {t.title}
        </h2>
        <p className="mt-5 text-lead text-fg-muted">{t.text}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={localizePath(lang, "/contact")} size="lg">
            {t.primary}
          </ButtonLink>
          <ButtonLink
            href={localizePath(lang, "/solutions")}
            variant="secondary"
            size="lg"
          >
            {t.secondary}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
