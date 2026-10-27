import type { PublicVpsApp, PublicVpsPlan } from "@nexora/vps";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { type Lang, localizePath } from "@/i18n/config";
import { getVpsDictionary } from "@/i18n/vps";
import {
  offeredTerms,
  resolveSelection,
  type Selection,
  sortApps,
  sortPlans,
} from "./logic";
import {
  type ConfiguratorApp,
  type ConfiguratorPlan,
  VpsConfigurator,
} from "./vps-configurator";

type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Données du configurateur : seuls les plans tarifés (au moins une durée) et les applications
 * installables se commandent ; les textes sont choisis ici dans la langue de la page.
 */
export function configuratorData(
  lang: Lang,
  plans: readonly PublicVpsPlan[],
  apps: readonly PublicVpsApp[],
): { plans: ConfiguratorPlan[]; apps: ConfiguratorApp[] } {
  const t = getVpsDictionary(lang);
  return {
    plans: sortPlans(plans.filter((p) => offeredTerms(p).length > 0)).map(
      (p) => ({
        code: p.code,
        name: p.name,
        vcpu: p.vcpu,
        ramMb: p.ramMb,
        diskGb: p.diskGb,
        priceMonthlyCents: p.priceMonthlyCents,
        priceYearlyCents: p.priceYearlyCents,
        highlighted: p.highlighted,
        sort: p.sort,
        isDevSample: p.isDevSample,
        regionLabel: t.region[p.region],
      }),
    ),
    apps: sortApps(apps.filter((a) => a.kind === "installable")).map((a) => ({
      code: a.code,
      name: a.name,
      tagline: lang === "fr" ? a.taglineFr : a.taglineEn,
      version: a.version,
      minRamMb: a.minRamMb,
      sort: a.sort,
      kind: a.kind,
    })),
  };
}

function Configurator({
  lang,
  data,
  initial,
}: {
  lang: Lang;
  data: ReturnType<typeof configuratorData>;
  initial: Selection;
}) {
  const t = getVpsDictionary(lang);
  return (
    <VpsConfigurator
      lang={lang}
      plans={data.plans}
      apps={data.apps}
      initial={initial}
      t={t.configurator}
      common={t.common}
      units={t.units}
      links={{
        login: localizePath(lang, "/compte/connexion"),
        signup: localizePath(lang, "/compte/inscription"),
      }}
    />
  );
}

/** Configurateur initialisé par l'adresse (`plan`, `app`, `term`) : lit `searchParams`, donc dans une frontière Suspense. */
export async function ConfiguratorFromUrl({
  lang,
  data,
  searchParams,
}: {
  lang: Lang;
  data: ReturnType<typeof configuratorData>;
  searchParams: Promise<Search>;
}) {
  const q = await searchParams;
  const initial = resolveSelection(
    { plan: one(q.plan), app: one(q.app), term: one(q.term) },
    data.plans,
    data.apps,
  );
  return <Configurator lang={lang} data={data} initial={initial} />;
}

/** Même configurateur sans l'adresse (valeurs par défaut) : repli pendant la lecture de `searchParams`, même gabarit donc sans saut de mise en page. */
export function ConfiguratorDefault({
  lang,
  data,
}: {
  lang: Lang;
  data: ReturnType<typeof configuratorData>;
}) {
  return (
    <Configurator
      lang={lang}
      data={data}
      initial={resolveSelection({}, data.plans, data.apps)}
    />
  );
}

export function ConfiguratorFrame({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  const t = getVpsDictionary(lang);
  return (
    <Section
      tone="light"
      id="configurateur"
      aria-labelledby="configurator-title"
    >
      <SectionHeader
        id="configurator-title"
        title={t.configurator.title}
        lead={t.configurator.lead}
      />
      <div className="mt-12">{children}</div>
    </Section>
  );
}
