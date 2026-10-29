"use client";

import type { PrivacyLevel } from "@nexora/db";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { cn } from "@/lib/cn";
import {
  DETECTOR_CATEGORIES,
  type DetectorCategory,
} from "@/server/privacy/detectors";
import type { PrivacyView } from "@/server/privacy/view";
import { INPUT_CLASS, Notice } from "./field";
import {
  PanelHeading,
  ScrollRegion,
  SectionTitle,
  StatCard,
  TD,
  TH,
} from "./panel-ui";
import {
  draftFromView,
  type PrivacyDraft,
  requestFromDraft,
  withLevel,
} from "./privacy-logic";

type PrivacyText = AccountDictionary["panel"]["privacy"];

const LEVELS: readonly PrivacyLevel[] = ["standard", "renforce", "souverain"];
const CHECKBOX = "size-5 shrink-0 accent-accent";

export interface PrivacyPanelProps {
  t: AccountDictionary;
  view: PrivacyView;
  /** Propriétaire de l'organisation : peut modifier la politique et exporter le rapport. */
  canEdit: boolean;
  /** Mois proposés pour le rapport, du plus récent au plus ancien (AAAA-MM). */
  months: string[];
  /** Dates déjà formatées dans la langue de la page, une par version de `view.versions`. */
  versionDates: string[];
}

function errorText(p: PrivacyText, code: string | undefined): string {
  return (p.errors as Record<string, string>)[code ?? ""] ?? p.errors.generic;
}

/** Page « Confidentialité » du panneau client : niveau, genres reconnus, listes, décisions récentes, rapport. */
export function PrivacyPanel({
  t,
  view,
  canEdit,
  months,
  versionDates,
}: PrivacyPanelProps) {
  const p = t.panel.privacy;
  const router = useRouter();
  const [draft, setDraft] = useState<PrivacyDraft>(() => draftFromView(view));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    tone: "error" | "success" | "info";
    text: string;
  } | null>(null);

  const set = <K extends keyof PrivacyDraft>(key: K, value: PrivacyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setCategory = (
    group: "mask" | "deny",
    category: DetectorCategory,
    value: boolean,
  ) =>
    setDraft((d) => ({
      ...d,
      [group]: { ...d[group], [category]: value },
    }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/account/privacy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestFromDraft(draft)),
      });
      const json = (await res.json().catch(() => ({}))) as {
        version?: number;
        changed?: boolean;
        error?: string;
      };
      if (!res.ok || typeof json.version !== "number") {
        setStatus({ tone: "error", text: errorText(p, json.error) });
        return;
      }
      setStatus(
        json.changed
          ? {
              tone: "success",
              text: fmt(p.saved, { version: json.version }),
            }
          : { tone: "info", text: p.unchanged },
      );
      router.refresh();
    } catch {
      setStatus({ tone: "error", text: p.errors.generic });
    } finally {
      setBusy(false);
    }
  }

  const counts = view.recent.counts;
  return (
    <div>
      <PanelHeading id="privacy-title" title={p.title} lead={p.lead} />

      <div className="mt-6 space-y-3" aria-live="polite">
        {view.invalid ? (
          <Notice tone="error">{p.current.invalid}</Notice>
        ) : null}
        {!canEdit ? <Notice tone="info">{p.readOnly}</Notice> : null}
      </div>

      <Card
        as="section"
        aria-labelledby="privacy-current-title"
        className="mt-6"
      >
        <SectionTitle id="privacy-current-title">
          {p.current.title}
        </SectionTitle>
        <p className="mt-3 text-body text-fg">
          <strong className="font-medium">{p.level[view.level].name}</strong>
          {" · "}
          {view.isDefault
            ? p.current.isDefault
            : fmt(p.current.version, { version: view.version })}
        </p>
      </Card>

      <form onSubmit={submit} className="mt-8 space-y-8" noValidate>
        <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-3">
          <legend className="text-h4 text-fg">{p.level.legend}</legend>
          <div className="mt-3 grid gap-3">
            {LEVELS.map((level) => (
              <label
                key={level}
                className={cn(
                  "flex gap-3 rounded-md border border-line-strong bg-bg p-4",
                  canEdit && "cursor-pointer hover:bg-surface",
                  "has-[:checked]:border-accent-text has-[:checked]:bg-surface has-[:checked]:ring-1 has-[:checked]:ring-accent-text",
                )}
              >
                <input
                  type="radio"
                  name="privacy-level"
                  value={level}
                  checked={draft.level === level}
                  onChange={() => setDraft((d) => withLevel(d, level))}
                  className="mt-1 size-4 shrink-0 accent-accent"
                />
                <span className="block min-w-0 flex-1">
                  <span className="block font-medium text-fg">
                    {p.level[level].name}
                  </span>
                  <span className="mt-1 block text-small text-fg-muted">
                    {p.level[level].text}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={!canEdit || busy} className="min-w-0">
          <legend className="text-h4 text-fg">{p.categories.legend}</legend>
          <p className="mt-3 max-w-2xl text-small text-fg-muted">
            {p.categories.lead}
          </p>
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {DETECTOR_CATEGORIES.map((category) => {
              const always = category === "secret";
              const label = p.categories.items[category];
              return (
                <li
                  key={category}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3"
                >
                  <span className="min-w-0 text-body text-fg">{label}</span>
                  <span className="flex items-center gap-6">
                    <label className="flex min-h-11 items-center gap-2 text-small text-fg">
                      <input
                        type="checkbox"
                        checked={always || draft.mask[category]}
                        disabled={always}
                        onChange={(e) =>
                          setCategory("mask", category, e.target.checked)
                        }
                        aria-label={`${p.categories.mask} : ${label}`}
                        className={CHECKBOX}
                      />
                      {always ? p.categories.always : p.categories.mask}
                    </label>
                    {always ? null : (
                      <label className="flex min-h-11 items-center gap-2 text-small text-fg">
                        <input
                          type="checkbox"
                          checked={draft.mask[category] && draft.deny[category]}
                          disabled={!draft.mask[category]}
                          onChange={(e) =>
                            setCategory("deny", category, e.target.checked)
                          }
                          aria-label={`${p.categories.deny} : ${label}`}
                          className={CHECKBOX}
                        />
                        {p.categories.deny}
                      </label>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset disabled={!canEdit || busy} className="min-w-0 space-y-5">
          <legend className="text-h4 text-fg">{p.lists.legend}</legend>
          <p className="max-w-2xl text-small text-fg-muted">{p.lists.lead}</p>
          {(
            [
              [
                "allowedModels",
                p.lists.allowedModels,
                p.lists.allowedModelsHint,
              ],
              ["allowedHosts", p.lists.allowedHosts, p.lists.allowedHostsHint],
              ["blockedHosts", p.lists.blockedHosts, p.lists.blockedHostsHint],
            ] as const
          ).map(([name, label, hint]) => (
            <div key={name}>
              <label
                htmlFor={`privacy-${name}`}
                className="block text-small font-medium text-fg"
              >
                {label}
              </label>
              <textarea
                id={`privacy-${name}`}
                rows={4}
                value={draft[name]}
                onChange={(e) => set(name, e.target.value)}
                aria-describedby={`privacy-${name}-hint`}
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className={cn(INPUT_CLASS, "font-mono text-small")}
              />
              <p
                id={`privacy-${name}-hint`}
                className="mt-1.5 text-small text-fg-muted"
              >
                {hint}
              </p>
            </div>
          ))}
          <div className="flex gap-3">
            <input
              id="privacy-attachments"
              type="checkbox"
              checked={draft.blockAttachments}
              onChange={(e) => {
                set("blockAttachments", e.target.checked);
                set("attachmentsTouched", true);
              }}
              aria-describedby="privacy-attachments-hint"
              className={cn(CHECKBOX, "mt-0.5")}
            />
            <div>
              <label
                htmlFor="privacy-attachments"
                className="text-small font-medium text-fg"
              >
                {p.attachments.label}
              </label>
              <p
                id="privacy-attachments-hint"
                className="mt-1 text-small text-fg-muted"
              >
                {p.attachments.hint}
              </p>
            </div>
          </div>
        </fieldset>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={busy}>
              {busy ? p.saving : p.save}
            </Button>
            <div aria-live="polite">
              {status ? (
                <Notice tone={status.tone}>{status.text}</Notice>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>

      <section aria-labelledby="privacy-recent-title" className="mt-12">
        <SectionTitle id="privacy-recent-title">
          {fmt(p.recent.title, { days: view.recent.days })}
        </SectionTitle>
        <p className="mt-2 text-small text-fg-muted">{p.recent.lead}</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <StatCard label={p.recent.allow} value={counts.allow} />
          <StatCard label={p.recent.mask} value={counts.mask} />
          <StatCard label={p.recent.deny} value={counts.deny} />
        </dl>
      </section>

      {canEdit ? (
        <section aria-labelledby="privacy-report-title" className="mt-12">
          <SectionTitle id="privacy-report-title">
            {p.report.title}
          </SectionTitle>
          <p className="mt-2 max-w-2xl text-small text-fg-muted">
            {p.report.lead}
          </p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {months.map((month) => (
              <li key={month}>
                <a
                  href={`/api/account/privacy/report?month=${month}`}
                  download
                  className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-5 text-[0.9375rem] font-medium text-fg hover:bg-fg/10"
                >
                  {fmt(p.report.download, { month })}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="privacy-history-title" className="mt-12">
        <SectionTitle id="privacy-history-title">
          {p.history.title}
        </SectionTitle>
        {view.versions.length === 0 ? (
          <p className="mt-3 text-fg-muted">{p.history.empty}</p>
        ) : (
          <div className="mt-4">
            <ScrollRegion label={p.history.caption}>
              <table className="w-full min-w-96 text-left text-small">
                <caption className="sr-only">{p.history.caption}</caption>
                <thead className="border-b border-line text-fg-muted">
                  <tr>
                    <th scope="col" className={TH}>
                      {p.history.columns.version}
                    </th>
                    <th scope="col" className={TH}>
                      {p.history.columns.level}
                    </th>
                    <th scope="col" className={TH}>
                      {p.history.columns.date}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {view.versions.map((v, i) => (
                    <tr key={v.version}>
                      <td className={cn(TD, "tabular-nums")}>
                        {v.version}
                        {v.current ? ` (${p.history.current})` : ""}
                      </td>
                      <td className={TD}>{p.level[v.level].name}</td>
                      <td className={TD}>{versionDates[i] ?? v.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        )}
      </section>

      <section aria-labelledby="privacy-limits-title" className="mt-12">
        <SectionTitle id="privacy-limits-title">{p.limits.title}</SectionTitle>
        <p className="mt-3 max-w-2xl text-body text-fg-muted">
          {p.limits.text}
        </p>
      </section>
    </div>
  );
}
