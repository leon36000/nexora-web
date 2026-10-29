import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PanelLoading } from "@/components/account/panel-ui";
import { SecurityPanel } from "@/components/account/security-panel";
import { isLang, localizePath } from "@/i18n/config";
import { getSecurityDictionary } from "@/i18n/security";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getPanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getSecurityDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/securite",
    title: t.meta.title,
    description: t.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Sécurité du compte : double authentification (TOTP + codes de secours). Réservé aux comptes connectés. */
export default async function SecurityPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getSecurityDictionary(lang);
  return (
    <Suspense
      fallback={<PanelLoading title={t.title} working={t.common.working} />}
    >
      <SecurityContent lang={lang} />
    </Suspense>
  );
}

async function SecurityContent({ lang }: { lang: "fr" | "en" }) {
  const session = await getPanelSession();
  if (!session) redirect(localizePath(lang, "/compte/connexion"));
  const t = getSecurityDictionary(lang);
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 id="security-title" className="text-h3 text-fg">
          {t.title}
        </h1>
        <p className="mt-3 text-body text-fg-muted">{t.lead}</p>
      </div>
      {session.isStaff && !session.twoFactorEnabled ? (
        <div
          role="alert"
          className="rounded-md border border-line-strong p-4 text-body text-fg"
        >
          <p className="font-medium">{t.required.title}</p>
          <p className="mt-2 text-fg-muted">{t.required.text}</p>
        </div>
      ) : null}
      <SecurityPanel
        t={t}
        twoFactorEnabled={session.twoFactorEnabled}
        isStaff={session.isStaff}
      />
    </div>
  );
}
