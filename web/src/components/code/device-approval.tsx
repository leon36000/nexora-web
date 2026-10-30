"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/account/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { fmt } from "@/i18n/account";
import type { CodeDeviceDictionary } from "@/i18n/code-device";
import { type Lang, localizePath } from "@/i18n/config";

type Phase = "idle" | "working" | "approved" | "denied";

/**
 * Boutons Autoriser / Refuser de la page `/code/device`. L'appel part du navigateur de la personne (session et en-tête
 * `Origin` du site : contrôle d'origine côté serveur) ; le code d'utilisateur n'est ni écrit dans le stockage du
 * navigateur ni envoyé ailleurs qu'à `/api/code/device/approve`.
 */
export function DeviceApproval({
  lang,
  t,
  userCode,
  deviceName,
  organization,
}: {
  lang: Lang;
  t: CodeDeviceDictionary;
  userCode: string;
  deviceName: string;
  organization: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "deny") {
    if (phase === "working") return;
    setPhase("working");
    setError(null);
    try {
      const res = await fetch("/api/code/device/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: userCode, decision }),
      });
      if (res.ok) {
        setPhase(decision === "approve" ? "approved" : "denied");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string };
      };
      const code = body.error?.code ?? "";
      setError((t.errors as Record<string, string>)[code] ?? t.errors.generic);
    } catch {
      setError(t.errors.generic);
    }
    setPhase("idle");
  }

  if (phase === "approved" || phase === "denied")
    return (
      <div className="space-y-5">
        <Notice tone={phase === "approved" ? "success" : "info"}>
          {phase === "approved" ? t.done.approved : t.done.denied}
        </Notice>
        <p className="text-small text-fg-muted">{t.done.back}</p>
        <ButtonLink href={localizePath(lang, "/compte")} variant="link">
          {t.done.panel}
        </ButtonLink>
      </div>
    );

  const [before, after] = t.confirm.revoke.split("{link}");
  return (
    <div className="space-y-6">
      <section aria-labelledby="device-allows-title">
        <h2 id="device-allows-title" className="text-small font-medium text-fg">
          {t.confirm.allowsTitle}
        </h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-small text-fg-muted">
          <li>{fmt(t.confirm.allows, { organization })}</li>
          <li>{t.confirm.notAllows}</li>
          <li>
            {fmt(before ?? "", { device: deviceName })}
            <Link
              href={localizePath(lang, "/compte/modeles")}
              className="text-accent-text underline underline-offset-4"
            >
              {t.confirm.revokeLink}
            </Link>
            {fmt(after ?? "", { device: deviceName })}
          </li>
        </ul>
      </section>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => decide("approve")}
          disabled={phase === "working"}
        >
          {phase === "working" ? t.confirm.working : t.confirm.approve}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => decide("deny")}
          disabled={phase === "working"}
        >
          {t.confirm.deny}
        </Button>
      </div>
    </div>
  );
}
