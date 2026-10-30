import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { CodePanel } from "@/components/account/code-panel";
import { PanelLoading } from "@/components/account/panel-ui";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { loadCodeWorkspacePanel } from "@/server/products/code-workspace";
import { productSwitchOn } from "@/server/products/registry";
import { getCodeWorkspaceService } from "@/server/products/services";
import { requirePanelSession } from "../_lib/session";
import { storageNotice } from "../_lib/storage-notice";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/code",
    title: t.panel.meta.code,
    description: t.panel.code.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Nexora Code : « Bientôt » tant que `NEXORA_PRODUCT_CODE` est éteint ; sinon l'environnement hébergé de la personne. */
export default async function CodePage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading title={t.panel.code.title} working={t.common.working} />
      }
    >
      <CodeContent lang={lang} />
    </Suspense>
  );
}

async function CodeContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const enabled = productSwitchOn(process.env.NEXORA_PRODUCT_CODE);
  const [model, notice] = await Promise.all([
    loadCodeWorkspacePanel({
      enabled,
      service: getCodeWorkspaceService(),
      orgId: session.organizationId,
      userId: session.userId,
    }),
    enabled ? storageNotice(getDb(), session.organizationId) : null,
  ]);
  return <CodePanel lang={lang} t={t} model={model} storageNotice={notice} />;
}
