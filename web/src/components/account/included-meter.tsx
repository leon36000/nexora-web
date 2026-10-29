import { Card } from "@/components/ui/card";
import { type AccountDictionary, fmt, formatDate } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import {
  INCLUDED_TOKENS,
  includedTokensUsed,
} from "@/server/billing/included-tokens";
import type { IncludedCredits } from "@/server/billing/wallet";
import { formatMicroCadExact, formatTokensCompact } from "./panel-format";
import { SectionTitle } from "./panel-ui";

/**
 * Compteur des jetons inclus : « X de 5 M de jetons inclus utilisés ». C'est une équivalence EN VALEUR (la part
 * consommée du crédit inclus, ramenée à 5 M de jetons du modèle par défaut) : la note l'explique, un modèle plus cher
 * consomme le forfait plus vite. La barre est décorative pour les lecteurs d'écran, qui lisent le texte.
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
  const total = formatTokensCompact(lang, INCLUDED_TOKENS);
  if (!included)
    return (
      <Card as="section" aria-labelledby={headingId}>
        <SectionTitle id={headingId}>{i.title}</SectionTitle>
        <p className="mt-3 text-body text-fg-muted">{i.none}</p>
      </Card>
    );
  const used = includedTokensUsed(included.usedMicro, included.amountMicro);
  const percent = Math.round((used / INCLUDED_TOKENS) * 100);
  return (
    <Card as="section" aria-labelledby={headingId}>
      <SectionTitle id={headingId}>{i.title}</SectionTitle>
      <p
        className="mt-3 text-body font-medium text-fg"
        data-testid="included-meter"
      >
        {fmt(i.meter, { used: formatTokensCompact(lang, used), total })}
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
              amount: formatMicroCadExact(lang, included.remainingMicro),
              date: formatDate(lang, included.expiresAt),
            })
          : fmt(i.remainingNoDate, {
              amount: formatMicroCadExact(lang, included.remainingMicro),
            })}
      </p>
      <p className="mt-3 text-small text-fg-muted">{fmt(i.note, { total })}</p>
    </Card>
  );
}
