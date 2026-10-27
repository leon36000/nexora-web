import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { CodeSamples } from "@/components/gateway/code-samples";
import { activeCapabilities } from "@/components/gateway/model-card";
import { ResidencyBadge } from "@/components/gateway/residency-badge";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt, formatDate } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import {
  formatInteger,
  formatPriceCad,
  getGatewayDictionary,
} from "@/i18n/gateway";
import { apiSamples } from "@/lib/api-samples";
import { buildPageMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { type PriceOffer, productJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site";
import { getPublicCatalog } from "@/server/gateway/read";

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/;

/** Identifiants publiés connus au build ; les autres se rendent à la demande. Au moins une valeur est exigée. */
export async function generateStaticParams() {
  const catalog = await getPublicCatalog();
  const ids =
    catalog.models.length > 0
      ? catalog.models.map((m) => m.id)
      : ["nexora/exemple"];
  return ids.map((id) => ({ id: id.split("/") }));
}

async function findModel(segments: string[]) {
  const id = segments.map(decodeURIComponent).join("/");
  if (!MODEL_ID.test(id)) return null;
  const catalog = await getPublicCatalog();
  return catalog.models.find((m) => m.id === id) ?? null;
}

export async function generateMetadata(
  props: PageProps<"/[lang]/modeles/[...id]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const model = await findModel((await props.params).id);
  if (!model) notFound();
  const t = getGatewayDictionary(lang);
  return buildPageMetadata({
    lang,
    path: `/modeles/${model.id}`,
    title: `${model.name} | Nexora`,
    description: fmt(t.meta.model.description, { name: model.name }),
    siteName: "Nexora",
  });
}

/** Fiche d'un modèle : description, prix, hébergement et politique de données, exemples d'appel. */
export default async function ModelPage(
  props: PageProps<"/[lang]/modeles/[...id]">,
) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const model = await findModel((await props.params).id);
  if (!model) notFound();
  const t = getGatewayDictionary(lang);
  const d = t.detail;
  const c = t.catalog;
  const description = lang === "fr" ? model.descriptionFr : model.descriptionEn;
  const policy = lang === "fr" ? model.dataPolicyFr : model.dataPolicyEn;
  const caps = activeCapabilities(model);
  const baseUrl = `${SITE_URL}/v1`;
  const price = (label: string, value: string) => (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="mt-1 font-display text-h3 tabular-nums text-fg">
        {formatPriceCad(lang, value)}
      </dd>
      <dd className="text-small text-fg-muted">{c.unit}</dd>
    </div>
  );

  // Données structurées : exactement ce que la fiche affiche. Un prix de développement n'est pas une offre.
  const unit = (label: string, value: string): PriceOffer => ({
    name: label,
    price: value,
    currency: "CAD",
    unitText: c.unit,
  });
  const productInput = {
    name: model.name,
    description: description || null,
    url: `${SITE_URL}${localizePath(lang, `/modeles/${model.id}`)}`,
    sku: model.id,
    brand: null,
    offers: model.note
      ? []
      : [
          unit(c.input, model.inputPerMillion),
          ...(model.kind === "chat"
            ? [unit(c.output, model.outputPerMillion)]
            : []),
          ...(model.cachePerMillion
            ? [unit(c.cachedInput, model.cachePerMillion)]
            : []),
        ],
  };

  return (
    <Section tone="light" aria-labelledby="model-title">
      <nav aria-label={d.back}>
        <Link
          href={localizePath(lang, "/modeles")}
          className="inline-flex min-h-11 items-center rounded-xs text-small text-accent-text underline underline-offset-4"
        >
          {d.back}
        </Link>
      </nav>
      <header className="mt-4 max-w-3xl">
        <ResidencyBadge region={model.residency} t={t} />
        <h1 id="model-title" className="mt-4 text-h1 text-fg">
          {model.name}
        </h1>
        <p className="mt-2 font-mono text-body text-fg-muted">{model.id}</p>
        {description ? (
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">
            {description}
          </p>
        ) : null}
        {model.sunsetAt ? (
          <p className="mt-4 text-small text-accent-text">
            {fmt(d.sunset, {
              date: formatDate(lang, new Date(model.sunsetAt)),
            })}
          </p>
        ) : null}
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="pricing-title">
          <h2 id="pricing-title" className="text-h3 text-fg">
            {d.pricing}
          </h2>
          <p className="mt-3 max-w-xl text-body text-fg-muted">
            {d.pricingLead}
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-6">
            {price(c.input, model.inputPerMillion)}
            {model.kind === "chat"
              ? price(c.output, model.outputPerMillion)
              : null}
            {model.cachePerMillion
              ? price(c.cachedInput, model.cachePerMillion)
              : null}
          </dl>
          <p className="mt-4 text-small text-fg-muted">{c.priceNote}</p>
          {model.note ? (
            <p className="mt-3 font-mono text-label uppercase text-fg-muted">
              {c.devNote}
            </p>
          ) : null}
          <dl className="mt-8 grid grid-cols-2 gap-6 text-small">
            <div>
              <dt className="text-fg-muted">{d.context}</dt>
              <dd className="mt-1 text-body tabular-nums text-fg">
                {formatInteger(lang, model.contextMax)} {c.tokens}
              </dd>
            </div>
            {model.maxOutputTokens ? (
              <div>
                <dt className="text-fg-muted">{d.maxOutput}</dt>
                <dd className="mt-1 text-body tabular-nums text-fg">
                  {formatInteger(lang, model.maxOutputTokens)} {c.tokens}
                </dd>
              </div>
            ) : null}
          </dl>
          <h3 className="mt-8 text-h4 text-fg">{d.capabilities}</h3>
          {caps.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {caps.map((cap) => (
                <li
                  key={cap}
                  className="rounded-xs border border-line px-2 py-0.5 text-small text-fg-muted"
                >
                  {t.capabilities[cap]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-small text-fg-muted">{d.noCapabilities}</p>
          )}
        </section>

        <section aria-labelledby="hosting-title">
          <h2 id="hosting-title" className="text-h3 text-fg">
            {d.hosting}
          </h2>
          <dl className="mt-6 grid gap-5 text-small">
            <div>
              <dt className="text-fg-muted">{d.hostingProvider}</dt>
              <dd className="mt-1 text-body text-fg">{model.providerName}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">{d.hostingRegion}</dt>
              <dd className="mt-1 text-body text-fg">
                {t.residency[model.residency]}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">{d.dataPolicy}</dt>
              <dd className="mt-1 text-body text-fg">
                {policy || d.dataPolicyMissing}
              </dd>
            </div>
          </dl>
          <p className="mt-6 max-w-xl text-small text-fg-muted">
            {d.nexoraNote}
          </p>
        </section>
      </div>

      <section aria-labelledby="example-title" className="mt-16">
        <Badge tone="accent">{d.example}</Badge>
        <h2 id="example-title" className="mt-3 text-h3 text-fg">
          {d.example}
        </h2>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {fmt(d.exampleLead, { url: baseUrl })}
          {model.kind === "embedding" ? ` ${d.exampleEmbeddingLead}` : ""}
        </p>
        <div className="mt-6">
          <CodeSamples samples={apiSamples(baseUrl, model.id, model.kind)} />
        </div>
        <div className="mt-10 flex flex-wrap gap-4">
          <ButtonLink href={localizePath(lang, "/compte")} arrow>
            {d.createKey}
          </ButtonLink>
          <ButtonLink
            href={localizePath(lang, "/docs/api")}
            variant="secondary"
          >
            {d.docs}
          </ButtonLink>
        </div>
      </section>
      <JsonLd data={productJsonLd(productInput)} />
      <JsonLd
        data={appBreadcrumb(lang, [
          {
            name: t.meta.models.title.replace(/ \| Nexora$/, ""),
            path: "/modeles",
          },
          { name: model.name, path: `/modeles/${model.id}` },
        ])}
      />
    </Section>
  );
}
