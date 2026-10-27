import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { CodeBlock, CodeSamples } from "@/components/gateway/code-samples";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fmt } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { getGatewayDictionary } from "@/i18n/gateway";
import { apiSamples, streamingSample } from "@/lib/api-samples";
import { buildPageMetadata } from "@/lib/metadata";
import { appBreadcrumb } from "@/lib/seo/app-jsonld";
import { SITE_URL } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getGatewayDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/docs/api",
    title: t.meta.docs.title,
    description: t.meta.docs.description,
    siteName: "Nexora",
  });
}

/** Documentation de démarrage rapide de l'API (compatible OpenAI). Statique : aucune donnée de base. */
export default async function ApiDocsPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getGatewayDictionary(lang);
  const d = t.docs;
  const baseUrl = `${SITE_URL}/v1`;
  const example = "nexora/nom-du-modele";
  const h2 = "text-h3 text-fg";
  const p = "mt-3 max-w-2xl text-body text-fg-muted";

  return (
    <Section tone="light" aria-labelledby="docs-title">
      <header className="max-w-3xl">
        <Badge tone="accent">{d.label}</Badge>
        <h1 id="docs-title" className="mt-4 text-h1 text-fg">
          {d.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lead text-fg-muted">{d.lead}</p>
      </header>

      <div className="mt-12 grid max-w-4xl gap-14">
        <section aria-labelledby="docs-base">
          <h2 id="docs-base" className={h2}>
            {d.baseUrlTitle}
          </h2>
          <p className={p}>{fmt(d.baseUrlText, { url: baseUrl })}</p>
          <CodeBlock label={`${d.baseUrlTitle} (${d.code})`} code={baseUrl} />
        </section>

        <section aria-labelledby="docs-steps">
          <h2 id="docs-steps" className={h2}>
            {d.steps.title}
          </h2>
          <ol className="mt-4 grid max-w-2xl list-decimal gap-3 pl-6 text-body text-fg-muted marker:text-fg">
            {d.steps.items.map((item) => (
              <li key={item}>{fmt(item, { model: example })}</li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="docs-first">
          <h2 id="docs-first" className={h2}>
            {d.firstCall}
          </h2>
          <div className="mt-6">
            <CodeSamples samples={apiSamples(baseUrl, example)} />
          </div>
        </section>

        <section aria-labelledby="docs-stream">
          <h2 id="docs-stream" className={h2}>
            {d.streaming}
          </h2>
          <p className={p}>{d.streamingText}</p>
          <CodeBlock
            label={`${d.streaming} (${d.code})`}
            code={streamingSample(example)}
          />
        </section>

        <section aria-labelledby="docs-models">
          <h2 id="docs-models" className={h2}>
            {d.models}
          </h2>
          <p className={p}>{d.modelsText}</p>
          <CodeBlock
            label={`${d.models} (${d.code})`}
            code={`curl ${baseUrl}/models`}
          />
        </section>

        <section aria-labelledby="docs-embeddings">
          <h2 id="docs-embeddings" className={h2}>
            {d.embeddings}
          </h2>
          <p className={p}>{d.embeddingsText}</p>
        </section>

        <section aria-labelledby="docs-billing">
          <h2 id="docs-billing" className={h2}>
            {d.billing.title}
          </h2>
          <ul className="mt-4 grid max-w-2xl list-disc gap-3 pl-6 text-body text-fg-muted">
            {d.billing.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="docs-errors">
          <h2 id="docs-errors" className={h2}>
            {d.errors.title}
          </h2>
          <p className={p}>{d.errors.lead}</p>
          <section
            aria-label={`${d.errors.title} (${d.errors.tableLabel})`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className="mt-6 overflow-x-auto rounded-md border border-line"
          >
            <table className="w-full min-w-[34rem] border-collapse text-left text-small">
              <caption className="sr-only">{d.errors.title}</caption>
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    {d.errors.columns.status}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {d.errors.columns.code}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {d.errors.columns.meaning}
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.errors.rows.map(([status, code, meaning]) => (
                  <tr key={code} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                      {status}
                    </td>
                    <td className="px-4 py-3 font-mono text-fg">
                      {code.split(" · ").map((c) => (
                        <div key={c} className="break-words">
                          {c}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </section>

        <section aria-labelledby="docs-privacy">
          <h2 id="docs-privacy" className={h2}>
            {d.privacy.title}
          </h2>
          <p className={p}>{d.privacy.text}</p>
        </section>

        <section aria-labelledby="docs-compat">
          <h2 id="docs-compat" className={h2}>
            {d.compat.title}
          </h2>
          <p className={p}>{d.compat.text}</p>
        </section>

        <div>
          <ButtonLink href={localizePath(lang, "/modeles")} arrow>
            {d.cta}
          </ButtonLink>
        </div>
      </div>
      <JsonLd
        data={appBreadcrumb(lang, [
          {
            name: t.meta.docs.title.replace(/ \| Nexora$/, ""),
            path: "/docs/api",
          },
        ])}
      />
    </Section>
  );
}
