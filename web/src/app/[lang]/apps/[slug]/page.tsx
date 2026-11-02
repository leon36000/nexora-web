import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { JsonLd } from "@/components/seo/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { CARD_LINK, Card } from "@/components/ui/card";
import { PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { StatStrip } from "@/components/ui/stat-strip";
import {
  APPS,
  appContactHref,
  appMeta,
  appPath,
  findApp,
  getAppContent,
  getAppsDictionary,
} from "@/i18n/apps";
import { isLang, localizePath } from "@/i18n/config";
import { buildPageMetadata, notFoundMetadata } from "@/lib/metadata";
import {
  appBreadcrumb,
  appFaqJsonLd,
  appSoftwareJsonLd,
} from "@/lib/seo/app-jsonld";
import { SITE_NAME } from "@/lib/site";
import { getCreativeFilm } from "../_components/creative-film";
import { CreativeShowcase } from "../_components/creative-showcase";
import { APP_PALETTE, appSeed } from "../_components/palette";
import { StateBadge } from "../_components/state-badge";

/** Les outils du registre se préparent au build ; tout autre identifiant répond 404. */
export function generateStaticParams() {
  return APPS.map((app) => ({ slug: app.slug }));
}

export async function generateMetadata(
  props: PageProps<"/[lang]/apps/[slug]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const slug = (await props.params).slug;
  const meta = appMeta(lang, slug);
  if (!meta) return notFoundMetadata(lang);
  return buildPageMetadata({
    lang,
    path: appPath(slug),
    title: meta.title,
    description: meta.description,
    siteName: SITE_NAME,
  });
}

/**
 * Fiche d'un outil de Nexora Apps : accroche, pour qui, comment on y accède, ce qui est prêt et ce qui vient (état
 * honnête), questions fréquentes, puis la liste d'attente ou le contact. Aucun prix, aucune date, aucune performance.
 */
export default async function AppPage(props: PageProps<"/[lang]/apps/[slug]">) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const slug = (await props.params).slug;
  const app = findApp(slug);
  const content = getAppContent(lang, slug);
  if (!app || !content) notFound();
  const film = app.slug === "creative" ? await getCreativeFilm(lang) : null;
  const t = getAppsDictionary(lang);
  const d = t.detail;
  const cta = app.cta === "waitlist" ? d.waitlist : d.contact;
  const related = app.related.flatMap((r) => {
    const rApp = findApp(r);
    const rContent = getAppContent(lang, r);
    return rApp && rContent ? [{ app: rApp, content: rContent }] : [];
  });
  return (
    <>
      <PageHero
        titleId="app-title"
        palette={APP_PALETTE[app.slug] ?? "braise"}
        seed={appSeed(app.slug)}
        breadcrumb={
          <nav aria-label={d.back}>
            <Link
              href={localizePath(lang, "/apps")}
              prefetch={false}
              className="inline-flex min-h-11 items-center rounded-xs text-small text-accent-text underline underline-offset-4 transition-colors duration-150 hover:text-fg"
            >
              {d.back}
            </Link>
          </nav>
        }
        meta={<StateBadge state={app.state} t={t} />}
        title={content.name}
        lead={content.hook}
        aside={
          <StatStrip
            items={[
              {
                label: d.stateLabel,
                value: t.states[app.state].label,
                hint: t.states[app.state].description,
              },
              { label: d.accessTitle, value: content.accessLabel },
            ]}
          />
        }
      />

      <Section tone="light">
        <section aria-labelledby="answer-title" className="max-w-3xl">
          <h2 id="answer-title" className="text-h4 text-fg">
            {d.answerTitle}
          </h2>
          <p className="mt-2 text-body text-fg-muted">{content.answer}</p>
        </section>
        <dl className="mt-12 grid gap-10 md:grid-cols-2">
          <div>
            <dt className="text-h4 text-fg">{d.audienceTitle}</dt>
            <dd className="mt-2 max-w-xl text-body text-fg-muted">
              {content.audience}
            </dd>
          </div>
          <div>
            <dt className="text-h4 text-fg">{d.accessTitle}</dt>
            <dd className="mt-2 max-w-xl text-body text-fg-muted">
              <span className="block font-mono text-label uppercase text-fg">
                {content.accessLabel}
              </span>
              <span className="mt-2 block">{content.accessText}</span>
            </dd>
          </div>
        </dl>
      </Section>

      {app.slug === "creative" ? (
        <CreativeShowcase lang={lang} film={film} />
      ) : null}

      <Section tone="light" surface>
        <div className="grid gap-10 md:grid-cols-2">
          <section aria-labelledby="ready-title">
            <h2 id="ready-title" className="text-h3 text-fg">
              {d.readyTitle}
            </h2>
            {content.ready.length > 0 ? (
              <ul className="mt-4 grid max-w-xl list-disc gap-3 pl-5 text-body text-fg-muted">
                {content.ready.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 max-w-xl text-body text-fg-muted">
                {d.nothingReady}
              </p>
            )}
          </section>
          <section aria-labelledby="coming-title">
            <h2 id="coming-title" className="text-h3 text-fg">
              {d.comingTitle}
            </h2>
            <ul className="mt-4 grid max-w-xl list-disc gap-3 pl-5 text-body text-fg-muted">
              {content.coming.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-4 max-w-xl text-small text-fg-muted">
              {d.comingNote}
            </p>
          </section>
        </div>
      </Section>

      <Section tone="light" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-h2 text-fg">
          {d.faqTitle}
        </h2>
        <dl className="mt-8 grid max-w-3xl gap-8">
          {content.faq.map((q) => (
            <div key={q.question}>
              <dt className="text-h4 text-fg">{q.question}</dt>
              <dd className="mt-2 text-body text-fg-muted">{q.answer}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section tone="dark" aria-labelledby="cta-title">
        <h2 id="cta-title" className="text-h2 text-fg">
          {cta.title}
        </h2>
        <p className="mt-4 max-w-2xl text-lead text-fg-muted">{cta.text}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <ButtonLink href={appContactHref(lang, app.slug)} arrow>
            {cta.button}
          </ButtonLink>
          <ButtonLink href={localizePath(lang, "/apps")} variant="secondary">
            {d.back}
          </ButtonLink>
        </div>
      </Section>

      {related.length > 0 ? (
        <Section tone="light" surface aria-labelledby="related-title">
          <h2 id="related-title" className="text-h3 text-fg">
            {d.relatedTitle}
          </h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.app.slug}>
                <Card interactive as="article" className="h-full">
                  <StateBadge state={r.app.state} t={t} />
                  <h3 className="mt-4 font-display text-h4 text-fg">
                    <Link
                      href={localizePath(lang, appPath(r.app.slug))}
                      prefetch={false}
                      className={CARD_LINK}
                    >
                      {r.content.name}
                    </Link>
                  </h3>
                  <p className="mt-3 text-small text-fg-muted">
                    {r.content.hook}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <JsonLd data={appSoftwareJsonLd(lang, app.slug)} />
      <JsonLd data={appFaqJsonLd(lang, app.slug)} />
      <JsonLd
        data={appBreadcrumb(lang, [
          { name: t.list.label, path: "/apps" },
          { name: content.name, path: appPath(app.slug) },
        ])}
      />
    </>
  );
}
