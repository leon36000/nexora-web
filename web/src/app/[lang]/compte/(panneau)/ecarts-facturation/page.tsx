import { listFindings, lastRun as loadLastRun } from "@nexora/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { PanelLoading } from "@/components/account/panel-ui";
import { parseFindingFilters } from "@/components/account/reconciliation-format";
import {
  type FindingRow,
  ReconciliationView,
} from "@/components/account/reconciliation-view";
import { getAccountDictionary } from "@/i18n/account";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getDb } from "@/server/db";
import type { Search } from "../_lib/flash";
import { requirePanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/ecarts-facturation",
    title: t.panel.meta.reconciliation,
    description: t.panel.reconciliation.lead,
    siteName: SITE_NAME,
    noindex: true,
  });
}

/**
 * Écarts de facturation : page du PERSONNEL seulement (un compte client reçoit la même réponse qu'une page inexistante).
 * Lit `reconciliation_findings` et la dernière exécution de `reconcile.daily` ; aucune écriture.
 */
export default async function ReconciliationPage({
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
          title={t.panel.reconciliation.title}
          working={t.common.working}
        />
      }
    >
      <ReconciliationContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function ReconciliationContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const session = await requirePanelSession(lang);
  if (!session.isStaff) notFound();
  const t = getAccountDictionary(lang);
  const db = getDb();
  const filters = parseFindingFilters(await searchParams);
  const [found, run] = await Promise.all([
    listFindings(db, {
      status: filters.status,
      kind: filters.kind,
      limit: 200,
    }),
    loadLastRun(db),
  ]);
  const summary = (run?.summary ?? {}) as {
    ledgerRows?: unknown;
    unavailable?: unknown;
  };
  const rows: FindingRow[] = found.map((f) => ({
    id: f.id,
    kind: f.kind,
    status: f.status,
    foundAt: f.foundAt,
    day: f.day,
    model: f.model,
    requestId: f.requestId,
    expectedUsdNano: f.expectedUsdNano?.toString() ?? null,
    actualUsdNano: f.actualUsdNano?.toString() ?? null,
    deltaUsdNano: f.deltaUsdNano?.toString() ?? null,
  }));
  return (
    <ReconciliationView
      lang={lang}
      t={t}
      rows={rows}
      filters={filters}
      action={localizePath(lang, "/compte/ecarts-facturation")}
      lastRun={
        run
          ? {
              day: run.day,
              status: run.status,
              ledgerRows:
                typeof summary.ledgerRows === "number"
                  ? summary.ledgerRows
                  : null,
              unavailable: Array.isArray(summary.unavailable)
                ? summary.unavailable.filter(
                    (s): s is string => typeof s === "string",
                  )
                : [],
            }
          : null
      }
    />
  );
}
