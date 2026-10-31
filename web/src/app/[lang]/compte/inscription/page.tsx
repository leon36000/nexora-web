import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { AuthPanel } from "@/components/account/auth-panel";
import { AuthShell } from "@/components/account/auth-shell";
import { SignupForm } from "@/components/account/signup-form";
import { SignupIntro } from "@/components/account/signup-intro";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { publishedPageHref } from "@/lib/chrome";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getAlternates } from "@/server/cms/read";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/inscription",
    title: t.meta.signup,
    description: t.signup.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

export default async function SignupPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  // Conditions et confidentialité sont des pages de Directus : sans publication, pas de lien (jamais de 404).
  const alternates = await getAlternates();
  const links = {
    pricing: localizePath(lang, "/tarifs"),
    terms: publishedPageHref(alternates, lang, "/conditions"),
    privacy: publishedPageHref(alternates, lang, "/confidentialite"),
  };
  return (
    <AuthShell
      panel={<AuthPanel tagline={getDictionary(lang).footer.tagline} />}
      title={t.signup.title}
      lead={t.signup.lead}
      footer={{
        text: t.signup.haveAccount,
        href: localizePath(lang, "/compte/connexion"),
        label: t.signup.loginLink,
      }}
    >
      <SignupIntro t={t.signup.intro} links={links} />
      <Suspense fallback={null}>
        <SignupForm lang={lang} t={t.signup} common={t.common} />
      </Suspense>
    </AuthShell>
  );
}
