import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Breadcrumb, PageHero } from "@/components/ui/page-hero";
import { Section } from "@/components/ui/section";
import { StatStrip } from "@/components/ui/stat-strip";
import { fmt, formatDate } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger, formatPriceCad } from "@/i18n/gateway";
import { getModelsDictionary } from "@/i18n/models";
import { apiSamples } from "@/lib/api-samples";
import { compareHref } from "@/lib/models/query";
import { similarModels } from "@/lib/models/similar";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { type PriceOffer, productJsonLd } from "@/lib/seo/jsonld";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { PublicModel } from "@/server/gateway/public";
import { BenchmarkList } from "./benchmark-list";
import { activeCapabilities } from "./capabilities";
import { CodeSamples } from "./code-samples";
import { LicenseBadge, PreviewBadge, TagChips } from "./model-badges";
import { ModelPricing } from "./model-pricing";
import { ModelSpecs } from "./model-specs";
import { SimilarModels } from "./similar-models";

const LINK = "rounded-xs text-accent-text underline underline-offset-4";
const SECTION = "scroll-mt-24 border-t border-line pt-10";

/** Description de la page pour les moteurs : uniquement des faits de la fiche, sans promesse. */
export function modelMetaDescription(model: PublicModel, lang: Lang): string {
  const t = getModelsDictionary(lang).meta.model;
  const author = model.sheet.author;
  const values = {
    name: model.name,
    by: author ? fmt(t.by, { author }) : "",
    context: formatInteger(lang, model.contextMax),
    input: formatPriceCad(lang, model.inputPerMillion),
    output: formatPriceCad(lang, model.outputPerMillion),
  };
  return fmt(model.kind === "chat" ? t.full : t.embedding, values);
}

export function ModelDetail({
  model,
  catalog,
  lang,
}: {
  model: PublicModel;
  catalog: readonly PublicModel[];
  lang: Lang;
}) {
  const t = getModelsDictionary(lang);
  const d = t.detail;
  const sheet = model.sheet;
  const preview = model.availability === "preview";
  const description = lang === "fr" ? model.descriptionFr : model.descriptionEn;
  const notes = lang === "fr" ? sheet.notesFr : sheet.notesEn;
  const similar = similarModels(model, catalog);
  const baseUrl = `${SITE_URL}/v1`;
  const listPath = localizePath(lang, "/modeles");
  const pageUrl = `${SITE_URL}${localizePath(lang, `/modeles/${model.id}`)}`;
  const benchmarks = sheet.benchmarks ?? [];
  const sources = sheet.sources ?? [];

  const sections = [
    { id: "apercu", label: d.sections.overview },
    { id: "tarifs", label: d.sections.pricing },
    { id: "benchmarks", label: d.sections.benchmarks },
    ...(similar.length > 0
      ? [{ id: "similaires", label: d.sections.similar }]
      : []),
    { id: "api", label: d.sections.api },
  ];

  // Données structurées : exactement ce que la page affiche. Pas d'offre pour un modèle en aperçu (rien à acheter
  // encore) ni pour un prix de développement.
  const offer = (name: string, price: string): PriceOffer => ({
    name,
    price,
    currency: "CAD",
    unitText: d.perMillion,
  });
  const offers =
    preview || model.note
      ? []
      : [
          offer(d.pricing.input, model.inputPerMillion),
          ...(model.kind === "chat"
            ? [offer(d.pricing.output, model.outputPerMillion)]
            : []),
          ...(model.cachePerMillion
            ? [offer(d.pricing.cachedInput, model.cachePerMillion)]
            : []),
        ];
  const listName = t.meta.list.title.replace(` | ${SITE_NAME}`, "");

  const notifyHref = `${localizePath(lang, "/contact")}?sujet=modele-apercu&modele=${encodeURIComponent(model.id)}`;

  return (
    <>
      <PageHero
        titleId="model-title"
        palette="ciel"
        seed={[...model.id].reduce(
          (acc, c) => (acc * 31 + c.charCodeAt(0)) % 997,
          3,
        )}
        breadcrumb={
          <Breadcrumb
            label={d.breadcrumb}
            items={[
              { label: d.home, href: localizePath(lang, "/") },
              { label: d.models, href: listPath },
              { label: model.name },
            ]}
          />
        }
        meta={
          <>
            {preview ? <PreviewBadge t={t} /> : null}
            <LicenseBadge model={model} t={t} />
            {sheet.author ? (
              <span className="text-small text-fg-muted">
                {fmt(d.by, { author: sheet.author })}
                {sheet.family
                  ? ` · ${fmt(d.family, { family: sheet.family })}`
                  : ""}
              </span>
            ) : null}
          </>
        }
        title={model.name}
        aside={
          <StatStrip
            items={[
              {
                label: d.specs.context,
                value: formatInteger(lang, model.contextMax),
                hint: d.specs.tokens,
              },
              {
                label: d.pricing.input,
                value: formatPriceCad(lang, model.inputPerMillion),
                hint: d.perMillion,
              },
              ...(model.kind === "chat"
                ? [
                    {
                      label: d.pricing.output,
                      value: formatPriceCad(lang, model.outputPerMillion),
                      hint: d.perMillion,
                    },
                  ]
                : []),
            ]}
          />
        }
      >
        <p className="mt-3 break-all font-mono text-body text-fg-muted">
          {model.id}
        </p>
        {sheet.tags?.length ? (
          <TagChips tags={sheet.tags} t={t} className="mt-5" />
        ) : null}
        {preview ? (
          <p className="mt-6 max-w-2xl rounded-card border border-line-strong bg-surface p-4 text-small text-fg">
            {d.previewBanner}
          </p>
        ) : null}
        {model.sunsetAt ? (
          <p className="mt-4 text-small text-accent-text">
            {fmt(d.sunset, {
              date: formatDate(lang, new Date(model.sunsetAt)),
            })}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink
            href={compareHref(listPath, [model.id])}
            variant="secondary"
          >
            {d.compareLink}
          </ButtonLink>
          {sheet.homepageUrl ? (
            <ButtonLink
              href={sheet.homepageUrl}
              variant="link"
              rel="noopener noreferrer"
            >
              {d.homepage}
            </ButtonLink>
          ) : null}
        </div>
      </PageHero>

      <Section tone="light" joined="after" className="pt-8 md:pt-12">
        <nav
          aria-label={d.sectionsLabel}
          className="mt-10 border-y border-line py-1"
        >
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xs px-3 text-small text-fg hover:bg-fg/10"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-10 grid max-w-4xl gap-12">
          <section
            id="apercu"
            aria-labelledby="apercu-title"
            className="scroll-mt-24"
          >
            <h2 id="apercu-title" className="text-h3 text-fg">
              {d.overview.title}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-fg-muted">
              {description || d.overview.noDescription}
            </p>
            <h3 className="mt-8 text-h4 text-fg">{d.overview.specs}</h3>
            <div className="mt-4">
              <ModelSpecs model={model} lang={lang} t={t} />
            </div>
            <h3 className="mt-8 text-h4 text-fg">{d.overview.capabilities}</h3>
            <Capabilities model={model} t={t} />
            <p className="mt-6 max-w-2xl text-small text-fg-muted">
              {d.nexoraNote}
            </p>
          </section>

          <section
            id="tarifs"
            aria-labelledby="tarifs-title"
            className={SECTION}
          >
            <h2 id="tarifs-title" className="text-h3 text-fg">
              {d.pricing.title}
            </h2>
            <ModelPricing model={model} lang={lang} t={t} />
          </section>

          <section
            id="benchmarks"
            aria-labelledby="benchmarks-title"
            className={SECTION}
          >
            <h2 id="benchmarks-title" className="text-h3 text-fg">
              {d.benchmarks.title}
            </h2>
            <p className="mt-3 max-w-2xl text-body text-fg-muted">
              {d.benchmarks.lead}
            </p>
            <BenchmarkList benchmarks={benchmarks} lang={lang} t={t} />
            {notes ? (
              <p className="mt-6 max-w-2xl text-small text-fg-muted">{notes}</p>
            ) : null}
            {sources.length > 0 ? (
              <div className="mt-8">
                <h3 className="text-h4 text-fg">{d.benchmarks.sources}</h3>
                <ul className="mt-2 grid gap-1 text-small">
                  {sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        rel="noopener noreferrer"
                        className={LINK}
                      >
                        {s.label}
                      </a>{" "}
                      <span className="text-fg-muted">
                        ({fmt(d.benchmarks.readOn, { date: s.readAt })})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-6">
              <Link
                href={localizePath(lang, "/modeles/benchmarks")}
                className={`${LINK} inline-flex min-h-11 items-center text-small`}
              >
                {d.benchmarks.rankings}
              </Link>
            </p>
          </section>

          {similar.length > 0 ? (
            <section
              id="similaires"
              aria-labelledby="similaires-title"
              className={SECTION}
            >
              <h2 id="similaires-title" className="text-h3 text-fg">
                {d.similar.title}
              </h2>
              <p className="mt-3 max-w-2xl text-body text-fg-muted">
                {d.similar.lead}
              </p>
              <SimilarModels models={similar} lang={lang} t={t} />
            </section>
          ) : null}

          <section id="api" aria-labelledby="api-title" className={SECTION}>
            {preview ? (
              <>
                <Badge tone="accent">{d.api.previewTitle}</Badge>
                <h2 id="api-title" className="mt-3 text-h3 text-fg">
                  {d.api.title}
                </h2>
                <p className="mt-3 max-w-2xl text-body text-fg-muted">
                  {d.api.previewText}
                </p>
                <p className="mt-4 text-small text-fg-muted">{d.api.idLabel}</p>
                <p className="mt-1 break-all font-mono text-body text-fg">
                  {model.id}
                </p>
                <p className="mt-6 max-w-2xl text-body text-fg-muted">
                  {d.api.previewExample}
                </p>
                <div className="mt-4">
                  <CodeSamples
                    samples={apiSamples(baseUrl, model.id, model.kind, lang)}
                    copy={{
                      copy: d.api.copy,
                      copied: d.api.copied,
                      aria: d.api.copyAria,
                    }}
                  />
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <ButtonLink href={notifyHref} arrow>
                    {d.api.notify}
                  </ButtonLink>
                  {catalog.some((m) => m.availability !== "preview") ? (
                    <ButtonLink
                      href={`${listPath}?disponibilite=disponible`}
                      variant="secondary"
                    >
                      {d.api.seeLive}
                    </ButtonLink>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <h2 id="api-title" className="text-h3 text-fg">
                  {d.api.title}
                </h2>
                <p className="mt-3 max-w-2xl text-body text-fg-muted">
                  {fmt(d.api.lead, { url: baseUrl })}
                  {model.kind === "embedding" ? ` ${d.api.embeddingLead}` : ""}
                  {model.kind === "rerank" ? ` ${d.api.rerankLead}` : ""}
                </p>
                <div className="mt-6">
                  <CodeSamples
                    samples={apiSamples(baseUrl, model.id, model.kind, lang)}
                    copy={{
                      copy: d.api.copy,
                      copied: d.api.copied,
                      aria: d.api.copyAria,
                    }}
                  />
                </div>
                <div className="mt-6">
                  <ButtonLink
                    href={localizePath(lang, "/docs/api")}
                    variant="secondary"
                  >
                    {d.api.docs}
                  </ButtonLink>
                </div>
              </>
            )}
          </section>

          <section
            aria-labelledby="cta-title"
            className="rounded-card border border-line bg-surface p-6 sm:p-8"
          >
            <h2 id="cta-title" className="text-h3 text-fg">
              {d.cta.title}
            </h2>
            <p className="mt-3 max-w-2xl text-body text-fg-muted">
              {d.cta.text}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink
                href={localizePath(lang, "/compte/inscription")}
                arrow
              >
                {d.cta.signup}
              </ButtonLink>
              <ButtonLink
                href={localizePath(lang, "/compte/facturation")}
                variant="secondary"
              >
                {d.cta.wallet}
              </ButtonLink>
            </div>
          </section>
        </div>

        <JsonLd
          data={productJsonLd({
            name: model.name,
            description: description || null,
            url: pageUrl,
            sku: model.id,
            brand: sheet.author ?? null,
            offers,
          })}
        />
        <JsonLd
          data={appBreadcrumb(lang, [
            { name: listName, path: "/modeles" },
            { name: model.name, path: `/modeles/${model.id}` },
          ])}
        />
      </Section>
    </>
  );
}

function Capabilities({
  model,
  t,
}: {
  model: PublicModel;
  t: ReturnType<typeof getModelsDictionary>;
}) {
  const caps = activeCapabilities(model);
  if (caps.length === 0)
    return (
      <p className="mt-3 text-small text-fg-muted">
        {t.detail.overview.noCapabilities}
      </p>
    );
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {caps.map((c) => (
        <li
          key={c}
          className="rounded-xs border border-line px-2 py-0.5 text-small text-fg-muted"
        >
          {t.capabilities[c]}
        </li>
      ))}
    </ul>
  );
}
