"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountDictionary } from "@/i18n/account";
import { Field, Notice } from "./field";

type Text = AccountDictionary["panel"]["billing"]["alert"];

/** Réglage de l'alerte de solde bas : une case et un seuil en dollars, enregistrés par `PUT /api/account/balance-alert`. */
export function BalanceAlertForm({
  t,
  initialEnabled,
  initialThresholdCad,
}: {
  t: Text;
  initialEnabled: boolean;
  /** Seuil actuel en dollars, texte brut (« 10 » ou « 12,50 ») ; vide sans alerte. */
  initialThresholdCad: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [threshold, setThreshold] = useState(initialThresholdCad);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account/balance-alert", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, thresholdCad: threshold }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          (t.errors as Record<string, string>)[json.error ?? ""] ??
            t.errors.generic,
        );
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(t.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
      <label className="flex min-h-11 items-center gap-3 text-body text-fg">
        <input
          type="checkbox"
          className="size-5"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {t.enabled}
      </label>
      <div className="max-w-48">
        <Field
          id="alert-threshold"
          name="thresholdCad"
          label={t.threshold}
          hint={t.thresholdHint}
          inputMode="decimal"
          autoComplete="off"
          required
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? t.saving : t.save}
        </Button>
        <span role="status" className="text-small text-fg">
          {saved ? t.saved : ""}
        </span>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </form>
  );
}
