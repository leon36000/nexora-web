import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PanelLoading } from "@/components/account/panel-ui";
import { RequestDetail } from "@/components/account/request-detail";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { getActivityDetail } from "@/server/gateway/activity-detail";
import { first, type Search } from "../../_lib/flash";
import { requirePanelSession } from "../../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/activite/requete",
    title: t.panel.meta.activity,
    description: t.panel.activity.detail.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Détail d'une requête (`/compte/activite/requete?id=…`) : métadonnées de `usage_events` de l'organisation de la
 * session, jamais le contenu. L'identifiant vient de l'adresse, l'organisation de la session.
 */
export default async function RequestDetailPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={t.panel.activity.detail.title}
          working={t.common.working}
        />
      }
    >
      <DetailContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function DetailContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const session = await requirePanelSession(lang);
  const id = first((await searchParams).id) ?? "";
  const detail = await getActivityDetail(getDb(), session.organizationId, id);
  return (
    <RequestDetail lang={lang} t={getAccountDictionary(lang)} detail={detail} />
  );
}
