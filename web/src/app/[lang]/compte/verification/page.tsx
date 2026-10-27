import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { AuthShell } from "@/components/account/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/verification",
    title: t.meta.verify,
    description: t.verify.text,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Arrivée après le lien de confirmation du courriel. Better Auth redirige ici ; en cas d'échec il
 * ajoute `?error=…` (lien invalide ou expiré). Le paramètre est lu dans une frontière Suspense.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  return (
    <Suspense fallback={<VerifyResult lang={lang} failed={false} />}>
      <VerifyOutcome lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyOutcome({
  lang,
  searchParams,
}: {
  lang: "fr" | "en";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const failed = Boolean((await searchParams).error);
  return <VerifyResult lang={lang} failed={failed} />;
}

function VerifyResult({
  lang,
  failed,
}: {
  lang: "fr" | "en";
  failed: boolean;
}) {
  const t = getAccountDictionary(lang);
  return (
    <AuthShell
      title={failed ? t.verify.errorTitle : t.verify.title}
      lead={failed ? t.verify.errorText : t.verify.text}
    >
      <ButtonLink href={localizePath(lang, "/compte/connexion")} arrow>
        {t.verify.goLogin}
      </ButtonLink>
    </AuthShell>
  );
}
