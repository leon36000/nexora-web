import Link from "next/link";
import { ResidencyBadge } from "@/components/gateway/residency-badge";
import { CARD_LINK, Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import type { AgentsDictionary } from "@/i18n/agents";
import { type Lang, localizePath } from "@/i18n/config";
import type { PublicAgent } from "@/server/agents/public";
import { AgentPricing } from "./agent-pricing";

/** Carte d'agent du catalogue : nom, catégorie, hébergement de l'instance, prix. */
export function AgentCard({
  agent,
  lang,
  t,
}: {
  agent: PublicAgent;
  lang: Lang;
  t: AgentsDictionary;
}) {
  const name = lang === "fr" ? agent.nameFr : agent.nameEn;
  const description = lang === "fr" ? agent.descriptionFr : agent.descriptionEn;
  return (
    <Card interactive as="article" className="flex h-full flex-col">
      <ResidencyBadge region={agent.region} t={t} />
      <h2 className="mt-4 font-display text-h4 text-fg">
        <Link
          href={localizePath(lang, `/agents/${agent.slug}`)}
          prefetch={false}
          className={CARD_LINK}
          aria-label={fmt(t.catalog.viewAgent, { name })}
        >
          {name}
        </Link>
      </h2>
      <p className="mt-1 font-mono text-small text-fg-muted">{agent.id}</p>
      <p className="mt-1 text-small text-fg-muted">
        {t.categories[agent.category]}
      </p>
      {description ? (
        <p className="mt-3 line-clamp-3 text-small text-fg-muted">
          {description}
        </p>
      ) : null}
      <div className="mt-5">
        <AgentPricing agent={agent} lang={lang} t={t} />
      </div>
      {agent.trial ? (
        <p className="mt-4 font-mono text-label uppercase text-fg-muted">
          {t.catalog.trialBadge}
        </p>
      ) : null}
    </Card>
  );
}
