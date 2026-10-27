"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import type { AccountDictionary } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { Field, Notice } from "./field";

type Props = {
  lang: Lang;
  t: AccountDictionary["reset"];
  common: AccountDictionary["common"];
};

export function ResetForm({ lang, t, common }: Props) {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof t.errors | null>(
    params.get("error") ? "invalidToken" : null,
  );
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return setError("invalidToken");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setBusy(false);
    if (!err) return setDone(true);
    if (err.code === "PASSWORD_TOO_SHORT") setError("weak");
    else if (err.status === 400) setError("invalidToken");
    else setError("generic");
  }

  if (done) {
    return (
      <div className="space-y-5">
        <Notice tone="success">{t.done}</Notice>
        <ButtonLink href={localizePath(lang, "/compte/connexion")} arrow>
          {t.goLogin}
        </ButtonLink>
      </div>
    );
  }

  if (!token || error === "invalidToken") {
    return (
      <div className="space-y-5">
        <Notice tone="error">{t.errors.invalidToken}</Notice>
        <Link
          href={localizePath(lang, "/compte/mot-de-passe-oublie")}
          className="inline-block text-small text-accent-text underline underline-offset-4"
        >
          {t.askAgain}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field
        id="password"
        label={t.password}
        type="password"
        autoComplete="new-password"
        minLength={12}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <Notice tone="error">{t.errors[error]}</Notice> : null}
      <Button type="submit" disabled={busy} arrow>
        {busy ? common.working : t.submit}
      </Button>
    </form>
  );
}
