"use client";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { type AccountDictionary, fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import { Field, Notice } from "./field";

type Props = {
  lang: Lang;
  t: AccountDictionary["signup"];
  common: AccountDictionary["common"];
};

export function SignupForm({ lang, t, common }: Props) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof t.errors | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    // `locale` et `company` sont des champs additionnels déclarés côté serveur.
    const body = {
      email,
      password,
      name,
      locale: lang,
      company: company || undefined,
      callbackURL: localizePath(lang, "/compte/verification"),
    } as Parameters<typeof authClient.signUp.email>[0];
    const { error: err } = await authClient.signUp.email(body);
    setBusy(false);
    if (!err) {
      setDoneEmail(email);
      return;
    }
    if (err.status === 429) setError("rateLimited");
    else if (err.code === "PASSWORD_TOO_SHORT") setError("weak");
    else if (err.code === "INVALID_EMAIL") setError("invalidEmail");
    else setError("generic");
  }

  if (doneEmail) {
    return (
      <div role="status" className="space-y-4">
        <h2 className="text-h3 text-fg">{t.done.title}</h2>
        <p className="text-body text-fg">
          {fmt(t.done.text, { email: doneEmail })}
        </p>
        <p className="text-small text-fg-muted">{t.done.note}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field
        id="name"
        label={t.name}
        autoComplete="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        id="company"
        label={t.company}
        optionalLabel={common.optional}
        hint={t.companyHint}
        autoComplete="organization"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
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
        autoComplete="new-password"
        minLength={10}
        required
        hint={t.passwordHint}
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
