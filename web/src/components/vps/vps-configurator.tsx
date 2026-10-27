"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { INPUT_CLASS } from "@/components/account/field";
import { CodeBlock } from "@/components/gateway/code-samples";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { cn } from "@/lib/cn";
import { DevBadge } from "./dev-badge";
import {
  buildCheckoutBody,
  checkSshKeyInput,
  formatCents,
  formatGb,
  formatMemory,
  isRedirectableUrl,
  isValidHostname,
  monthlyEquivalentCents,
  type OrderErrorKey,
  orderErrorKey,
  planFitsApp,
  resolveSelection,
  type Selection,
  selectionQuery,
  type Term,
  termPriceCents,
} from "./logic";

/** Données minimales du catalogue passées au client (déjà localisées : pas de texte à choisir ici). */
export interface ConfiguratorPlan {
  code: string;
  name: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
  highlighted: boolean;
  sort: number;
  isDevSample: boolean;
  regionLabel: string;
}
export interface ConfiguratorApp {
  code: string;
  name: string;
  tagline: string;
  version: string;
  minRamMb: number;
  sort: number;
  kind: "installable" | "guide";
}

type FieldError = "key_empty" | "key_private" | "key_multiple";
type ErrorKey = OrderErrorKey | FieldError;

const FIELD_ERRORS: Record<string, FieldError> = {
  empty: "key_empty",
  private_key: "key_private",
  multiple_lines: "key_multiple",
};

const KEY_ERRORS = new Set<ErrorKey>([
  "invalid_ssh_key",
  "key_empty",
  "key_private",
  "key_multiple",
]);

/** Identifiant de demande : UUID si le navigateur le permet (HTTPS ou localhost), sinon 32 hexadécimaux. */
function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function Choice({
  name,
  value,
  checked,
  disabled,
  onChange,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex gap-3 rounded-md border p-4",
        disabled
          ? "cursor-not-allowed border-dashed border-line bg-transparent"
          : "cursor-pointer border-line-strong bg-bg hover:bg-surface has-[:checked]:border-accent-text has-[:checked]:bg-surface has-[:checked]:ring-1 has-[:checked]:ring-accent-text",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-accent"
      />
      <span className="block min-w-0 flex-1">{children}</span>
    </label>
  );
}

/**
 * Configurateur de commande : plan -> application -> durée -> clé SSH publique -> « Commander ».
 * Les radios sont natives (flèches du clavier, groupes nommés) ; les choix impossibles sont désactivés avec
 * leur raison écrite. La sélection est reflétée dans l'adresse (`plan`, `app`, `term`) pour survivre à la
 * connexion. La clé privée ne quitte jamais le navigateur (contrôle avant l'envoi).
 */
export function VpsConfigurator({
  lang,
  plans,
  apps,
  initial,
  t,
  common,
  units,
  links,
}: {
  lang: Lang;
  plans: readonly ConfiguratorPlan[];
  apps: readonly ConfiguratorApp[];
  initial: Selection;
  t: VpsDictionary["configurator"];
  common: VpsDictionary["common"];
  units: VpsDictionary["units"];
  links: { login: string; signup: string };
}) {
  const [sel, setSel] = useState<Selection>(initial);
  // L'adresse a changé côté serveur (clic sur un plan de la grille) : la sélection suit, la clé saisie reste.
  const initialKey = selectionQuery(initial);
  const [seenKey, setSeenKey] = useState(initialKey);
  if (seenKey !== initialKey) {
    setSeenKey(initialKey);
    setSel(initial);
  }
  const [sshKey, setSshKey] = useState("");
  const [hostname, setHostname] = useState("");
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const keyRef = useRef<HTMLTextAreaElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);

  const plan = plans.find((p) => p.code === sel.plan);
  const app = apps.find((a) => a.code === sel.app);
  const cents = plan ? termPriceCents(plan, sel.term) : null;
  const canOrder = Boolean(plan && app && cents !== null);

  const memory = (mb: number) => formatMemory(lang, mb, units);
  const priceOf = (p: ConfiguratorPlan, term: Term) => {
    const c = termPriceCents(p, term);
    if (c === null) return null;
    return `${formatCents(lang, c)} ${term === "month" ? common.perMonth : common.perYear}`;
  };

  function update(change: Partial<Selection>) {
    const next = resolveSelection({ ...sel, ...change }, plans, apps);
    setSel(next);
    setError(null);
    try {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${selectionQuery(next)}${window.location.hash}`,
      );
    } catch {
      // Adresse non modifiable (contexte restreint) : la sélection reste valable dans la page.
    }
  }

  function fail(key: ErrorKey, focus?: HTMLElement | null) {
    setError(key);
    setBusy(false);
    focus?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !plan || !app || cents === null) return;
    const problem = checkSshKeyInput(sshKey);
    if (problem)
      return fail(FIELD_ERRORS[problem] as FieldError, keyRef.current);
    if (!isValidHostname(hostname.trim()))
      return fail("invalid_hostname", hostRef.current);

    setBusy(true);
    setError(null);
    // Même demande -> même identifiant (un nouvel essai après une coupure ne crée pas une seconde commande) ;
    // dès que le contenu change, nouvel identifiant.
    const fingerprint = JSON.stringify([
      sel,
      sshKey.trim(),
      hostname.trim(),
      promo.trim(),
      lang,
    ]);
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, id: newRequestId() };
    const body = buildCheckoutBody({
      selection: sel,
      sshKey,
      hostname,
      promo,
      requestId: attempt.current.id,
      lang,
    });
    try {
      const response = await fetch("/api/vps/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data: unknown = await response.json().catch(() => null);
      const record =
        typeof data === "object" && data !== null
          ? (data as Record<string, unknown>)
          : {};
      if (response.ok) {
        if (isRedirectableUrl(record.url)) {
          window.location.assign(record.url);
          return;
        }
        return fail("generic");
      }
      const code = typeof record.error === "string" ? record.error : undefined;
      const key = orderErrorKey(response.status, code);
      return fail(key, KEY_ERRORS.has(key) ? keyRef.current : null);
    } catch {
      return fail("network");
    }
  }

  if (apps.length === 0) {
    return <p className="max-w-2xl text-body text-fg-muted">{t.noApps}</p>;
  }

  const keyError = error !== null && KEY_ERRORS.has(error);
  const hostError = error === "invalid_hostname";
  const promoError = error?.startsWith("promo_") === true;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={busy}
      className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start"
    >
      <div className="space-y-12">
        <fieldset>
          <legend className="text-h4 text-fg">{t.stepPlan}</legend>
          <p className="mt-1 text-small text-fg-muted">{t.planHint}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => {
              const fits = !app || planFitsApp(p, app);
              const price = priceOf(p, sel.term);
              const yearly = termPriceCents(p, "year");
              return (
                <Choice
                  key={p.code}
                  name="vps-plan"
                  value={p.code}
                  checked={sel.plan === p.code}
                  disabled={!fits}
                  onChange={() => update({ plan: p.code })}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-h4 text-fg">
                      {p.name}
                    </span>
                    {p.highlighted ? (
                      <Badge tone="outline">{common.suggested}</Badge>
                    ) : null}
                  </span>
                  {p.isDevSample ? (
                    <span className="mt-2 block">
                      <DevBadge>{common.devBadge}</DevBadge>
                    </span>
                  ) : null}
                  <span className="mt-1 block text-small text-fg-muted">
                    {fmt(t.specLine, {
                      vcpu: p.vcpu,
                      ram: memory(p.ramMb),
                      disk: formatGb(lang, p.diskGb, units.gb),
                    })}
                  </span>
                  <span className="mt-1 block text-small text-fg-muted">
                    {p.regionLabel}
                  </span>
                  <span className="mt-2 block text-body tabular-nums text-fg">
                    {price ?? t.termNotOffered}
                  </span>
                  {sel.term === "year" && yearly !== null ? (
                    <span className="block text-small text-fg-muted">
                      {fmt(common.yearEquivalent, {
                        price: formatCents(
                          lang,
                          monthlyEquivalentCents(yearly),
                        ),
                      })}
                    </span>
                  ) : null}
                  {!fits && app ? (
                    <span className="mt-2 block text-small text-fg-muted">
                      {fmt(t.tooSmall, { ram: memory(app.minRamMb) })}
                    </span>
                  ) : null}
                </Choice>
              );
            })}
          </div>
          {plans.length === 0 || !plan ? (
            <p className="mt-4 text-small text-fg-muted">
              {t.noCompatiblePlan}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="text-h4 text-fg">{t.stepApp}</legend>
          <p className="mt-1 text-small text-fg-muted">{t.appHint}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {apps.map((a) => (
              <Choice
                key={a.code}
                name="vps-app"
                value={a.code}
                checked={sel.app === a.code}
                onChange={() => update({ app: a.code })}
              >
                <span className="block font-display text-h4 text-fg">
                  {a.name}
                </span>
                {a.tagline ? (
                  <span className="mt-1 block text-small text-fg-muted">
                    {a.tagline}
                  </span>
                ) : null}
                <span className="mt-2 block text-small text-fg-muted">
                  {fmt(t.minRam, { ram: memory(a.minRamMb) })} · {a.version}
                </span>
              </Choice>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-h4 text-fg">{t.stepTerm}</legend>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(["month", "year"] as const).map((term) => {
              const c = plan ? termPriceCents(plan, term) : null;
              return (
                <Choice
                  key={term}
                  name="vps-term"
                  value={term}
                  checked={sel.term === term}
                  disabled={plan !== undefined && c === null}
                  onChange={() => update({ term })}
                >
                  <span className="block font-display text-h4 text-fg">
                    {term === "month" ? common.monthly : common.yearly}
                  </span>
                  <span className="mt-1 block text-small text-fg-muted">
                    {term === "month" ? t.termMonthlyLead : t.termYearlyLead}
                  </span>
                  <span className="mt-2 block text-body tabular-nums text-fg">
                    {c === null
                      ? t.termNotOffered
                      : term === "month"
                        ? `${formatCents(lang, c)} ${common.perMonth}`
                        : fmt(t.termYearlyTotal, {
                            total: formatCents(lang, c),
                          })}
                  </span>
                  {term === "year" && c !== null ? (
                    <span className="block text-small text-fg-muted">
                      {fmt(common.yearEquivalent, {
                        price: formatCents(lang, monthlyEquivalentCents(c)),
                      })}
                    </span>
                  ) : null}
                </Choice>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label htmlFor="vps-ssh-key" className="block text-h4 text-fg">
            {t.stepKey}
          </label>
          <p id="vps-ssh-key-hint" className="mt-1 text-small text-fg-muted">
            {t.keyHint}
          </p>
          <textarea
            ref={keyRef}
            id="vps-ssh-key"
            name="sshKey"
            rows={3}
            value={sshKey}
            onChange={(e) => {
              setSshKey(e.target.value);
              if (keyError) setError(null);
            }}
            placeholder={t.keyPlaceholder}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            required
            aria-required="true"
            aria-invalid={keyError}
            aria-describedby={
              keyError ? "vps-ssh-key-hint vps-error" : "vps-ssh-key-hint"
            }
            className={cn(
              INPUT_CLASS,
              "resize-y font-mono text-[0.8125rem] leading-relaxed",
            )}
          />
          <details className="group mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-xs text-small text-accent-text underline underline-offset-4">
              {t.keygenSummary}
            </summary>
            <div className="mt-2 max-w-2xl space-y-3 text-small text-fg-muted">
              <p>{t.keygenIntro}</p>
              <CodeBlock code={t.keygenCommand} label={t.keygenCommand} />
              <p>{t.keygenShow}</p>
              <CodeBlock
                code={t.keygenShowCommand}
                label={t.keygenShowCommand}
              />
              <p>{t.keygenPrivate}</p>
            </div>
          </details>
        </div>

        <div className="max-w-md">
          <label
            htmlFor="vps-hostname"
            className="block text-small font-medium text-fg"
          >
            {t.hostnameLabel}
            <span className="ml-2 font-normal text-fg-muted">
              ({t.hostnameOptional})
            </span>
          </label>
          <input
            ref={hostRef}
            id="vps-hostname"
            name="hostname"
            type="text"
            value={hostname}
            onChange={(e) => {
              setHostname(e.target.value);
              if (hostError) setError(null);
            }}
            maxLength={40}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            aria-invalid={hostError}
            aria-describedby={
              hostError ? "vps-hostname-hint vps-error" : "vps-hostname-hint"
            }
            className={INPUT_CLASS}
          />
          <p id="vps-hostname-hint" className="mt-1.5 text-small text-fg-muted">
            {t.hostnameHint}
          </p>
        </div>

        <div className="max-w-md">
          <label
            htmlFor="vps-promo"
            className="block text-small font-medium text-fg"
          >
            {t.promoLabel}
            <span className="ml-2 font-normal text-fg-muted">
              ({t.promoOptional})
            </span>
          </label>
          <input
            id="vps-promo"
            name="promo"
            type="text"
            value={promo}
            onChange={(e) => {
              setPromo(e.target.value);
              if (promoError) setError(null);
            }}
            maxLength={60}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={t.promoPlaceholder}
            aria-invalid={promoError}
            aria-describedby={
              promoError ? "vps-promo-hint vps-error" : "vps-promo-hint"
            }
            className={INPUT_CLASS}
          />
          <p id="vps-promo-hint" className="mt-1.5 text-small text-fg-muted">
            {t.promoHint}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-line-strong bg-surface p-6 lg:sticky lg:top-24">
        <h3 className="font-display text-h4 text-fg">{t.summaryTitle}</h3>
        <dl className="mt-4 space-y-3 text-small">
          <div>
            <dt className="text-fg-muted">{t.summaryPlan}</dt>
            <dd className="mt-0.5 text-fg">
              {plan?.name ?? "—"}
              {plan?.isDevSample ? (
                <span className="mt-2 block">
                  <DevBadge>{common.devBadge}</DevBadge>
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t.summaryApp}</dt>
            <dd className="mt-0.5 text-fg">{app?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t.summaryTerm}</dt>
            <dd className="mt-0.5 text-fg">
              {sel.term === "month" ? common.monthly : common.yearly}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t.summaryLocation}</dt>
            <dd className="mt-0.5 text-fg">{plan?.regionLabel ?? "—"}</dd>
          </div>
        </dl>

        <div
          aria-live="polite"
          aria-atomic="true"
          className="mt-5 border-t border-line pt-5"
        >
          <p className="text-small text-fg-muted">{t.summaryTotal}</p>
          {cents !== null ? (
            <>
              <p className="mt-1 font-display text-h3 tabular-nums text-fg">
                {formatCents(lang, cents)}{" "}
                <span className="text-small font-normal text-fg-muted">
                  {sel.term === "month" ? common.perMonth : common.perYear}
                </span>
              </p>
              {sel.term === "year" ? (
                <p className="text-small text-fg-muted">
                  {fmt(common.yearEquivalent, {
                    price: formatCents(lang, monthlyEquivalentCents(cents)),
                  })}
                </p>
              ) : null}
              <p className="text-small text-fg-muted">{common.beforeTaxes}</p>
            </>
          ) : (
            <p className="mt-1 text-small text-fg-muted">{t.summaryEmpty}</p>
          )}
        </div>
        <p className="mt-4 text-small text-fg-muted">{common.taxes}</p>
        <p className="mt-2 text-small text-fg-muted">{common.renewal}</p>
        {plan?.isDevSample ? (
          <p className="mt-4 text-small font-medium text-accent-text">
            {t.devWarning}
          </p>
        ) : null}

        <div aria-live="assertive" aria-atomic="true" className="mt-5">
          {error ? (
            <div
              id="vps-error"
              className="rounded-md border border-accent-text px-4 py-3 text-small text-fg"
            >
              <p>{t.errors[error]}</p>
              {error === "unauthenticated" ? (
                <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  <Link
                    href={links.login}
                    className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4"
                  >
                    {t.loginLink}
                  </Link>
                  <Link
                    href={links.signup}
                    className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-4"
                  >
                    {t.signupLink}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          arrow={!busy}
          disabled={busy || !canOrder}
          className="mt-5 w-full"
        >
          {busy ? t.submitting : t.submit}
        </Button>
        <p className="mt-3 text-small text-fg-muted">{t.stripeNote}</p>
      </div>
    </form>
  );
}
