import { SignalBackdrop } from "@/components/signal/materials";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Héros sombre : message directeur, sous-titre, deux CTA, grille de périmètre en signature. */
export function Hero({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["home"]["hero"];
}) {
  return (
    <Section
      tone="dark"
      flush
      aria-labelledby="hero-title"
      className="pb-20 pt-14 md:pb-32 md:pt-28"
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden opacity-70 md:block"
        >
          <SignalBackdrop variant="champ" />
        </div>
      }
    >
      <div className="max-w-2xl lg:max-w-[43rem]">
        <Badge tone="accent">{t.label}</Badge>
        <h1 id="hero-title" className="mt-6 text-display text-fg">
          {t.title}
        </h1>
        <p className="mt-7 max-w-xl text-lead text-fg-muted">{t.subtitle}</p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
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
      {/* Composition propre au mobile : le périmètre est un bloc sous le texte, pas un fond rogné. */}
      <div
        aria-hidden="true"
        className="mt-14 aspect-[12/7] w-full opacity-90 md:hidden"
      >
        <SignalBackdrop animated={false} variant="grille" />
      </div>
    </Section>
  );
}
