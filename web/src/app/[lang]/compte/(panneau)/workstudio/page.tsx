import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { workstudioView } from "@/components/account/panel-logic";
import { PanelLoading } from "@/components/account/panel-ui";
import { WorkstudioPanel } from "@/components/account/workstudio-panel";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { loadDashboard } from "@/server/billing/dashboard";
import { getDb } from "@/server/db";
import {
  getWorkstudioOrigin,
  listUsedAgents,
} from "@/server/gateway/activity-workstudio";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/workstudio",
    title: t.panel.meta.workstudio,
    description: t.panel.workstudio.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** WorkStudio et agents : état de l'abonnement, ouverture de l'instance si elle existe, agents appelés. */
export default async function WorkstudioPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={t.panel.workstudio.title}
          working={t.common.working}
        />
      }
    >
      <WorkstudioContent lang={lang} />
    </Suspense>
  );
}

async function WorkstudioContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const db = getDb();
  const [dashboard, agents, origin] = await Promise.all([
    loadDashboard(db, session.organizationId, { entryLimit: 0 }),
    listUsedAgents(db, session.organizationId),
    getWorkstudioOrigin(db),
  ]);
  return (
    <WorkstudioPanel
      lang={lang}
      t={getAccountDictionary(lang)}
      view={workstudioView({
        subscriptions: dashboard.subscriptions,
        instanceOrigin: origin,
      })}
      agents={agents}
    />
  );
}
