import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { PricingBlock } from "@/server/cms/model";
import { CARD_GRID, cellClasses } from "./card-grid";
import { anchorProps, effectiveTone, toneProps } from "./tone";

/**
 * Offres et tarifs. Aucun prix n'est inventé : on affiche ce que le CMS publie, et « Sur demande » (dictionnaire)
 * quand le prix n'est pas renseigné.
 */
export function PricingBlockView({
  block,
  joined,
  t,
}: {
  block: PricingBlock;
  joined?: "after" | "before" | "both";
  t: Dictionary["cms"];
}) {
  const titleId = `${block.key}-title`;
  const anchor = anchorProps(block.anchorId);
  const cells = cellClasses(block.plans.length, 3);
  return (
    <Section
      {...toneProps(effectiveTone(block))}
      joined={joined}
      aria-labelledby={block.title ? titleId : undefined}
      id={anchor.id}
      className={anchor.className}
    >
      {block.title ? (
        <SectionHeader id={titleId} title={block.title} lead={block.intro} />
      ) : null}
      <ul className={`${CARD_GRID} mt-12`}>
        {block.plans.map((plan, i) => (
          <li key={plan.name} className={cells[i]}>
            <Card className="flex w-full flex-col">
              <h3 className="text-h3 text-fg">{plan.name}</h3>
              <p className="mt-5 font-display text-h2 text-fg">
                {plan.priceLabel ?? t.priceOnRequest}
              </p>
              {plan.billingNote ? (
                <Badge className="mt-2 normal-case tracking-normal">
                  {plan.billingNote}
                </Badge>
              ) : null}
              {plan.description ? (
                <p className="mt-5 text-fg-muted">{plan.description}</p>
              ) : null}
              {plan.features.length > 0 ? (
                <ul className="mt-6 space-y-2 border-t border-line pt-6 text-fg-muted">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1.5 shrink-0 bg-accent"
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {plan.cta ? (
                <div className="mt-8 pt-2">
                  <ButtonLink href={plan.cta.href} variant="secondary">
                    {plan.cta.label}
                  </ButtonLink>
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {block.note ? (
        <p className="mt-8 max-w-2xl text-sm text-fg-muted">{block.note}</p>
      ) : null}
    </Section>
  );
}
