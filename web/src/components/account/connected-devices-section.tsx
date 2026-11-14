"use client";

import { useState } from "react";
import { type DevicesLang, getDevicesDictionary } from "@/i18n/devices";

/**
 * Appareils connectés / Connected devices.
 * Cible d'intégration : `web/src/components/account/connected-devices-section.tsx`,
 * affiché dans `/[lang]/compte/securite` sous le panneau 2FA.
 * N'affiche et ne stocke aucune clé complète : seul `keyPrefix` (`nxk_…`) est rendu.
 */
export interface PublicDeviceGrant {
  id: string;
  deviceLabel: string;
  client: string;
  keyPrefix: string;
  scopes: string[];
  spendCapCad: number | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function formatDateTime(value: string, lang: DevicesLang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatSpendCap(value: number, lang: DevicesLang): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(value);
}

/** Liste des accès d'appareils avec révocation immédiate (`DELETE /v1/account/device-grants/:id`). */
export function ConnectedDevicesSection({
  initialGrants,
  lang,
}: {
  initialGrants: PublicDeviceGrant[];
  lang: DevicesLang;
}) {
  const t = getDevicesDictionary(lang);
  const [grants, setGrants] = useState<PublicDeviceGrant[]>(initialGrants);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState(false);

  async function revoke(id: string) {
    if (revokingId !== null) return;
    setRevokingId(id);
    setError(false);
    try {
      const res = await fetch(
        `/v1/account/device-grants/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setGrants((prev) =>
        prev.map((grant) =>
          grant.id === id && grant.revokedAt === null
            ? { ...grant, revokedAt: new Date().toISOString() }
            : grant,
        ),
      );
    } catch {
      setError(true);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section
      aria-labelledby="connected-devices-title"
      className="rounded-md border border-line p-6"
    >
      <h2 id="connected-devices-title" className="text-h3 text-fg">
        {t.title}
      </h2>
      <p className="mt-2 text-body text-fg-muted">{t.lead}</p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-line-strong p-3 text-body text-fg"
        >
          {t.errors.revokeFailed}
        </p>
      ) : null}

      {grants.length === 0 ? (
        <p className="mt-4 text-body text-fg-muted">{t.empty}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {grants.map((grant) => {
            const revoked = grant.revokedAt !== null;
            const revoking = revokingId === grant.id;
            return (
              <li key={grant.id} className="rounded-md border border-line p-4">
                <dl className="grid gap-x-6 gap-y-2 text-body sm:grid-cols-2">
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.device}
                    </dt>
                    <dd className="text-fg">{grant.deviceLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.client}
                    </dt>
                    <dd className="text-fg">{grant.client}</dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.keyPrefix}
                    </dt>
                    <dd className="font-mono text-fg">{grant.keyPrefix}</dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.scopes}
                    </dt>
                    <dd className="text-fg">
                      {grant.scopes.length > 0
                        ? grant.scopes.join(", ")
                        : t.values.noScopes}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.spendCap}
                    </dt>
                    <dd className="text-fg">
                      {grant.spendCapCad === null
                        ? t.values.noCap
                        : formatSpendCap(grant.spendCapCad, lang)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.lastUsed}
                    </dt>
                    <dd className="text-fg">
                      {grant.lastUsedAt === null ? (
                        t.values.neverUsed
                      ) : (
                        <time dateTime={grant.lastUsedAt}>
                          {formatDateTime(grant.lastUsedAt, lang)}
                        </time>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-small text-fg-muted">
                      {t.fields.status}
                    </dt>
                    <dd className="text-fg">
                      {revoked ? t.status.revoked : t.status.active}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={revoked || revoking}
                    aria-label={`${t.actions.revoke} — ${grant.deviceLabel}`}
                    onClick={() => void revoke(grant.id)}
                    className="rounded-md border border-line-strong px-3 py-2 text-body text-fg focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {revoking ? t.actions.revoking : t.actions.revoke}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
