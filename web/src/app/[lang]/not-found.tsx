import { lang as getLang } from "next/root-params";
import { PerimeterGrid } from "@/components/brand/perimeter-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function NotFound() {
  const lang = await getLang();
  const safe = isLang(lang) ? lang : "fr";
  const { notFound } = getDictionary(safe);
  return (
    <Section
      tone="dark"
      className="min-h-[70dvh]"
      containerClassName="flex min-h-[70dvh] flex-col justify-center"
      background={
        <div aria-hidden="true" className="absolute inset-0 -z-10 opacity-60">
          <PerimeterGrid />
        </div>
      }
    >
      <Badge tone="accent">{notFound.label}</Badge>
      <h1 className="mt-4 max-w-2xl text-h1">{notFound.title}</h1>
      <p className="mt-5 max-w-xl text-lead text-fg-muted">{notFound.text}</p>
      <div className="mt-8">
        <ButtonLink href={localizePath(safe, "/")} arrow>
          {notFound.cta}
        </ButtonLink>
      </div>
    </Section>
  );
}
