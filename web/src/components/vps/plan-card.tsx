import type { PublicVpsPlan } from "@nexora/vps";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmt } from "@/i18n/account";
import { type Lang, localizePath } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { DevBadge } from "./dev-badge";
import { formatGb, formatInt, formatMemory, offeredTerms } from "./logic";
import { PlanPrice } from "./plan-price";
import { RegionBadge } from "./region-badge";

/** Carte d'un plan publié : lieu, ressources, prix avant taxes et lien vers le configurateur. */
export function PlanCard({
  lang,
  plan,
  t,
  orderHref,
}: {
  lang: Lang;
  plan: PublicVpsPlan;
  t: VpsDictionary;
  /** Lien du bouton ; `null` : pas de bouton (guide, non commandable en ligne). Par défaut : le configurateur de /vps. */
  orderHref?: string | null;
}) {
  const description = lang === "fr" ? plan.descriptionFr : plan.descriptionEn;
  const titleId = `plan-title-${plan.code}`;
  const orderable = offeredTerms(plan).length > 0;
  const href =
    orderHref === undefined
      ? `${localizePath(lang, "/vps")}?plan=${encodeURIComponent(plan.code)}#configurateur`
      : orderHref;
  return (
    <Card
      as="article"
      id={`plan-${plan.code}`}
      aria-labelledby={titleId}
      className="flex h-full scroll-mt-24 flex-col"
    >
      <div className="flex flex-wrap items-center gap-2">
        <RegionBadge region={plan.region} label={t.region[plan.region]} />
        {plan.highlighted ? (
          <Badge tone="outline">{t.common.suggested}</Badge>
        ) : null}
      </div>
      <h3 id={titleId} className="mt-4 font-display text-h3 text-fg">
        {plan.name}
      </h3>
      {plan.isDevSample ? (
        <p className="mt-3">
          <DevBadge>{t.common.devBadge}</DevBadge>
        </p>
      ) : null}
      {description ? (
        <p className="mt-3 text-small text-fg-muted">{description}</p>
      ) : null}
      <div className="mt-5">
        <PlanPrice lang={lang} plan={plan} t={t.common} />
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-5 text-small">
        <div>
          <dt className="text-fg-muted">{t.plans.vcpu}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatInt(lang, plan.vcpu)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{t.plans.ram}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatMemory(lang, plan.ramMb, t.units)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{t.plans.disk}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {formatGb(lang, plan.diskGb, t.units.gb)}
          </dd>
        </div>
        <div>
          <dt className="text-fg-muted">{t.plans.bandwidth}</dt>
          <dd className="mt-0.5 tabular-nums text-fg">
            {plan.bandwidthGb > 0
              ? formatGb(lang, plan.bandwidthGb, t.units.gb)
              : t.common.notSpecified}
          </dd>
        </div>
      </dl>
      {orderable && href ? (
        <div className="mt-auto pt-6">
          <Link
            href={href}
            prefetch={false}
            className={buttonClasses({ variant: "secondary" })}
            aria-label={fmt(t.plans.chooseLabel, { name: plan.name })}
          >
            {t.plans.choose}
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
