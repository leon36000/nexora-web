import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { AuthShell } from "@/components/account/auth-shell";
import { ForgotForm } from "@/components/account/forgot-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return {
    ...buildPageMetadata({
      lang,
      path: "/compte/mot-de-passe-oublie",
      title: t.meta.forgot,
      description: t.forgot.lead,
      siteName: "Nexora",
    }),
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell title={t.forgot.title} lead={t.forgot.lead}>
      <ForgotForm lang={lang} t={t.forgot} common={t.common} />
    </AuthShell>
  );
}
