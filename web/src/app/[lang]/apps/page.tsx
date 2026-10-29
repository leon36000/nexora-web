import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CARD_LINK, Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import {
  APP_STATES,
  APPS,
  getAppContent,
  getAppsDictionary,
  listMeta,
} from "@/i18n/apps";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPageMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import { AppCard } from "./_components/app-card";
import { InfraCard } from "./_components/infra-card";
import { StateBadge } from "./_components/state-badge";

/** Produits principaux rappelés au bas de la page (leurs textes viennent du menu : une seule source). */
const MAIN_PRODUCTS = new Set(["/vps", "/modeles", "/workstudio", "/opsys-ai"]);

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const m = listMeta(lang);
  return buildPageMetadata({
    lang,
    path: "/apps",
    title: m.title,
    description: m.description,
    siteName: SITE_NAME,
  });
}

/**
 * Nexora Apps : une seule page pour les outils qui entourent les produits principaux (agent de code, Gitspace, RAG,
 * WebPilot, Privacy Router, Creative, outils gratuits). Chaque outil affiche son état réel ; les fiches ne sont pas
 * dans la barre principale.
 */
export default async function AppsPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAppsDictionary(lang);
  const main = getDictionary(lang).nav.products.items.filter((i) =>
    MAIN_PRODUCTS.has(i.href),
  );
  return (
    <>
      <Section tone="light" aria-labelledby="apps-title">
        <header className="max-w-3xl">
          <Badge tone="accent">{t.list.label}</Badge>
          <h1 id="apps-title" className="mt-4 text-h1 text-fg">
            {t.list.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">
            {t.list.lead}
          </p>
        </header>
        <section aria-labelledby="legend-title" className="mt-12">
          <h2 id="legend-title" className="text-h4 text-fg">
            {t.list.legendTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-small text-fg-muted">
            {t.list.legendLead}
          </p>
          <dl className="mt-5 grid gap-5 sm:grid-cols-3">
            {APP_STATES.map((state) => (
              <div key={state}>
                <dt>
                  <StateBadge state={state} t={t} />
                </dt>
                <dd className="mt-1 text-small text-fg-muted">
                  {t.states[state].description}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </Section>

      <Section tone="light" surface aria-labelledby="grid-title">
        <h2 id="grid-title" className="text-h2 text-fg">
          {t.list.gridTitle}
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {APPS.map((app) => {
            const content = getAppContent(lang, app.slug);
            return content ? (
              <li key={app.slug}>
                <AppCard app={app} content={content} lang={lang} t={t} />
              </li>
            ) : null;
          })}
        </ul>
      </Section>

      <Section tone="dark" aria-labelledby="infra-title">
        <InfraCard lang={lang} t={t} />
      </Section>

      <Section tone="light" aria-labelledby="main-title">
        <h2 id="main-title" className="text-h3 text-fg">
          {t.list.mainTitle}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {t.list.mainLead}
        </p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {main.map((product) => (
            <li key={product.href}>
              <Card interactive as="article" className="h-full">
                <h3 className="font-display text-h4 text-fg">
                  <Link
                    href={localizePath(lang, product.href)}
                    prefetch={false}
                    className={CARD_LINK}
                  >
                    {product.label}
                  </Link>
                </h3>
                <p className="mt-3 text-small text-fg-muted">
                  {product.description}
                </p>
              </Card>
            </li>
          ))}
        </ul>
        <div className="mt-12 max-w-2xl border-t border-line pt-8">
          <h2 className="text-h4 text-fg">{t.list.closing.title}</h2>
          <p className="mt-2 text-body text-fg-muted">{t.list.closing.text}</p>
          <div className="mt-5">
            <ButtonLink
              href={localizePath(lang, "/contact")}
              variant="secondary"
            >
              {t.list.closing.button}
            </ButtonLink>
          </div>
        </div>
      </Section>
      <JsonLd
        data={appBreadcrumb(lang, [{ name: t.list.label, path: "/apps" }])}
      />
    </>
  );
}
