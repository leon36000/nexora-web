"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountDictionary } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { Field, Notice } from "./field";

type Props = {
  lang: Lang;
  t: AccountDictionary["login"];
  common: AccountDictionary["common"];
};

export function LoginForm({ lang, t, common }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof t.errors | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResent(false);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (!err) {
      router.push(localizePath(lang, "/compte"));
      router.refresh();
      return;
    }
    setBusy(false);
    if (err.status === 429) setError("rateLimited");
    else if (err.status === 403) setError("unverified");
    else if (err.status === 401 || err.status === 400) setError("invalid");
    else setError("generic");
  }

  async function resend() {
    await authClient.sendVerificationEmail({
      email,
      callbackURL: localizePath(lang, "/compte/verification"),
    });
    setResent(true);
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
      <Field
        id="password"
        label={common.password}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error ? <Notice tone="error">{t.errors[error]}</Notice> : null}
      {resent ? <Notice tone="success">{t.resent}</Notice> : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="submit" disabled={busy} arrow>
          {busy ? common.working : t.submit}
        </Button>
        <Link
          href={localizePath(lang, "/compte/mot-de-passe-oublie")}
          className="text-small text-accent-text underline underline-offset-4"
        >
          {t.forgot}
        </Link>
      </div>
      {error === "unverified" && email ? (
        <button
          type="button"
          onClick={resend}
          className="text-small text-accent-text underline underline-offset-4"
        >
          {t.resend}
        </button>
      ) : null}
    </form>
  );
}
