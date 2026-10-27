import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { formatDate, formatMicroCad } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { formatInteger, getGatewayDictionary } from "@/i18n/gateway";
import type { ApiKeySummary } from "@/server/gateway/keys";
import type { UsageRow } from "@/server/gateway/usage";
import { CreateKeyForm, RevokeKeyButton } from "./api-keys-panel";

type Role = "owner" | "member";

function keyStatus(
  key: ApiKeySummary,
  now: Date,
): "active" | "revoked" | "expired" {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt <= now) return "expired";
  return "active";
}

/** Clés API et usage de l'organisation (espace client). Les données arrivent déjà chargées. */
export function ApiKeysSection({
  lang,
  role,
  keys,
  usage,
}: {
  lang: Lang;
  role: Role;
  keys: ApiKeySummary[];
  usage: UsageRow[];
}) {
  const t = getGatewayDictionary(lang).account;
  const now = new Date();
  const th = "px-4 py-3 font-medium";
  const scroller = "mt-6 overflow-x-auto rounded-md border border-line";
  const totals = usage.reduce(
    (a, r) => ({
      requests: a.requests + r.requests,
      input: a.input + r.promptTokens,
      output: a.output + r.completionTokens,
      cost: a.cost + r.costMicro,
    }),
    { requests: 0, input: 0, output: 0, cost: 0n },
  );

  return (
    <Section tone="light" surface aria-labelledby="apikeys-title">
      <h2 id="apikeys-title" className="text-h2 text-fg">
        {t.title}
      </h2>
      <p className="mt-4 max-w-2xl text-lead text-fg-muted">{t.lead}</p>

      {role === "owner" ? (
        <CreateKeyForm t={t} />
      ) : (
        <p className="mt-6 text-small text-fg-muted">{t.ownerOnly}</p>
      )}

      <section aria-labelledby="apikeys-list" className="mt-12">
        <h3 id="apikeys-list" className="text-h3 text-fg">
          {t.list}
        </h3>
        {keys.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{t.empty}</p>
        ) : (
          <section
            aria-label={`${t.list} (${t.tableLabel})`}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className={scroller}
          >
            <table className="w-full min-w-[52rem] border-collapse text-left text-small">
              <caption className="sr-only">{t.list}</caption>
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className={th}>
                    {t.columns.name}
                  </th>
                  <th scope="col" className={th}>
                    {t.columns.prefix}
                  </th>
                  <th scope="col" className={th}>
                    {t.columns.created}
                  </th>
                  <th scope="col" className={th}>
                    {t.columns.lastUsed}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.columns.spent}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.columns.cap}
                  </th>
                  <th scope="col" className={th}>
                    {t.columns.status}
                  </th>
                  <th scope="col" className={th}>
                    <span className="sr-only">{t.revoke}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const status = keyStatus(k, now);
                  return (
                    <tr
                      key={k.id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-4 py-3 text-fg">{k.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-fg">
                        {k.prefix}…
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-fg">
                        {formatDate(lang, k.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-fg">
                        {k.lastUsedAt
                          ? formatDate(lang, k.lastUsedAt)
                          : t.never}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                        {formatMicroCad(lang, k.spentMicro)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                        {k.spendCapMicro === null
                          ? t.noCap
                          : formatMicroCad(lang, k.spendCapMicro)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 ${status === "active" ? "text-fg" : "text-accent-text"}`}
                      >
                        {t.status[status]}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {role === "owner" && status === "active" ? (
                          <RevokeKeyButton keyId={k.id} name={k.name} t={t} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </section>

      <section aria-labelledby="usage-title" className="mt-16">
        <h3 id="usage-title" className="text-h3 text-fg">
          {t.usageTitle}
        </h3>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">{t.usageLead}</p>
        {usage.length === 0 ? (
          <Card className="mt-6" variant="outline">
            <p className="text-body text-fg-muted">{t.usageEmpty}</p>
          </Card>
        ) : (
          <section
            aria-label={t.usageCaption}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
            tabIndex={0}
            className={scroller}
          >
            <table className="w-full min-w-[40rem] border-collapse text-left text-small">
              <caption className="sr-only">{t.usageCaption}</caption>
              <thead>
                <tr className="border-b border-line text-fg-muted">
                  <th scope="col" className={th}>
                    {t.usageColumns.day}
                  </th>
                  <th scope="col" className={th}>
                    {t.usageColumns.model}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.usageColumns.requests}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.usageColumns.input}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.usageColumns.output}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t.usageColumns.cost}
                  </th>
                </tr>
              </thead>
              <tbody>
                {usage.map((r) => (
                  <tr
                    key={`${r.day}|${r.model}`}
                    className="border-b border-line"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-fg">
                      {r.day}
                    </td>
                    <td className="px-4 py-3 font-mono text-fg">{r.model}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg">
                      {formatInteger(lang, r.requests)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg">
                      {formatInteger(lang, r.promptTokens)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-fg">
                      {formatInteger(lang, r.completionTokens)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                      {formatMicroCad(lang, r.costMicro)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <th
                    scope="row"
                    colSpan={2}
                    className="px-4 py-3 text-left text-fg"
                  >
                    {t.usageTotal}
                  </th>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, totals.requests)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, totals.input)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg">
                    {formatInteger(lang, totals.output)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                    {formatMicroCad(lang, totals.cost)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}
      </section>
    </Section>
  );
}
