import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { formatCents, monthlyEquivalentCents, termPriceCents } from "./logic";

type Prices = {
  priceMonthlyCents: number | null;
  priceYearlyCents: number | null;
};

/**
 * Prix d'un plan, en dollars canadiens AVANT TAXES. Mensuel : le prix du mois. Annuel : le total annuel ET
 * l'équivalent mensuel. Une durée sans prix n'est pas affichée ; sans aucun prix, « non offert ».
 * Ce que ce composant affiche est exactement ce que les données structurées déclarent.
 */
export function PlanPrice({
  lang,
  plan,
  t,
}: {
  lang: Lang;
  plan: Prices;
  t: VpsDictionary["common"];
}) {
  const monthly = termPriceCents(plan, "month");
  const yearly = termPriceCents(plan, "year");
  if (monthly === null && yearly === null) {
    return <p className="text-body text-fg-muted">{t.notOffered}</p>;
  }
  return (
    <div>
      {monthly !== null ? (
        <p>
          <span className="font-display text-h3 tabular-nums text-fg">
            {formatCents(lang, monthly)}
          </span>{" "}
          <span className="text-small text-fg-muted">{t.perMonth}</span>
        </p>
      ) : null}
      {yearly !== null ? (
        <p className={monthly !== null ? "mt-2" : undefined}>
          <span
            className={
              monthly !== null
                ? "text-body tabular-nums text-fg"
                : "font-display text-h3 tabular-nums text-fg"
            }
          >
            {formatCents(lang, yearly)}
          </span>{" "}
          <span className="text-small text-fg-muted">
            {t.perYear} ·{" "}
            {fmt(t.yearEquivalent, {
              price: formatCents(lang, monthlyEquivalentCents(yearly)),
            })}
          </span>
        </p>
      ) : null}
      <p className="mt-1 text-small text-fg-muted">{t.beforeTaxes}</p>
    </div>
  );
}
