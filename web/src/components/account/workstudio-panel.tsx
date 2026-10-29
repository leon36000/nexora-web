import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, formatDate } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import type { UsedAgent } from "@/server/gateway/activity-workstudio";
import { formatMicroCadExact } from "./panel-format";
import type { WorkstudioView } from "./panel-logic";
import { PanelHeading, ScrollRegion, SectionTitle, TD, TH } from "./panel-ui";

/**
 * WorkStudio et agents. État honnête : le bouton d'ouverture n'existe que si un abonnement donne l'accès ET qu'une
 * adresse d'instance est connue ; sinon on dit « en préparation », « abonnement suspendu » ou « aucun abonnement ».
 * La liste des agents est celle des agents que les clés de l'organisation ont réellement appelés (aucun agent
 * n'est inventé, le catalogue d'agents appartient à la plateforme).
 */
export function WorkstudioPanel({
  lang,
  t,
  view,
  agents,
}: {
  lang: Lang;
  t: AccountDictionary;
  view: WorkstudioView;
  agents: UsedAgent[];
}) {
  const w = t.panel.workstudio;
  return (
    <div className="space-y-12">
      <PanelHeading id="workstudio-title" title={w.title} lead={w.lead} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card as="section" aria-labelledby="ws-subscription-title">
          <SectionTitle id="ws-subscription-title">
            {w.subscription.title}
          </SectionTitle>
          {view.state === "no_subscription" ? (
            <>
              <p className="mt-3 text-body text-fg-muted">
                {w.subscription.none}
              </p>
              <div className="mt-5">
                <ButtonLink href={localizePath(lang, "/tarifs")} arrow>
                  {w.subscription.seeOffers}
                </ButtonLink>
              </div>
            </>
          ) : view.state === "suspended" ? (
            <>
              <p className="mt-3 text-body text-accent-text">
                {w.subscription.suspended}
              </p>
              <div className="mt-5">
                <ButtonLink
                  href={localizePath(lang, "/compte/facturation")}
                  variant="secondary"
                >
                  {w.subscription.manage}
                </ButtonLink>
              </div>
            </>
          ) : (
            <div className="mt-5">
              <ButtonLink
                href={localizePath(lang, "/compte/facturation")}
                variant="secondary"
              >
                {w.subscription.manage}
              </ButtonLink>
            </div>
          )}
        </Card>

        <Card as="section" aria-labelledby="ws-instance-title">
          <SectionTitle id="ws-instance-title">{w.instance.title}</SectionTitle>
          {view.state === "ready" ? (
            <div className="mt-5">
              <ButtonLink href={view.url} arrow>
                {w.instance.open}
              </ButtonLink>
            </div>
          ) : view.state === "pending" ? (
            <>
              <p className="mt-3 text-body font-medium text-fg">
                {w.instance.pending}
              </p>
              <p className="mt-2 text-small text-fg-muted">
                {w.instance.pendingText}
              </p>
            </>
          ) : (
            <p className="mt-3 text-body text-fg-muted">{w.instance.locked}</p>
          )}
        </Card>
      </div>

      <section aria-labelledby="ws-agents-title">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionTitle id="ws-agents-title">{w.agents.title}</SectionTitle>
          <ButtonLink href={localizePath(lang, "/agents")} variant="link">
            {w.agents.catalog}
          </ButtonLink>
        </div>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {w.agents.lead}
        </p>
        {agents.length === 0 ? (
          <Card className="mt-6" variant="outline">
            <p className="text-body text-fg-muted">{w.agents.empty}</p>
          </Card>
        ) : (
          <div className="mt-6">
            <ScrollRegion label={w.agents.caption}>
              <table className="w-full min-w-[34rem] border-collapse text-left text-small">
                <caption className="sr-only">{w.agents.caption}</caption>
                <thead>
                  <tr className="border-b border-line text-fg-muted">
                    <th scope="col" className={TH}>
                      {w.agents.columns.agent}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {w.agents.columns.requests}
                    </th>
                    <th scope="col" className={TH}>
                      {w.agents.columns.last}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {w.agents.columns.cost}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => {
                    const name = lang === "fr" ? a.nameFr : a.nameEn;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-line last:border-0"
                      >
                        <th
                          scope="row"
                          className="px-4 py-3 text-left font-normal text-fg"
                        >
                          {name ?? a.slug}
                          <span className="block font-mono text-fg-muted">
                            {a.id}
                          </span>
                          {name === null ? (
                            <span className="block text-fg-muted">
                              {w.agents.removed}
                            </span>
                          ) : null}
                        </th>
                        <td className={`${TD} text-right tabular-nums`}>
                          {formatInteger(lang, a.requests)}
                        </td>
                        <td className={`whitespace-nowrap ${TD}`}>
                          <time dateTime={a.lastUsedAt.toISOString()}>
                            {formatDate(lang, a.lastUsedAt)}
                          </time>
                        </td>
                        <td
                          className={`whitespace-nowrap ${TD} text-right tabular-nums`}
                        >
                          {formatMicroCadExact(lang, a.costMicro)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        )}
      </section>
    </div>
  );
}
