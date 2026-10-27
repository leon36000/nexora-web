import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { AuthPanel } from "@/components/account/auth-panel";
import { AuthShell } from "@/components/account/auth-shell";
import { LoginForm } from "@/components/account/login-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { getSecurityDictionary } from "@/i18n/security";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/connexion",
    title: t.meta.login,
    description: t.login.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

export default async function LoginPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell
      panel={<AuthPanel tagline={getDictionary(lang).footer.tagline} />}
      title={t.login.title}
      lead={t.login.lead}
      footer={{
        text: t.login.noAccount,
        href: localizePath(lang, "/compte/inscription"),
        label: t.login.signupLink,
      }}
    >
      <Suspense fallback={null}>
        <LoginForm
          lang={lang}
          t={t.login}
          common={t.common}
          security={getSecurityDictionary(lang)}
        />
      </Suspense>
    </AuthShell>
  );
}
