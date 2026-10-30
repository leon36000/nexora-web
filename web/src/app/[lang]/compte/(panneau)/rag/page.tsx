import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PanelLoading } from "@/components/account/panel-ui";
import { RagPanel } from "@/components/account/rag-panel";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import { loadRagPanel } from "@/server/products/rag-panel";
import { productSwitchOn } from "@/server/products/registry";
import { getRagPanelService } from "@/server/products/services";
import { requirePanelSession } from "../_lib/session";
import { storageNotice } from "../_lib/storage-notice";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/rag",
    title: t.panel.meta.rag,
    description: t.panel.rag.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/** Nexora RAG : « Bientôt » tant que `NEXORA_PRODUCT_RAG` est éteint ; sinon les bases, « Créer mon RAG » et « Se connecter ». */
export default async function RagPage() {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return (
    <Suspense
      fallback={
        <PanelLoading title={t.panel.rag.title} working={t.common.working} />
      }
    >
      <RagContent lang={lang} />
    </Suspense>
  );
}

async function RagContent({ lang }: { lang: Lang }) {
  const session = await requirePanelSession(lang);
  const t = getAccountDictionary(lang);
  const enabled = productSwitchOn(process.env.NEXORA_PRODUCT_RAG);
  const [model, notice] = await Promise.all([
    loadRagPanel({
      enabled,
      service: getRagPanelService(),
      orgId: session.organizationId,
      defaultNameBase: t.panel.rag.defaultName,
    }),
    enabled ? storageNotice(getDb(), session.organizationId) : null,
  ]);
  return (
    <RagPanel
      lang={lang}
      t={t}
      role={session.role}
      model={model}
      storageNotice={notice}
    />
  );
}
