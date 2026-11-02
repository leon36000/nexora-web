import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { Notice } from "@/components/account/field";
import { PanelHeading, PanelLoading } from "@/components/account/panel-ui";
import { VpsPanel } from "@/components/account/vps-panel";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { getAccountDictionary } from "@/i18n/account";
import { getAccountVpsDictionary } from "@/i18n/account-vps";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { getAuth } from "@/server/auth/instance";
import { getDb } from "@/server/db";
import { loadAccountVps } from "@/server/vps/account";
import { getPanelSession } from "../_lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountVpsDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/vps",
    title: t.meta.title,
    description: t.meta.description,
    siteName: SITE_NAME,
    noindex: true,
  });
}

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

/**
 * « Mes VPS » : réservé aux comptes connectés. Les données (session, cookies, base) sont propres à
 * la requête : elles sont lues dans une frontière Suspense pour que la page garde une coque statique.
 */
export default async function AccountVpsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const common = getAccountDictionary(lang).common;
  return (
    <Suspense
      fallback={
        <PanelLoading
          title={getAccountVpsDictionary(lang).title}
          working={common.working}
        />
      }
    >
      <AccountVpsContent lang={lang} searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountVpsContent({
  lang,
  searchParams,
}: {
  lang: Lang;
  searchParams: Promise<Search>;
}) {
  const session = await getPanelSession();
  const t = getAccountVpsDictionary(lang);
  const accountHref = localizePath(lang, "/compte");

  if (!session) {
    // Sans session : même redirection que /compte. Avec session mais sans organisation : un message.
    const bare = await getAuth().api.getSession({ headers: await headers() });
    if (!bare) redirect(localizePath(lang, "/compte/connexion"));
    return (
      <Section tone="paper" aria-labelledby="vps-title">
        <h1 id="vps-title" className="text-h1 text-fg">
          {t.noOrganization.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lead text-fg-muted">
          {t.noOrganization.text}
        </p>
        <div className="mt-8">
          <ButtonLink href={accountHref} variant="secondary">
            {t.noOrganization.link}
          </ButtonLink>
        </div>
      </Section>
    );
  }

  const [data, q] = await Promise.all([
    loadAccountVps(getDb(), session.organizationId),
    searchParams,
  ]);

  return (
    <div className="space-y-8">
      <PanelHeading id="vps-title" title={t.title} lead={t.lead} />
      {first(q.offert) === "vps" ? (
        <Notice tone="success">
          {getAccountDictionary(lang).promo.gifted.vps}
        </Notice>
      ) : null}
      <VpsPanel
        lang={lang}
        t={t}
        role={session.role}
        instances={data.instances}
        orders={data.orders}
        justOrdered={first(q.commande) === "ok"}
      />
      <p className="text-small text-fg-muted">
        {getAccountDictionary(lang).panel.cloud.soon}
      </p>
    </div>
  );
}
