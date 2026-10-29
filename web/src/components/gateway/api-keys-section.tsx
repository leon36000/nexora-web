import { formatMicroCadExact } from "@/components/account/panel-format";
import { ScrollRegion, SectionTitle, TH } from "@/components/account/panel-ui";
import { fmt, formatDate } from "@/i18n/account";
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

type KeysText = ReturnType<typeof getGatewayDictionary>["account"];

/** Opérations WebPilot permises à la clé, ou « Non » (permission à cocher, désactivée par défaut). */
function webpilotLabel(key: ApiKeySummary, t: KeysText): string {
  const ops = (key.webpilotOperations ?? []).filter(
    (o): o is keyof KeysText["webpilot"]["operations"] =>
      o in t.webpilot.operations,
  );
  return ops.length === 0
    ? t.webpilot.none
    : ops.map((o) => t.webpilot.operations[o]).join(", ");
}

/** Limites de débit propres et modèles permis d'une clé, une ligne chacun (« par défaut » sans réglage). */
export function keyRestrictions(key: ApiKeySummary, t: KeysText): string[] {
  const limits =
    key.rpmLimit === null && key.tpmLimit === null
      ? t.defaultLimits
      : fmt(t.limitsText, {
          rpm: key.rpmLimit ?? "—",
          tpm: key.tpmLimit ?? "—",
        });
  const n = key.allowedModels?.length ?? 0;
  const models =
    n === 0
      ? t.allModels
      : n === 1
        ? t.someModelsOne
        : fmt(t.someModels, { count: n });
  return [limits, models];
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
  models = [],
}: {
  lang: Lang;
  role: Role;
  keys: ApiKeySummary[];
  models?: { id: string; name: string }[];
}) {
  const t = getGatewayDictionary(lang).account;
  const now = new Date();

  return (
    <section aria-labelledby="apikeys-title">
      <SectionTitle id="apikeys-title">{t.title}</SectionTitle>
      <p className="mt-3 max-w-2xl text-body text-fg-muted">{t.lead}</p>

      {role === "owner" ? (
        <CreateKeyForm t={t} models={models} />
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
              <table className="w-full min-w-[72rem] border-collapse text-left text-small">
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
                      {t.columns.expires}
                    </th>
                    <th scope="col" className={TH}>
                      {t.columns.limits}
                    </th>
                    <th scope="col" className={TH}>
                      {t.webpilot.column}
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
                        <td className="whitespace-nowrap px-4 py-3 text-fg">
                          {k.expiresAt
                            ? formatDate(lang, k.expiresAt)
                            : t.noExpiry}
                        </td>
                        <td className="px-4 py-3 text-fg">
                          {keyRestrictions(k, t).map((line) => (
                            <span key={line} className="block">
                              {line}
                            </span>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-fg">
                          {webpilotLabel(k, t)}
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
