import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt, formatDate } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { IncludedCredits } from "@/server/billing/wallet";
import { MICRO_PER_CREDIT } from "@/server/ledger/money";
import { SectionTitle } from "./panel-ui";

/**
 * Compteur des crédits d'abonnement : « X de Y crédits d'abonnement utilisés » (1 crédit = 1 ¢ CA ; les micro-CAD du grand
 * livre sont ramenés en crédits, arrondis vers le bas). Ils expirent à la fin de la période, donc ils servent avant les
 * crédits de recharge. La barre est décorative pour les lecteurs d'écran, qui lisent le texte.
 */
export function IncludedMeter({
  lang,
  t,
  included,
  headingId = "included-title",
}: {
  lang: Lang;
  t: AccountDictionary;
  included: IncludedCredits | null;
  headingId?: string;
}) {
  const i = t.panel.billing.included;
  const credits = (micro: bigint) =>
    new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA").format(
      micro > 0n ? micro / MICRO_PER_CREDIT : 0n,
    );
  if (!included)
    return (
      <Card as="section" aria-labelledby={headingId}>
        <SectionTitle id={headingId}>{i.title}</SectionTitle>
        <p className="mt-3 text-body text-fg-muted">{i.none}</p>
      </Card>
    );
  const percent =
    included.amountMicro > 0n
      ? Math.min(
          100,
          Math.round(
            (Number(included.usedMicro) / Number(included.amountMicro)) * 100,
          ),
        )
      : 0;
  return (
    <Card as="section" aria-labelledby={headingId}>
      <SectionTitle id={headingId}>{i.title}</SectionTitle>
      <p
        className="mt-3 text-body font-medium text-fg"
        data-testid="included-meter"
      >
        {fmt(i.meter, {
          used: credits(included.usedMicro),
          total: credits(included.amountMicro),
        })}
      </p>
      <div
        role="progressbar"
        aria-label={i.meterLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} %`}
        className="mt-3 h-3 w-full overflow-hidden rounded-full border border-line-strong"
      >
        <div
          className="h-full bg-accent-graphic"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-3 text-small text-fg">
        {included.expiresAt
          ? fmt(i.remaining, {
              amount: credits(included.remainingMicro),
              date: formatDate(lang, included.expiresAt),
            })
          : fmt(i.remainingNoDate, {
              amount: credits(included.remainingMicro),
            })}
      </p>
      <p className="mt-3 text-small text-fg-muted">{i.note}</p>
    </Card>
  );
}
