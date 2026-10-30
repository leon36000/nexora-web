"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AccountDictionary } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { SecurityDictionary } from "@/i18n/security";
import { authClient } from "@/lib/auth-client";
import { resumesOAuth } from "@/lib/oauth-resume";
import { parseOffer, withOffer } from "@/lib/offer-param";
import { safeNextPath } from "@/lib/safe-next";
import { Field, Notice } from "./field";
import { TwoFactorChallenge } from "./two-factor-challenge";

type Props = {
  lang: Lang;
  t: AccountDictionary["login"];
  common: AccountDictionary["common"];
  security: SecurityDictionary;
};

export function LoginForm({ lang, t, common, security }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const offer = parseOffer(params.get("offre"));
  // Retour vers la page d'autorisation d'un appareil Nexora Code (seule destination admise, voir lib/safe-next.ts).
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<keyof typeof t.errors | null>(null);
  const [resent, setResent] = useState(false);
  const [secondFactor, setSecondFactor] = useState(false);

  const enter = () => {
    router.push(next ?? withOffer(localizePath(lang, "/compte"), offer));
    router.refresh();
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResent(false);
    const { data, error: err } = await authClient.signIn.email({
      email,
      password,
    });
    if (!err) {
      // Double authentification activée : aucune session tant que le second facteur n'est pas validé.
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
        setSecondFactor(true);
        setBusy(false);
        return;
      }
      // Connexion unique : le client quitte la page pour reprendre l'autorisation de WorkStudio.
      if (resumesOAuth(data)) return;
      enter();
      return;
    }
    setBusy(false);
    if (err.code === "ACCOUNT_TEMPORARILY_LOCKED") setError("locked");
    else if (err.status === 429) setError("rateLimited");
    else if (err.status === 403) setError("unverified");
    else if (err.status === 401 || err.status === 400) setError("invalid");
    else setError("generic");
  }

  async function resend() {
    await authClient.sendVerificationEmail({
      email,
      callbackURL: withOffer(localizePath(lang, "/compte/verification"), offer),
    });
    setResent(true);
  }

  if (secondFactor)
    return <TwoFactorChallenge t={security.challenge} onDone={enter} />;

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
