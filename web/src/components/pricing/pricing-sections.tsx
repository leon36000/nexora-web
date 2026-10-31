import { formatTokensCompact } from "@/components/account/panel-format";
import { answerParagraphs } from "@/components/blocks/faq-block";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { fmt, formatCad } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { PricingDictionary } from "@/i18n/pricing";
import type { CreditEquivalent } from "@/lib/credit-equivalence";
import type { PricingOffer } from "@/lib/pricing";
import type { CreditPack } from "@/server/billing/credit-packs";

/** Nombre de crédits pour lequel on illustre l'équivalence en jetons (une unité ronde, sans lien avec un palier). */
export const EQUIVALENT_CREDITS = 1000;

/** Adresse du formulaire de contact pour la liste d'ouverture de la plateforme. */
export const notifyHref = (lang: Lang) =>
  `${localizePath(lang, "/contact")}?sujet=ouverture-plateforme`;

const number = (lang: Lang, n: number) =>
  new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA").format(n);

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3 text-fg-muted">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-2.5 size-1.5 shrink-0 bg-accent"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Ce qu'est un crédit, puis son équivalent en jetons calculé depuis le catalogue (ou une explication franche s'il manque). */
export function CreditSection({
  lang,
  t,
  equivalents,
}: {
  lang: Lang;
  t: PricingDictionary;
  /** `null` : catalogue indisponible ou sans modèle exploitable. */
  equivalents: CreditEquivalent[] | null;
}) {
  const e = t.credit.equivalents;
  const credits = number(lang, EQUIVALENT_CREDITS);
  return (
    <Section tone="light" aria-labelledby="credit-title">
      <SectionHeader
        id="credit-title"
        title={t.credit.title}
        lead={t.credit.lead}
      />
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Bullets items={t.credit.points} />
        <div>
          <h3 className="text-h3 text-fg">{fmt(e.title, { credits })}</h3>
          <p className="mt-3 text-fg-muted">{e.lead}</p>
          {equivalents && equivalents.length > 0 ? (
            <>
              <table className="mt-6 hidden w-full border-collapse text-left sm:table">
                <caption className="sr-only">
                  {fmt(e.caption, { credits })}
                </caption>
                <thead>
                  <tr className="border-b border-line-strong text-small text-fg-muted">
                    <th scope="col" className="py-3 pr-4 font-medium">
                      {e.model}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-3 text-right font-medium"
                    >
                      {e.input}
                    </th>
                    <th
                      scope="col"
                      className="py-3 pl-4 text-right font-medium"
                    >
                      {e.output}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {equivalents.map((row) => (
                    <tr key={row.id} className="border-b border-line">
                      <th scope="row" className="py-3 pr-4 font-medium text-fg">
                        {row.name}
                        {row.preview ? (
                          <Badge tone="outline" className="ml-2 align-middle">
                            {e.preview.tag}
                          </Badge>
                        ) : null}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums text-fg">
                        {formatTokensCompact(lang, row.inputTokens)}
                      </td>
                      <td className="py-3 pl-4 text-right tabular-nums text-fg">
                        {formatTokensCompact(lang, row.outputTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-6 divide-y divide-line border-y border-line sm:hidden">
                {equivalents.map((row) => (
                  <li key={row.id} className="py-4">
                    <p className="font-medium text-fg">
                      {row.name}
                      {row.preview ? (
                        <Badge tone="outline" className="ml-2 align-middle">
                          {e.preview.tag}
                        </Badge>
                      ) : null}
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-3 text-small">
                      <div>
                        <dt className="text-fg-muted">{e.input}</dt>
                        <dd className="tabular-nums text-fg">
                          {formatTokensCompact(lang, row.inputTokens)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-fg-muted">{e.output}</dt>
                        <dd className="tabular-nums text-fg">
                          {formatTokensCompact(lang, row.outputTokens)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-small text-fg-muted">{e.note}</p>
              {equivalents.some((row) => row.preview) ? (
                <p className="mt-2 text-small text-fg-muted">
                  {e.preview.note}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-6 border-l-2 border-line-strong pl-4 text-fg-muted">
              {e.unavailable}
            </p>
          )}
          <div className="mt-6">
            <ButtonLink
              href={localizePath(lang, "/modeles")}
              variant="secondary"
              arrow
            >
              {e.cta}
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Recharge : règles de consommation et, s'il y en a de publiés, les forfaits (prix lus dans Directus). */
export function RefillSection({
  lang,
  t,
  packs,
}: {
  lang: Lang;
  t: PricingDictionary;
  packs: readonly CreditPack[];
}) {
  const r = t.refill;
  return (
    <Section tone="light" surface aria-labelledby="refill-title">
      <SectionHeader id="refill-title" title={r.title} lead={r.lead} />
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Bullets items={r.points} />
        <div>
          <h3 className="text-h3 text-fg">{r.packsTitle}</h3>
          {packs.length > 0 ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2">
              {packs.map((pack) => (
                <li key={pack.code}>
                  <Card variant="outline" className="h-full">
                    <p className="font-display text-h3 text-fg tabular-nums">
                      {fmt(r.packCredits, {
                        credits: number(lang, pack.credits),
                      })}
                    </p>
                    <p className="mt-2 text-fg-muted tabular-nums">
                      {formatCad(lang, pack.priceCents)}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 border-l-2 border-line-strong pl-4 text-fg-muted">
              {r.packsSoon}
            </p>
          )}
          <div className="mt-6">
            <ButtonLink
              href={localizePath(lang, "/compte/facturation")}
              variant="secondary"
              arrow
            >
              {r.cta}
            </ButtonLink>
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Espace disque : règles du quota et offre complémentaire « Go supplémentaire » (prix publié, ou franchement « à venir »). */
export function StorageSection({
  lang,
  t,
  addon,
}: {
  lang: Lang;
  t: PricingDictionary;
  addon: PricingOffer | null;
}) {
  const s = t.storage;
  const price = addon?.options.month?.priceCents;
  return (
    <Section tone="light" aria-labelledby="storage-title">
      <SectionHeader id="storage-title" title={s.title} lead={s.lead} />
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Bullets items={s.points} />
        <div>
          {addon && price ? (
            <Card variant="outline">
              <h3 className="text-h3 text-fg">{addon.name}</h3>
              {addon.description ? (
                <p className="mt-3 text-fg-muted">{addon.description}</p>
              ) : null}
              <p className="mt-5 font-display text-h3 text-fg tabular-nums">
                {fmt(s.addonPrice, { price: formatCad(lang, price) })}
              </p>
            </Card>
          ) : (
            <p className="border-l-2 border-line-strong pl-4 text-fg-muted">
              {s.addonSoon}
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}

/** Trois colonnes : gratuit ou inclus, consomme des crédits, consomme de l'espace. */
export function UsageSection({ t }: { t: PricingDictionary }) {
  const u = t.usage;
  const columns = [u.included, u.credits, u.space];
  return (
    <Section tone="light" surface aria-labelledby="usage-title">
      <SectionHeader id="usage-title" title={u.title} lead={u.lead} />
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {columns.map((col) => (
          <li key={col.title}>
            <Card className="h-full">
              <h3 className="text-h3 text-fg">{col.title}</h3>
              <div className="mt-4">
                <Bullets items={col.items} />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Questions fréquentes (<details> natifs). La question sur les prix n'apparaît que tant qu'ils ne sont pas publiés. */
export function PricingFaq({
  t,
  pricesPublished,
}: {
  t: PricingDictionary;
  pricesPublished: boolean;
}) {
  const i = t.faq.items;
  const items = [
    i.noCredits,
    i.expiry,
    i.annual,
    i.trial,
    i.space,
    i.cancel,
    ...(pricesPublished ? [] : [i.prices]),
  ];
  return (
    <Section tone="light" aria-labelledby="faq-title">
      <SectionHeader id="faq-title" title={t.faq.title} lead={t.faq.lead} />
      <div className="mt-10 max-w-3xl divide-y divide-line border-y border-line">
        {items.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-h4 text-fg [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                focusable="false"
                className="size-4 shrink-0 text-accent-text transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none"
              >
                <path
                  d="M8 2v12M2 8h12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="square"
                />
              </svg>
            </summary>
            <div className="mt-4 max-w-2xl space-y-4 text-fg-muted">
              {answerParagraphs(item.a).map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Section>
  );
}

/** Bandeau d'état de la page : « prix à venir » ou « momentanément indisponible » (jamais d'offre inventée). */
export function PricingState({
  lang,
  state,
  t,
}: {
  lang: Lang;
  state: "empty" | "unavailable";
  t: PricingDictionary;
}) {
  const s = t.states[state];
  return (
    <Section tone="light" surface aria-labelledby="pricing-state-title">
      <div className="max-w-2xl">
        <Badge tone="accent">{s.label}</Badge>
        <h2 id="pricing-state-title" className="mt-4 text-h2 text-fg">
          {s.title}
        </h2>
        <p className="mt-5 text-lead text-fg-muted">{s.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          {state === "empty" ? (
            <ButtonLink href={notifyHref(lang)} arrow>
              {t.notify.cta}
            </ButtonLink>
          ) : null}
          <ButtonLink
            href={`${localizePath(lang, "/contact")}?sujet=demonstration`}
            variant={state === "empty" ? "secondary" : "primary"}
            arrow
          >
            {s.cta}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
