import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { AuthPanel } from "@/components/account/auth-panel";
import { AuthShell } from "@/components/account/auth-shell";
import { ForgotForm } from "@/components/account/forgot-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/mot-de-passe-oublie",
    title: t.meta.forgot,
    description: t.forgot.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

export default async function ForgotPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell
      panel={<AuthPanel tagline={getDictionary(lang).footer.tagline} />}
      title={t.forgot.title}
      lead={t.forgot.lead}
    >
      <ForgotForm lang={lang} t={t.forgot} common={t.common} />
    </AuthShell>
  );
}
