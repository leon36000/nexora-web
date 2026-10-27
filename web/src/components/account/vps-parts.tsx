"use client";
import type { VpsStep } from "@nexora/db";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import type { AccountVpsDictionary } from "@/i18n/account-vps";
import type { Lang } from "@/i18n/config";
import { cn } from "@/lib/cn";
import type { AccountVpsEvent } from "@/server/vps/account";
import {
  formatDateTime,
  PROGRESS_STEPS,
  type Progress,
  type StateKey,
  stageState,
  stateTone,
} from "./vps-logic";

const TONE_BOX = {
  success: "border-success text-success",
  accent: "border-accent-text text-accent-text",
  muted: "border-line-strong text-fg-muted",
} as const;
const TONE_DOT = {
  success: "bg-success",
  accent: "bg-accent-text",
  muted: "bg-fg-muted",
} as const;

/**
 * Badge d'état : le libellé est toujours écrit (la couleur ne porte jamais seule l'information).
 * Le point pulse pendant une opération, sauf si l'utilisateur demande moins de mouvement.
 */
export function StateBadge({
  state,
  t,
}: {
  state: StateKey;
  t: AccountVpsDictionary;
}) {
  const tone = stateTone(state);
  const busy =
    state === "provisioning" ||
    state === "reinstalling" ||
    state === "starting" ||
    state === "stopping" ||
    state === "rebooting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xs border px-2.5 py-1 text-small font-medium",
        TONE_BOX[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          TONE_DOT[tone],
          busy && "motion-safe:animate-pulse",
        )}
      />
      <span className="sr-only">{t.stateLabel}&nbsp;: </span>
      {t.states[state]}
    </span>
  );
}

/** Bouton « copier » : annonce le résultat aux lecteurs d'écran, jamais de secret dans le presse-papiers. */
export function CopyButton({
  value,
  label,
  t,
}: {
  value: string;
  label: string;
  t: AccountVpsDictionary;
}) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 3000);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={copy} aria-label={label}>
        {state === "done" ? t.copy.done : t.copy.button}
      </Button>
      <span
        role="status"
        className={state === "failed" ? "text-small text-fg" : "sr-only"}
      >
        {state === "done"
          ? t.copy.done
          : state === "failed"
            ? t.copy.failed
            : ""}
      </span>
    </span>
  );
}

/** Une commande copiable dans une boîte de code qui se replie sur mobile (jamais de défilement horizontal). */
export function CommandLine({
  command,
  copyLabel,
  t,
}: {
  command: string;
  copyLabel: string;
  t: AccountVpsDictionary;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
      <code className="block min-w-0 flex-1 break-all rounded-md border border-line bg-bg px-3.5 py-2.5 font-mono text-small text-fg">
        {command}
      </code>
      <CopyButton value={command} label={copyLabel} t={t} />
    </div>
  );
}

function StageMark({ state }: { state: "done" | "current" | "todo" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(
        "size-4 shrink-0",
        state === "done" && "text-success",
        state === "current" && "text-accent-text",
        state === "todo" && "text-fg-muted",
      )}
    >
      {state === "done" ? (
        <path
          d="m3 8.5 3.2 3L13 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="square"
        />
      ) : state === "current" ? (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        </>
      ) : (
        <circle
          cx="8"
          cy="8"
          r="6.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      )}
    </svg>
  );
}

/** Barre et liste des étapes de préparation ou de réinstallation. */
export function ProgressList({
  step,
  progress,
  title,
  t,
}: {
  step: VpsStep;
  progress: Progress;
  title: string;
  t: AccountVpsDictionary;
}) {
  const current = Math.min(progress.index + 1, progress.total);
  return (
    <section aria-label={title} className="mt-6">
      <h4 className="text-h4 text-fg">{title}</h4>
      <div
        role="progressbar"
        aria-label={t.progress.stepsLabel}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.index}
        aria-valuetext={fmt(t.progress.bar, { current, total: progress.total })}
        className="mt-3 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-accent motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${Math.max(progress.percent, 4)}%` }}
        />
      </div>
      <ol className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {PROGRESS_STEPS.map((stage) => {
          const state = stageState(stage, step);
          return (
            <li
              key={stage}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-3 text-small",
                state === "todo" ? "text-fg-muted" : "text-fg",
                state === "current" && "font-medium",
              )}
            >
              <StageMark state={state} />
              <span>
                {t.progress.stages[stage]}
                <span className="sr-only"> ({t.progress[state]})</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Journal d'un VPS : libellé traduit par type d'événement, repli sur le message nettoyé. */
export function Journal({
  lang,
  events,
  t,
}: {
  lang: Lang;
  events: AccountVpsEvent[];
  t: AccountVpsDictionary;
}) {
  if (events.length === 0)
    return <p className="mt-3 text-small text-fg-muted">{t.journal.empty}</p>;
  const kinds = t.journal.kinds as Record<string, string>;
  const actors = t.journal.actors as Record<string, string>;
  return (
    <ol
      aria-label={t.journal.caption}
      className="mt-3 divide-y divide-line border-y border-line"
    >
      {events.map((e) => (
        <li
          key={e.id}
          className="grid gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_7rem]"
        >
          <time
            dateTime={e.createdAt.toISOString()}
            className="text-small tabular-nums text-fg-muted"
          >
            {formatDateTime(lang, e.createdAt)}
          </time>
          <span className="min-w-0 break-words text-small text-fg">
            {kinds[e.kind] ?? (e.message || "—")}
          </span>
          <span className="text-small text-fg-muted sm:text-right">
            {actors[e.actor] ?? ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
