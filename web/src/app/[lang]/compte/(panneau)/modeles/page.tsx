import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { ModelsPanel } from "@/components/account/models-panel";
import { PanelHeading, PanelLoading } from "@/components/account/panel-ui";
import { ApiKeysSection } from "@/components/gateway/api-keys-section";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { listApiKeys } from "@/server/gateway/keys";
import { getPublicCatalog } from "@/server/gateway/read";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/modeles",
    title: t.panel.meta.models,
    description: t.panel.models.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Modèles et clés : les clés d'API de l'organisation, puis le catalogue avec l'identifiant à copier. */
export default async function ModelsPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading title={t.panel.models.title} working={t.common.working} />
      }
    >
      <ModelsContent lang={lang} />
    </Suspense>
  );
}

async function ModelsContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const [keys, catalog] = await Promise.all([
    listApiKeys(getDb(), session.organizationId),
    getPublicCatalog(),
  ]);
  return (
    <div className="space-y-14">
      <PanelHeading
        id="models-title"
        title={t.panel.models.title}
        lead={t.panel.models.lead}
      />
      <ApiKeysSection lang={lang} role={session.role} keys={keys} />
      <ModelsPanel lang={lang} t={t} catalog={catalog} />
    </div>
  );
}
