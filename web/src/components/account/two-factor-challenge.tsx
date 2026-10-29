"use client";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SecurityDictionary } from "@/i18n/security";
import { authClient } from "@/lib/auth-client";
import { resumesOAuth } from "@/lib/oauth-resume";
import { Field, Notice } from "./field";

/**
 * Étape de connexion à deux facteurs : le mot de passe a été accepté, aucune session n'existe encore. Code TOTP à
 * six chiffres, ou code de secours (à usage unique). L'appareil n'est jamais mémorisé (refusé côté serveur).
 */
export function TwoFactorChallenge({
  t,
  onDone,
}: {
  t: SecurityDictionary["challenge"];
  onDone: () => void;
}) {
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    keyof SecurityDictionary["challenge"]["errors"] | null
  >(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const value = code.replace(/\s+/g, "");
    const { data, error: err } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code: value })
      : await authClient.twoFactor.verifyTotp({ code: value });
    if (!err) {
      // Connexion unique : le client quitte la page pour reprendre l'autorisation de WorkStudio.
      if (resumesOAuth(data)) return;
      onDone();
      return;
    }
    setBusy(false);
    if (err.status === 429) setError("locked");
    else if (err.code === "INVALID_TWO_FACTOR_COOKIE") setError("expired");
    else if (err.status === 401 || err.status === 400) setError("invalid");
    else setError("generic");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <h2 className="text-h3 text-fg">{t.title}</h2>
      <p className="text-body text-fg-muted">{t.lead}</p>
      <Field
        id="two-factor-code"
        label={backup ? t.backupCode : t.code}
        inputMode={backup ? "text" : "numeric"}
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={backup ? 24 : 8}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      {error ? <Notice tone="error">{t.errors[error]}</Notice> : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" disabled={busy} arrow>
          {t.submit}
        </Button>
        <button
          type="button"
          onClick={() => {
            setBackup((b) => !b);
            setCode("");
            setError(null);
          }}
          className="text-small text-accent-text underline underline-offset-4"
        >
          {backup ? t.useApp : t.useBackup}
        </button>
      </div>
    </form>
  );
}
