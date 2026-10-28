import { MosaicBackdrop } from "@/components/brand/mosaic-backdrop";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Contenu momentanément illisible (Directus en panne, sans instantané) : message clair, jamais une page vide. */
export function Unavailable({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["cms"]["unavailable"];
}) {
  return (
    <Section
      tone="dark"
      className="min-h-[70dvh]"
      containerClassName="flex min-h-[70dvh] flex-col justify-center"
      background={
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 hidden md:block"
        >
          <MosaicBackdrop />
        </div>
      }
    >
      <Badge tone="accent">{t.label}</Badge>
      <h1 className="mt-4 max-w-2xl text-h1">{t.title}</h1>
      <p className="mt-5 max-w-xl text-lead text-fg-muted">{t.text}</p>
      <div className="mt-8">
        <ButtonLink href={localizePath(lang, "/")} arrow>
          {t.cta}
        </ButtonLink>
      </div>
    </Section>
  );
}
