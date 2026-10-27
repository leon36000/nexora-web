import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { AuthShell } from "@/components/account/auth-shell";
import { ResetForm } from "@/components/account/reset-form";
import { getAccountDictionary } from "@/i18n/account";
import { isLang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/reinitialiser",
    title: t.meta.reset,
    description: t.reset.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

export default async function ResetPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <AuthShell title={t.reset.title} lead={t.reset.lead}>
      {/* useSearchParams exige une frontière Suspense pour la génération statique. */}
      <Suspense>
        <ResetForm lang={lang} t={t.reset} common={t.common} />
      </Suspense>
    </AuthShell>
  );
}
