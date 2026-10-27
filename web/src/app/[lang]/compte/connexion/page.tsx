import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { AuthShell } from "@/components/account/auth-shell";
import { LoginForm } from "@/components/account/login-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/connexion",
    title: t.meta.login,
    description: t.login.lead,
    siteName: "Nexora",
    noindex: true,
  });
}

export default async function LoginPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell
      title={t.login.title}
      lead={t.login.lead}
      footer={{
        text: t.login.noAccount,
        href: localizePath(lang, "/compte/inscription"),
        label: t.login.signupLink,
      }}
    >
      <LoginForm lang={lang} t={t.login} common={t.common} />
    </AuthShell>
  );
}
