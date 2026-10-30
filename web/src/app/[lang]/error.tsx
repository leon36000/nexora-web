"use client";

import { useParams } from "next/navigation";
import { ErrorScreen } from "@/components/brand/error-screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { isLang, localizePath } from "@/i18n/config";
import { ERROR_PAGE } from "@/i18n/error-page";

/**
 * Erreur d'exécution d'une page (500) : le même écran que la page 404, avec « Réessayer ». L'en-tête et le pied de
 * page restent en place (l'erreur est interceptée sous la mise en page). Aucun détail technique n'est affiché.
 */
export default function ErrorPage({ retry }: { retry: () => void }) {
  const raw = useParams<{ lang?: string }>().lang;
  const lang = raw && isLang(raw) ? raw : "fr";
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
