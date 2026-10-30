"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { type AccountDictionary, fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import { Notice } from "./field";
import { formatBytes } from "./format-bytes";

type CodeText = AccountDictionary["panel"]["code"];

type Status = "stopped" | "starting" | "ready" | "error";
interface Workspace {
  status: Status;
  usedBytes: number;
  openUrl: string | null;
}

const POLL_MS = 3000;

const errorText = (t: CodeText, code: string | undefined) =>
  (t.workspace.errors as Record<string, string>)[code ?? ""] ??
  t.workspace.errors.generic;

/**
 * État de l'environnement Nexora Code de la personne, et ses deux gestes : démarrer, ouvrir. Tant que l'environnement
 * démarre, l'état est relu toutes les trois secondes (et seulement alors) ; le changement est annoncé par une zone
 * `role="status"`. L'adresse d'ouverture vient du serveur, qui n'en rend jamais une dangereuse.
 */
export function CodeWorkspaceControls({
  lang,
  t,
  initial,
}: {
  lang: Lang;
  t: CodeText;
  initial: Workspace;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const polling = workspace.status === "starting";
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/account/code/workspace", {
          cache: "no-store",
        });
        if (!res.ok || !mounted.current) return;
        const next = (await res.json()) as Workspace;
        if (mounted.current) {
          setWorkspace(next);
          if (next.status !== "starting") router.refresh();
        }
      } catch {
        // Une lecture ratée n'arrête pas l'attente : la suivante reprendra.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling, router]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/code/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as Partial<Workspace> & {
        error?: string;
      };
      if (!res.ok || !json.status) {
        setError(errorText(t, json.error));
        return;
      }
      setWorkspace({
        status: json.status,
        usedBytes: json.usedBytes ?? 0,
        openUrl: json.openUrl ?? null,
      });
    } catch {
      setError(t.workspace.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const w = t.workspace;
  const text = {
    stopped: w.stoppedText,
    starting: w.startingText,
    ready: w.readyText,
    error: w.errorText,
  }[workspace.status];

  return (
    <div>
      <p className="text-small text-fg-muted">{w.statusLabel}</p>
      <p
        className="mt-1 font-display text-h3 text-fg"
        data-testid="workspace-status"
        data-status={workspace.status}
      >
        {w.status[workspace.status]}
      </p>
      <p role="status" className="mt-2 max-w-xl text-small text-fg-muted">
        {text}
      </p>
      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {workspace.status === "ready" && workspace.openUrl ? (
          <ButtonLink href={workspace.openUrl} arrow>
            {w.open}
          </ButtonLink>
        ) : workspace.status === "starting" ? (
          <Button disabled>{w.working}</Button>
        ) : (
          <Button onClick={start} disabled={busy} arrow>
            {busy ? w.working : w.start}
          </Button>
        )}
      </div>
      <p className="mt-6 text-small text-fg" data-testid="workspace-volume">
        {fmt(w.volume, { used: formatBytes(lang, workspace.usedBytes) })}
      </p>
    </div>
  );
}
