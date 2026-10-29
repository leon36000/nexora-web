import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { applyCustomRange } from "@/components/account/activity-range";
import { ActivityView } from "@/components/account/activity-view";
import { isFreeAccess } from "@/components/account/panel-logic";
import { PanelLoading } from "@/components/account/panel-ui";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { loadActivityPage } from "@/server/gateway/activity-page";
import { billingModeOf } from "@/server/gateway/house";
import { listApiKeys } from "@/server/gateway/keys";
import type { Search } from "../_lib/flash";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/activite",
    title: t.panel.meta.activity,
    description: t.panel.activity.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Une valeur par paramètre : `?model=a&model=b` ne garde que la première. */
function toParams(q: Search): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(q)) {
    const one = Array.isArray(value) ? value[0] : value;
    if (one !== undefined) params.set(name, one);
  }
  return params;
}

/**
 * Activité : synthèse, répartitions, journal des requêtes et export CSV de l'organisation. Les critères viennent de
 * l'adresse (formulaire GET) ; seules des métadonnées de `usage_events` sont lues.
 */
export default async function ActivityPage({
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
          title={t.panel.activity.title}
          working={t.common.working}
        />
      }
    >
      <ActivityContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function ActivityContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const db = getDb();
  const params = applyCustomRange(toParams(await searchParams));
  const [data, keys, mode] = await Promise.all([
    loadActivityPage(db, session.organizationId, params, new Date()),
    listApiKeys(db, session.organizationId),
    billingModeOf(db, session.organizationId),
  ]);
  return (
    <ActivityView
      lang={lang}
      t={t}
      data={data}
      free={isFreeAccess(mode)}
      keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix }))}
    />
  );
}
