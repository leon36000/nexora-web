import { formatMicroCadExact } from "@/components/account/panel-format";
import { ScrollRegion, SectionTitle, TH } from "@/components/account/panel-ui";
import { formatDate } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { getGatewayDictionary } from "@/i18n/gateway";
import type { ApiKeySummary } from "@/server/gateway/keys";
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

/**
 * Clés d'API de l'organisation, dans la page « Modèles et clés » du panneau client. Mêmes règles qu'avant le
 * panneau : tout membre voit la liste, seul le propriétaire crée ou révoque (les routes le refusent aux autres).
 * L'usage n'est plus ici : il vit dans la page « Activité ». Les données arrivent déjà chargées.
 */
export function ApiKeysSection({
  lang,
  role,
  keys,
}: {
  lang: Lang;
  role: Role;
  keys: ApiKeySummary[];
}) {
  const t = getGatewayDictionary(lang).account;
  const now = new Date();

  return (
    <section aria-labelledby="apikeys-title">
      <SectionTitle id="apikeys-title">{t.title}</SectionTitle>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t.lead}</p>

      {role === "owner" ? (
        <CreateKeyForm t={t} />
      ) : (
        <p className="mt-6 text-small text-fg-muted">{t.ownerOnly}</p>
      )}

      <section aria-labelledby="apikeys-list" className="mt-10">
        <h3 id="apikeys-list" className="text-body font-medium text-fg">
          {t.list}
        </h3>
        {keys.length === 0 ? (
          <p className="mt-4 text-body text-fg-muted">{t.empty}</p>
        ) : (
          <div className="mt-4">
            <ScrollRegion label={`${t.list} (${t.tableLabel})`}>
              <table className="w-full min-w-[52rem] border-collapse text-left text-small">
                <caption className="sr-only">{t.list}</caption>
                <thead>
                  <tr className="border-b border-line text-fg-muted">
                    <th scope="col" className={TH}>
                      {t.columns.name}
                    </th>
                    <th scope="col" className={TH}>
                      {t.columns.prefix}
                    </th>
                    <th scope="col" className={TH}>
                      {t.columns.created}
                    </th>
                    <th scope="col" className={TH}>
                      {t.columns.lastUsed}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t.columns.spent}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t.columns.cap}
                    </th>
                    <th scope="col" className={TH}>
                      {t.columns.status}
                    </th>
                    <th scope="col" className={TH}>
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
                          {formatMicroCadExact(lang, k.spentMicro)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-fg">
                          {k.spendCapMicro === null
                            ? t.noCap
                            : formatMicroCadExact(lang, k.spendCapMicro)}
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
            </ScrollRegion>
          </div>
        )}
      </section>
    </section>
  );
}
