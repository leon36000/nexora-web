import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { lang as getLang } from "next/root-params";
import { AuthShell } from "@/components/account/auth-shell";
import { SignupForm } from "@/components/account/signup-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/inscription",
    title: t.meta.signup,
    description: t.signup.lead,
    siteName: "Nexora",
    noindex: true,
  });
}

export default async function SignupPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell
      title={t.signup.title}
      lead={t.signup.lead}
      footer={{
        text: t.signup.haveAccount,
        href: localizePath(lang, "/compte/connexion"),
        label: t.signup.loginLink,
      }}
    >
      <Suspense fallback={null}>
        <SignupForm lang={lang} t={t.signup} common={t.common} />
      </Suspense>
    </AuthShell>
  );
}
