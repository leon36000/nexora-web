import { ErrorScreen } from "@/components/brand/error-screen";
import { ButtonLink } from "@/components/ui/button";
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
    <ErrorScreen code="503" label={t.label} title={t.title} text={t.text}>
      <ButtonLink href={localizePath(lang, "/")} size="lg" arrow>
        {t.cta}
      </ButtonLink>
    </ErrorScreen>
  );
}
