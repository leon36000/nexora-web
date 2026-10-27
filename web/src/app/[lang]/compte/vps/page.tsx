import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { Suspense } from "react";
import { VpsPanel } from "@/components/account/vps-panel";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { getAccountDictionary } from "@/i18n/account";
import { getAccountVpsDictionary } from "@/i18n/account-vps";
import { isLang, type Lang, localizePath } from "@/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { getAuth } from "@/server/auth/instance";
import { getSessionContext } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { loadAccountVps } from "@/server/vps/account";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  if (!isLang(lang)) notFound();
  const t = getAccountVpsDictionary(lang);
  return buildPageMetadata({
    lang,
    path: "/compte/vps",
    title: t.meta.title,
    description: t.meta.description,
    siteName: "Nexora",
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
        <Section tone="light" aria-busy="true">
          <h1 className="text-h1 text-fg">
            {getAccountVpsDictionary(lang).title}
          </h1>
          <p className="mt-4 text-fg-muted" role="status">
            {common.working}
          </p>
        </Section>
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
  const requestHeaders = await headers();
  const session = await getSessionContext(requestHeaders);
  const t = getAccountVpsDictionary(lang);
  const accountHref = localizePath(lang, "/compte");

  if (!session) {
    // Sans session : même redirection que /compte. Avec session mais sans organisation : un message.
    const bare = await getAuth().api.getSession({ headers: requestHeaders });
    if (!bare) redirect(localizePath(lang, "/compte/connexion"));
    return (
      <Section tone="light" aria-labelledby="vps-title">
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
    <Section tone="light" aria-labelledby="vps-title">
      <header>
        <Badge tone="accent">{session.name}</Badge>
        <h1 id="vps-title" className="mt-4 text-h1 text-fg">
          {t.title}
        </h1>
        <p className="mt-4 max-w-2xl text-lead text-fg-muted">{t.lead}</p>
        <div className="mt-6">
          <ButtonLink href={accountHref} variant="link">
            {t.backToAccount}
          </ButtonLink>
        </div>
      </header>
      <VpsPanel
        lang={lang}
        t={t}
        role={session.role}
        instances={data.instances}
        orders={data.orders}
        justOrdered={first(q.commande) === "ok"}
      />
    </Section>
  );
}
