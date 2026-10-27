import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { AgentPricing } from "@/components/agents/agent-pricing";
import { CodeBlock, CodeSamples } from "@/components/gateway/code-samples";
import { ResidencyBadge } from "@/components/gateway/residency-badge";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt } from "@/i18n/account";
import { getAgentsDictionary } from "@/i18n/agents";
import { isLang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import { agentSamples, agentStreamingSample } from "@/lib/agent-samples";
import { buildPageMetadata, notFoundMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { getPublicAgents } from "@/server/agents/read";

const SLUG = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

/** Agents publiés connus au build ; les autres se rendent à la demande. Au moins une valeur est exigée. */
export async function generateStaticParams() {
  const { agents } = await getPublicAgents();
  return (agents.length > 0 ? agents.map((a) => a.slug) : ["exemple"]).map(
    (slug) => ({ slug }),
  );
}

async function findAgent(slug: string) {
  if (!SLUG.test(slug)) return null;
  const { agents } = await getPublicAgents();
  return agents.find((a) => a.slug === slug) ?? null;
}

export async function generateMetadata(
  props: PageProps<"/[lang]/agents/[slug]">,
): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const agent = await findAgent((await props.params).slug);
  if (!agent) return notFoundMetadata(lang);
  const t = getAgentsDictionary(lang);
  const name = lang === "fr" ? agent.nameFr : agent.nameEn;
  return buildPageMetadata({
    lang,
    path: `/agents/${agent.slug}`,
    title: `${name} | ${SITE_NAME}`,
    description: fmt(t.meta.agent.description, { name }),
    siteName: SITE_NAME,
  });
}

/** Fiche d'un agent hébergé : description, prix, limites, hébergement de l'instance, exemples d'appel. */
export default async function AgentPage(
  props: PageProps<"/[lang]/agents/[slug]">,
) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const agent = await findAgent((await props.params).slug);
  if (!agent) notFound();
  const t = getAgentsDictionary(lang);
  const d = t.detail;
  const name = lang === "fr" ? agent.nameFr : agent.nameEn;
  const description = lang === "fr" ? agent.descriptionFr : agent.descriptionEn;
  const baseUrl = `${SITE_URL}/v1`;
  return (
    <>
      <Section tone="light" aria-labelledby="agent-title">
        <nav aria-label={d.back}>
          <Link
            href={localizePath(lang, "/agents")}
            className="inline-flex min-h-11 items-center rounded-xs text-small text-accent-text underline underline-offset-4"
          >
            {d.back}
          </Link>
        </nav>
        <header className="mt-4 max-w-3xl">
          <ResidencyBadge region={agent.region} t={t} />
          <h1 id="agent-title" className="mt-4 text-h1 text-fg">
            {name}
          </h1>
          <p className="mt-2 font-mono text-body text-fg-muted">{agent.id}</p>
          <p className="mt-2 text-small text-fg-muted">
            {d.category} : {t.categories[agent.category]}
          </p>
          {description ? (
            <p className="mt-5 max-w-2xl text-lead text-fg-muted">
              {description}
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
            <div className="mt-6">
              <AgentPricing agent={agent} lang={lang} t={t} large />
            </div>
            <p className="mt-4 text-small text-fg-muted">
              {t.catalog.priceNote}
            </p>
            {agent.trial ? (
              <>
                <p className="mt-3 font-mono text-label uppercase text-fg-muted">
                  {t.catalog.trialBadge}
                </p>
                <p className="mt-1 text-small text-accent-text">
                  {d.trialLead}
                </p>
              </>
            ) : null}
          </section>

          <section aria-labelledby="limits-title">
            <h2 id="limits-title" className="text-h3 text-fg">
              {d.limits}
            </h2>
            <ul className="mt-4 grid max-w-xl list-disc gap-3 pl-5 text-body text-fg-muted">
              <li>
                {fmt(d.runCap, {
                  tokens: formatInteger(lang, agent.runTokenCap),
                })}
              </li>
              <li>{d.textOnly}</li>
              <li>{d.systemIgnored}</li>
              <li>{d.noTuning}</li>
            </ul>
          </section>
        </div>
      </Section>
      <Section tone="dark" aria-labelledby="example-title">
        <section>
          <Badge tone="accent">{d.example}</Badge>
          <h2 id="example-title" className="mt-3 text-h3 text-fg">
            {d.example}
          </h2>
          <p className="mt-3 max-w-2xl text-body text-fg-muted">
            {fmt(d.exampleLead, { url: baseUrl })}
          </p>
          <div className="mt-6">
            <CodeSamples samples={agentSamples(baseUrl, agent.id, lang)} />
          </div>
          <h3 className="mt-10 text-h4 text-fg">{d.streamTitle}</h3>
          <p className="mt-2 max-w-2xl text-body text-fg-muted">
            {d.streamLead}
          </p>
          <CodeBlock
            label={d.streamTitle}
            code={agentStreamingSample(agent.id, lang)}
          />
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
        <JsonLd
          data={appBreadcrumb(lang, [
            {
              name: t.meta.list.title.replace(` | ${SITE_NAME}`, ""),
              path: "/agents",
            },
            { name, path: `/agents/${agent.slug}` },
          ])}
        />
      </Section>
    </>
  );
}
