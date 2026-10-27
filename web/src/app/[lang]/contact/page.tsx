import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { ContactForm } from "@/components/contact/contact-form";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { publishedPageHref } from "@/lib/chrome";
import { buildPageMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import { getAlternates } from "@/server/cms/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const dict = getDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/contact",
    title: dict.contact.meta.title,
    description: dict.contact.meta.description,
    siteName: dict.meta.siteName,
  });
}

/**
 * Contact et diagnostic (/contact, /en/contact) : formulaire court en deux étapes, validation côté serveur,
 * anti-abus ALTCHA auto-hébergé, demande enregistrée une fois en base (voir server/contact et le worker).
 */
export default async function ContactPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getDictionary(lang).contact;
  // La politique de confidentialité est une page de Directus : sans publication, pas de lien (jamais de 404).
  const privacyHref = publishedPageHref(
    await getAlternates(),
    lang,
    "/confidentialite",
  );
  return (
    <Section tone="light" aria-labelledby="contact-title">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
        <div>
          <Badge tone="accent">{t.label}</Badge>
          <h1 id="contact-title" className="mt-4 text-h1 text-fg">
            {t.title}
          </h1>
          <p className="mt-5 max-w-xl text-lead text-fg-muted">{t.lead}</p>
          <div className="mt-10 max-w-md">
            <h2 className="font-mono text-label uppercase text-fg-muted">
              {t.next.title}
            </h2>
            <ol className="mt-4 space-y-3 border-l border-line-strong pl-5">
              {t.next.items.map((item) => (
                <li key={item} className="text-fg">
                  {item}
                </li>
              ))}
            </ol>
            <p className="mt-5 text-small text-fg-muted">{t.next.note}</p>
          </div>
        </div>
        <div>
          <noscript>
            <p className="rounded-md border border-line-strong px-4 py-3 text-small text-fg">
              {t.noscript}
            </p>
          </noscript>
          <ContactForm
            lang={lang}
            t={t}
            privacyHref={privacyHref}
            homeHref={localizePath(lang, "/")}
          />
        </div>
      </div>
      <JsonLd
        data={appBreadcrumb(lang, [
          {
            name: t.meta.title.replace(` | ${SITE_NAME}`, ""),
            path: "/contact",
          },
        ])}
      />
    </Section>
  );
}
