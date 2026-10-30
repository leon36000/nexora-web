"use client";

import { ErrorScreen } from "@/components/brand/error-screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { type Lang, localizePath } from "@/i18n/config";
import { ERROR_PAGE } from "@/i18n/error-page";

/** L'écran d'erreur complet (mosaïque, chiffres en carrés, boutons) : chargé seulement quand une erreur survient. */
export default function ErrorView({
  lang,
  retry,
}: {
  lang: Lang;
  retry: () => void;
}) {
  const t = ERROR_PAGE[lang];
  return (
    <ErrorScreen code="500" label={t.label} title={t.title} text={t.text}>
      <Button size="lg" onClick={() => retry()}>
        {t.retry}
      </Button>
      <ButtonLink href={localizePath(lang, "/")} variant="secondary" size="lg">
        {t.home}
      </ButtonLink>
      <ButtonLink
        href={localizePath(lang, "/contact")}
        variant="link"
        size="lg"
      >
        {t.contact}
      </ButtonLink>
    </ErrorScreen>
  );
}
