import type { PublicVpsPlan } from "@nexora/vps";
import { fmt } from "@/i18n/account";
import type { Lang } from "@/i18n/config";
import type { VpsDictionary } from "@/i18n/vps";
import { DevBadge } from "./dev-badge";
import {
  formatCents,
  formatGb,
  formatInt,
  formatMemory,
  monthlyEquivalentCents,
  termPriceCents,
} from "./logic";

const TH =
  "whitespace-nowrap border-b border-line-strong px-4 py-3 text-left align-bottom text-small font-medium text-fg";
const TD = "border-b border-line px-4 py-4 align-top text-small text-fg";

/**
 * Tableau de comparaison. Sur mobile, la région défile horizontalement (atteignable au clavier) et la
 * colonne du plan reste visible. Les valeurs sont celles des cartes et des données structurées.
 */
export function PlanTable({
  lang,
  plans,
  t,
}: {
  lang: Lang;
  plans: readonly PublicVpsPlan[];
  t: VpsDictionary;
}) {
  return (
    <section
      aria-label={t.table.region}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: région défilable atteignable au clavier
      tabIndex={0}
      className="overflow-x-auto rounded-frame border border-line bg-bg"
    >
      <table className="w-full min-w-[56rem] border-collapse">
        <caption className="sr-only">{t.table.caption}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={`${TH} sticky left-0 z-10 bg-bg shadow-[1px_0_0_var(--line)]`}
            >
              {t.table.plan}
            </th>
            <th scope="col" className={TH}>
              {t.plans.vcpu}
            </th>
            <th scope="col" className={TH}>
              {t.plans.ram}
            </th>
            <th scope="col" className={TH}>
              {t.plans.disk}
            </th>
            <th scope="col" className={TH}>
              {t.plans.bandwidth}
            </th>
            <th scope="col" className={TH}>
              {t.plans.location}
            </th>
            <th scope="col" className={TH}>
              {t.table.monthly}
              <span className="block font-normal text-fg-muted">
                {t.common.beforeTaxes}
              </span>
            </th>
            <th scope="col" className={TH}>
              {t.table.yearly}
              <span className="block font-normal text-fg-muted">
                {t.common.beforeTaxes}
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const monthly = termPriceCents(plan, "month");
            const yearly = termPriceCents(plan, "year");
            return (
              <tr key={plan.code}>
                <th
                  scope="row"
                  className={`${TD} sticky left-0 z-10 bg-bg text-left font-medium shadow-[1px_0_0_var(--line)]`}
                >
                  {plan.name}
                  {plan.isDevSample ? (
                    <span className="mt-2 block">
                      <DevBadge>{t.common.devBadge}</DevBadge>
                    </span>
                  ) : null}
                </th>
                <td className={`${TD} tabular-nums`}>
                  {formatInt(lang, plan.vcpu)}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  {formatMemory(lang, plan.ramMb, t.units)}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  {formatGb(lang, plan.diskGb, t.units.gb)}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  {plan.bandwidthGb > 0
                    ? formatGb(lang, plan.bandwidthGb, t.units.gb)
                    : t.common.notSpecified}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {t.region[plan.region]}
                </td>
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  {monthly !== null
                    ? formatCents(lang, monthly)
                    : t.common.notOffered}
                </td>
                <td className={`${TD} tabular-nums`}>
                  {yearly !== null ? (
                    <>
                      <span className="whitespace-nowrap">
                        {formatCents(lang, yearly)}
                      </span>
                      <span className="block text-fg-muted">
                        {fmt(t.common.yearEquivalent, {
                          price: formatCents(
                            lang,
                            monthlyEquivalentCents(yearly),
                          ),
                        })}
                      </span>
                    </>
                  ) : (
                    t.common.notOffered
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
