import { lang as getLang } from "next/root-params";
import { ErrorScreen } from "@/components/brand/error-screen";
import { ButtonLink } from "@/components/ui/button";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function NotFound() {
  const lang = await getLang();
  const safe = isLang(lang) ? lang : "fr";
  const { notFound } = getDictionary(safe);
  return (
    <ErrorScreen
      code="404"
      label={notFound.label}
      title={notFound.title}
      text={notFound.text}
    >
      <ButtonLink href={localizePath(safe, "/")} size="lg" arrow>
        {notFound.cta}
      </ButtonLink>
    </ErrorScreen>
  );
}
