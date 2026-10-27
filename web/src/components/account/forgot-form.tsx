"use client";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountDictionary } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { Field, Notice } from "./field";
import { validateEmail } from "./validation";

type Props = {
  lang: Lang;
  t: AccountDictionary["forgot"];
  common: AccountDictionary["common"];
};

export function ForgotForm({ lang, t, common }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof t.errors | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: localizePath(lang, "/compte/reinitialiser"),
    });
    setBusy(false);
    if (!err) setDone(true);
    else setError(err.status === 429 ? "rateLimited" : "generic");
  }

  if (done) {
    return (
      <div className="space-y-5">
        <Notice tone="success">{t.done}</Notice>
        <Link
          href={localizePath(lang, "/compte/connexion")}
          className="inline-block text-small text-accent-text underline underline-offset-4"
        >
          {t.back}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field
        id="email"
        label={common.email}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {error ? <Notice tone="error">{t.errors[error]}</Notice> : null}
      <Button type="submit" disabled={busy} arrow>
        {busy ? common.working : t.submit}
      </Button>
    </form>
  );
}
