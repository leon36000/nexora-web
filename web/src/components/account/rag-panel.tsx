import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt, formatDate } from "@/i18n/account";
import { appContactHref, appPath } from "@/i18n/apps";
import { type Lang, localizePath } from "@/i18n/config";
import { formatInteger } from "@/i18n/gateway";
import type { StorageLevel } from "@/server/products/panel-data";
import type { RagPanelModel } from "@/server/products/rag-panel";
import { CreateRagForm } from "./create-rag-form";
import { Notice } from "./field";
import { formatBytes } from "./panel-format";
import { PanelHeading, ScrollRegion, SectionTitle, TD, TH } from "./panel-ui";
import { RagConnectBlock } from "./rag-connect-block";
import { ProductProblem, ProductSoon } from "./tools-soon";

/**
 * Page « Nexora RAG » du panneau. Quatre états honnêtes : « Bientôt » (interrupteur éteint), « indisponible » (allumé,
 * service muet), « erreur » (lecture en échec) et « prêt » (bases, création en un clic, bloc « Se connecter »).
 */
export function RagPanel({
  lang,
  t,
  role,
  model,
  storageNotice,
}: {
  lang: Lang;
  t: AccountDictionary;
  role: "owner" | "member";
  model: RagPanelModel;
  /** Niveau d'alerte de l'espace de l'organisation (80 % ou 100 %), pour le rappeler ici. */
  storageNotice: { level: StorageLevel; percent: number } | null;
}) {
  const r = t.panel.rag;
  return (
    <div className="space-y-12">
      <PanelHeading id="rag-title" title={r.title} lead={r.lead} />

      {model.kind === "soon" ? (
        <ProductSoon
          id="rag"
          text={r.soon}
          waitlistHref={appContactHref(lang, "rag")}
          appHref={localizePath(lang, appPath("rag"))}
        />
      ) : model.kind === "unavailable" ? (
        <ProductProblem
          id="rag"
          title={r.unavailable.title}
          text={r.unavailable.text}
        />
      ) : model.kind === "error" ? (
        <ProductProblem
          id="rag"
          title={r.error.title}
          text={r.error.text}
          retry={r.error.retry}
          retryHref={localizePath(lang, "/compte/rag")}
        />
      ) : (
        <>
          {storageNotice?.level === "full" ? (
            <Notice tone="error">{t.panel.tools.storage.full}</Notice>
          ) : storageNotice?.level === "warning" ? (
            <Notice tone="info">
              {fmt(t.panel.tools.storage.warning, {
                percent: storageNotice.percent,
              })}
            </Notice>
          ) : null}

          <section aria-labelledby="rag-bases-title">
            <SectionTitle id="rag-bases-title">{r.bases.title}</SectionTitle>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {r.cost.text}
            </p>
            {model.bases.length === 0 ? (
              <Card className="mt-6" variant="outline">
                <p className="text-body font-medium text-fg">
                  {r.bases.empty.title}
                </p>
                <p className="mt-2 text-small text-fg-muted">
                  {r.bases.empty.text}
                </p>
              </Card>
            ) : (
              <>
                <p
                  className="mt-4 text-small text-fg"
                  data-testid="rag-total-space"
                >
                  {fmt(r.cost.space, {
                    amount: formatBytes(lang, model.totalBytes),
                  })}{" "}
                  <ButtonLink
                    href={localizePath(lang, "/compte")}
                    variant="link"
                  >
                    {r.cost.manage}
                  </ButtonLink>
                </p>
                <div className="mt-4">
                  <ScrollRegion label={r.bases.caption}>
                    <table className="w-full min-w-[34rem] border-collapse text-left text-small">
                      <caption className="sr-only">{r.bases.caption}</caption>
                      <thead>
                        <tr className="border-b border-line text-fg-muted">
                          <th scope="col" className={TH}>
                            {r.bases.columns.name}
                          </th>
                          <th scope="col" className={TH}>
                            {r.bases.columns.documents}
                          </th>
                          <th scope="col" className={`${TH} text-right`}>
                            {r.bases.columns.space}
                          </th>
                          <th scope="col" className={TH}>
                            {r.bases.columns.created}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.bases.map((b) => (
                          <tr
                            key={b.id}
                            className="border-b border-line last:border-0"
                          >
                            <th
                              scope="row"
                              className="px-4 py-3 text-left font-normal text-fg"
                            >
                              {b.name}
                              {b.description ? (
                                <span className="block text-fg-muted">
                                  {b.description}
                                </span>
                              ) : null}
                            </th>
                            <td className={TD}>
                              {fmt(
                                b.documents === 1
                                  ? r.bases.documentsOne
                                  : r.bases.documents,
                                { count: formatInteger(lang, b.documents) },
                              )}
                              {b.pending > 0 ? (
                                <span className="block text-fg-muted">
                                  {fmt(r.bases.pending, {
                                    count: formatInteger(lang, b.pending),
                                  })}
                                </span>
                              ) : null}
                              {b.failed > 0 ? (
                                <span className="block text-accent-text">
                                  {fmt(r.bases.failed, {
                                    count: formatInteger(lang, b.failed),
                                  })}
                                </span>
                              ) : null}
                            </td>
                            <td
                              className={`whitespace-nowrap ${TD} text-right tabular-nums`}
                            >
                              {formatBytes(lang, b.usedBytes)}
                            </td>
                            <td className={`whitespace-nowrap ${TD}`}>
                              <time dateTime={b.createdAt.toISOString()}>
                                {formatDate(lang, b.createdAt)}
                              </time>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                </div>
              </>
            )}
            <div className="mt-6">
              <CreateRagForm
                t={r}
                defaultName={model.defaultName}
                canCreate={role === "owner"}
                apiUrl={model.connection.apiUrl}
                mcpUrl={model.connection.mcpUrl}
              />
            </div>
          </section>

          <section aria-labelledby="rag-connect-title">
            <SectionTitle id="rag-connect-title">
              {r.connect.title}
            </SectionTitle>
            <p className="mt-2 max-w-2xl text-small text-fg-muted">
              {r.connect.lead}
            </p>
            <div className="mt-6">
              <RagConnectBlock
                text={r.connect}
                apiUrl={model.connection.apiUrl}
                mcpUrl={model.connection.mcpUrl}
                keyValue={null}
                baseId={model.bases[0]?.id ?? null}
              />
            </div>
            <div className="mt-6">
              <ButtonLink
                href={localizePath(lang, "/compte/modeles")}
                variant="secondary"
              >
                {r.connect.manageKeys}
              </ButtonLink>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
