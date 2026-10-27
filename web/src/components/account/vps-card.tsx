"use client";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt, formatCad, formatDate } from "@/i18n/account";
import type { AccountVpsDictionary } from "@/i18n/account-vps";
import { type Lang, localizePath } from "@/i18n/config";
import type { AccountVpsInstance } from "@/server/vps/account";
import { ConfirmDialog } from "./vps-dialog";
import {
  ACCESS_FILE,
  actionStates,
  formatRamGb,
  genericTunnelCommand,
  newRequestId,
  sshCommand,
  stateKey,
  stepProgress,
  tunnelCommand,
  tunnelPorts,
  type VpsAction,
} from "./vps-logic";
import {
  CommandLine,
  CopyButton,
  Journal,
  ProgressList,
  StateBadge,
} from "./vps-parts";

type Role = "owner" | "member";

const errorText = (t: AccountVpsDictionary, code: string | undefined) =>
  (t.errors as Record<string, string>)[code ?? ""] ?? t.errors.generic;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words text-body text-fg">{children}</dd>
    </div>
  );
}

/** Une carte par VPS : état, accès, opérations, abonnement, journal. */
export function VpsCard({
  lang,
  t,
  role,
  instance: i,
}: {
  lang: Lang;
  t: AccountVpsDictionary;
  role: Role;
  instance: AccountVpsInstance;
}) {
  const router = useRouter();
  const headingId = useId();
  const [busy, setBusy] = useState<VpsAction | null>(null);
  const [dialog, setDialog] = useState<"reinstall" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const state = stateKey(i);
  const actions = actionStates({
    role,
    status: i.status,
    power: i.power,
    pendingAction: i.pendingAction,
    cancelAtPeriodEnd: i.billing.cancelAtPeriodEnd,
  });
  const owner = role === "owner";
  const live = i.status === "active" || i.status === "suspended";
  const working = i.status === "provisioning" || i.status === "reinstalling";
  const fmtDate = (d: Date) => formatDate(lang, d);

  async function run(action: VpsAction, confirm = false): Promise<boolean> {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/account/vps/${i.id}/action`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          action,
          ...(confirm ? { confirm: true } : {}),
          requestId: newRequestId(),
        }),
      });
      if (res.status === 202) {
        setNotice(t.actions.sent[action]);
        // L'action en attente et le nouvel état viennent du serveur.
        router.refresh();
        return true;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(errorText(t, json.error));
      return false;
    } catch {
      setError(t.errors.generic);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const ssh = sshCommand(i.sshUser, i.ipv4);
  const ports = tunnelPorts(i);
  const publicPorts = i.ports
    .filter((p) => p.exposure === "public")
    .map((p) => `${p.port}/${p.proto}`)
    .join(", ");
  const showAccess = i.status === "active" && ssh !== null;
  const price = fmt(
    i.billing.term === "month" ? t.billing.perMonth : t.billing.perYear,
    { amount: formatCad(lang, i.billing.priceCents) },
  );
  const cancelDate = i.billing.nextDueAt ? fmtDate(i.billing.nextDueAt) : null;

  const actionButton = (action: "start" | "stop" | "reboot") => {
    const a = actions[action];
    if (!a.visible) return null;
    return (
      <Button
        variant="secondary"
        disabled={!a.enabled || busy !== null}
        aria-label={fmt(t.actions.forVps, {
          action: t.actions[action],
          name: i.hostname,
        })}
        onClick={() => run(action)}
      >
        {busy === action ? t.actions.working : t.actions[action]}
      </Button>
    );
  };

  return (
    <Card as="article" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3
            id={headingId}
            className="break-words font-display text-h3 text-fg"
          >
            {i.hostname}
          </h3>
          <p className="mt-1 text-small text-fg-muted">
            {i.app.name} {i.app.version}
          </p>
        </div>
        <StateBadge state={state} t={t} />
      </header>

      <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Fact label={t.card.size}>
          {fmt(t.card.plan, {
            vcpu: i.plan.vcpu,
            ram: formatRamGb(lang, i.plan.ramMb),
            disk: i.plan.diskGb,
          })}
          <span className="block text-small text-fg-muted">{i.plan.name}</span>
        </Fact>
        <Fact label={t.card.region}>
          {(t.card.regions as Record<string, string>)[i.region] ?? i.region}
        </Fact>
        <Fact label={t.card.ip}>
          {i.ipv4 ? (
            <span className="flex flex-wrap items-center gap-3">
              <code className="break-all font-mono text-body text-fg">
                {i.ipv4}
              </code>
              <CopyButton value={i.ipv4} label={t.card.ipCopy} t={t} />
            </span>
          ) : (
            <span className="text-fg-muted">{t.card.ipPending}</span>
          )}
        </Fact>
        <Fact label={t.billing.title}>
          {price}
          {i.billing.nextDueAt && !i.billing.cancelAtPeriodEnd ? (
            <span className="block text-small text-fg-muted">
              {fmt(t.billing.nextDue, { date: fmtDate(i.billing.nextDueAt) })}
            </span>
          ) : null}
        </Fact>
      </dl>

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-small text-fg-muted">
        <li>{fmt(t.card.created, { date: fmtDate(i.createdAt) })}</li>
        {i.activatedAt ? (
          <li>{fmt(t.card.activated, { date: fmtDate(i.activatedAt) })}</li>
        ) : null}
        {i.suspendedAt && i.status === "suspended" ? (
          <li>{fmt(t.card.suspended, { date: fmtDate(i.suspendedAt) })}</li>
        ) : null}
        {i.canceledAt ? (
          <li>{fmt(t.card.canceled, { date: fmtDate(i.canceledAt) })}</li>
        ) : null}
        {i.deletedAt ? (
          <li>{fmt(t.card.deleted, { date: fmtDate(i.deletedAt) })}</li>
        ) : null}
      </ul>

      {i.billing.cancelAtPeriodEnd && live ? (
        <div className="mt-6 rounded-md border border-line-strong px-4 py-3">
          <p className="text-body font-medium text-fg">
            {t.billing.cancelRequested}
          </p>
          <p className="mt-1 text-small text-fg-muted">
            {cancelDate
              ? fmt(t.billing.cancelsOn, { date: cancelDate })
              : t.billing.cancelsNoDate}
          </p>
        </div>
      ) : null}

      {working ? (
        <ProgressList
          step={i.step}
          progress={stepProgress(i.step)}
          title={
            i.status === "reinstalling"
              ? t.progress.reinstalling
              : t.progress.provisioning
          }
          t={t}
        />
      ) : null}

      {i.status === "suspended" ? (
        <section
          aria-label={t.suspended.title}
          className="mt-6 rounded-md border border-accent-text px-4 py-4"
        >
          <h4 className="text-h4 text-accent-text">{t.suspended.title}</h4>
          <p className="mt-2 text-body text-fg">{t.suspended.text}</p>
          {owner ? (
            <form method="post" action="/api/billing/portal" className="mt-4">
              <input type="hidden" name="lang" value={lang} />
              <Button type="submit">{t.suspended.portal}</Button>
            </form>
          ) : (
            <p className="mt-3 text-small text-fg-muted">
              {t.suspended.ownerOnly}
            </p>
          )}
        </section>
      ) : null}

      {i.status === "canceled" ? (
        <section
          aria-label={t.canceled.title}
          className="mt-6 rounded-md border border-line-strong px-4 py-4"
        >
          <h4 className="text-h4 text-fg">{t.canceled.title}</h4>
          <p className="mt-2 text-body text-fg-muted">
            {i.retentionEndsAt
              ? fmt(t.canceled.text, { date: fmtDate(i.retentionEndsAt) })
              : t.canceled.textNoDate}
          </p>
        </section>
      ) : null}

      {i.status === "failed" ? (
        <section
          aria-label={t.failed.title}
          className="mt-6 rounded-md border border-accent-text px-4 py-4"
        >
          <h4 className="text-h4 text-accent-text">{t.failed.title}</h4>
          <p className="mt-2 text-body text-fg">{t.failed.text}</p>
          <div className="mt-4">
            <ButtonLink
              href={localizePath(lang, "/contact")}
              variant="secondary"
            >
              {t.failed.contact}
            </ButtonLink>
          </div>
        </section>
      ) : null}

      {i.status === "deleted" ? (
        <p className="mt-6 text-body text-fg-muted">{t.deleted.text}</p>
      ) : null}

      {showAccess && ssh ? (
        <section
          aria-label={t.access.title}
          className="mt-8 border-t border-line pt-6"
        >
          <h4 className="text-h4 text-fg">{t.access.title}</h4>
          <p className="mt-2 text-body text-fg">{t.access.intro}</p>
          <CommandLine command={ssh} copyLabel={t.access.commandCopy} t={t} />
          <p className="mt-3 text-small text-fg-muted">{t.access.noPassword}</p>

          <h5 className="mt-6 font-display text-body font-medium text-fg">
            {t.access.tunnel.title}
          </h5>
          <p className="mt-2 text-small text-fg-muted">
            {t.access.tunnel.text}
          </p>
          {ports.length > 0 ? (
            ports.map((p) => {
              const cmd = tunnelCommand(i.sshUser, i.ipv4, p.port);
              if (!cmd) return null;
              const label = lang === "fr" ? p.labelFr : p.labelEn;
              return (
                <div key={`${p.port}/${p.proto}`} className="mt-3">
                  <p className="text-small font-medium text-fg">
                    {fmt(t.access.tunnel.forPort, { label, port: p.port })}
                  </p>
                  <CommandLine
                    command={cmd}
                    copyLabel={t.access.tunnel.copy}
                    t={t}
                  />
                </div>
              );
            })
          ) : (
            <>
              <p className="mt-3 text-small text-fg-muted">
                {t.access.tunnel.generic}
              </p>
              {(() => {
                const cmd = genericTunnelCommand(i.sshUser, i.ipv4);
                return cmd ? (
                  <CommandLine
                    command={cmd}
                    copyLabel={t.access.tunnel.copy}
                    t={t}
                  />
                ) : null;
              })()}
            </>
          )}
          {publicPorts ? (
            <p className="mt-3 text-small text-fg-muted">
              {fmt(t.access.tunnel.publicPorts, { ports: publicPorts })}
            </p>
          ) : null}

          <h5 className="mt-6 font-display text-body font-medium text-fg">
            {t.access.file.title}
          </h5>
          <p className="mt-2 text-small text-fg-muted">
            {fmt(t.access.file.text, { file: ACCESS_FILE })}
          </p>

          <h5 className="mt-6 font-display text-body font-medium text-fg">
            {t.access.fingerprints.title}
          </h5>
          <dl className="mt-2 space-y-3">
            <div>
              <dt className="text-small text-fg-muted">
                {t.access.fingerprints.yourKey}
              </dt>
              <dd className="mt-1 break-all font-mono text-small text-fg">
                {i.sshKeyFingerprint}
              </dd>
            </div>
            <div>
              <dt className="text-small text-fg-muted">
                {t.access.fingerprints.hostKey}
              </dt>
              <dd className="mt-1 break-all font-mono text-small text-fg">
                {i.hostKeyFingerprint ?? (
                  <span className="font-sans text-fg-muted">
                    {t.access.fingerprints.hostKeyPending}
                  </span>
                )}
              </dd>
              <dd className="mt-1 text-small text-fg-muted">
                {t.access.fingerprints.hostKeyHint}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {i.status === "active" && !ssh ? (
        <p className="mt-6 text-small text-fg-muted">{t.access.unavailable}</p>
      ) : null}

      {live ? (
        <section
          aria-label={t.actions.title}
          className="mt-8 border-t border-line pt-6"
        >
          <h4 className="text-h4 text-fg">{t.actions.title}</h4>
          <div className="mt-4 flex flex-wrap gap-3">
            {actionButton("start")}
            {actionButton("stop")}
            {actionButton("reboot")}
            {actions.reinstall.visible ? (
              <Button
                variant="secondary"
                disabled={!actions.reinstall.enabled || busy !== null}
                aria-haspopup="dialog"
                aria-label={fmt(t.actions.forVps, {
                  action: t.actions.reinstall,
                  name: i.hostname,
                })}
                onClick={() => {
                  setError(null);
                  setDialog("reinstall");
                }}
              >
                {t.actions.reinstall}
              </Button>
            ) : null}
            {actions.cancel.visible ? (
              <Button
                variant="secondary"
                disabled={!actions.cancel.enabled || busy !== null}
                aria-haspopup="dialog"
                aria-label={fmt(t.actions.forVps, {
                  action: t.actions.cancel,
                  name: i.hostname,
                })}
                onClick={() => {
                  setError(null);
                  setDialog("cancel");
                }}
              >
                {t.actions.cancel}
              </Button>
            ) : null}
          </div>
          {i.status === "suspended" ? (
            <p className="mt-3 text-small text-fg-muted">
              {t.actions.suspendedNote}
            </p>
          ) : null}
          {!owner ? (
            <p className="mt-3 text-small text-fg-muted">
              {t.actions.ownerOnly}
            </p>
          ) : null}
          <p
            role="status"
            className={notice ? "mt-3 text-small text-fg" : "sr-only"}
          >
            {notice}
          </p>
          {error && dialog === null ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-accent-text px-4 py-3 text-small text-accent-text"
            >
              {error}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 border-t border-line pt-6">
        <details open={working || i.status === "failed"}>
          <summary className="min-h-11 cursor-pointer py-2 font-display text-h4 text-fg">
            {t.journal.title}
          </summary>
          <Journal lang={lang} events={i.events} t={t} />
        </details>
      </section>

      <ConfirmDialog
        open={dialog === "reinstall"}
        onClose={() => setDialog((d) => (d === "reinstall" ? null : d))}
        title={t.dialog.reinstall.title}
        confirmLabel={
          busy === "reinstall" ? t.actions.working : t.dialog.reinstall.submit
        }
        cancelLabel={t.dialog.cancelButton}
        busy={busy !== null}
        error={dialog === "reinstall" ? error : null}
        acknowledge={{
          label: t.dialog.reinstall.ack,
          requiredMessage: t.dialog.reinstall.ackRequired,
        }}
        onConfirm={async () => {
          if (await run("reinstall", true)) setDialog(null);
        }}
      >
        <p className="font-medium">{t.dialog.reinstall.warning}</p>
        <p className="text-fg-muted">{t.dialog.reinstall.unavailable}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "cancel"}
        onClose={() => setDialog((d) => (d === "cancel" ? null : d))}
        title={t.dialog.cancel.title}
        confirmLabel={
          busy === "cancel" ? t.actions.working : t.dialog.cancel.submit
        }
        cancelLabel={t.dialog.cancelButton}
        busy={busy !== null}
        error={dialog === "cancel" ? error : null}
        onConfirm={async () => {
          if (await run("cancel", true)) setDialog(null);
        }}
      >
        <p>
          {cancelDate
            ? fmt(t.dialog.cancel.text, { date: cancelDate })
            : t.dialog.cancel.textNoDate}
        </p>
      </ConfirmDialog>
    </Card>
  );
}
