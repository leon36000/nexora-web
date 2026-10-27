import Link from "next/link";
import { ArrowIcon } from "@/components/ui/button";
import { CARD_LINK, Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/cn";
import { isExternalHref } from "@/lib/safe-href";
import type { CardsBlock } from "@/server/cms/model";

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

/** Grille de cartes (titre, texte, lien). Une carte avec lien est entièrement cliquable (un seul arrêt de tabulation). */
export function CardsBlockView({
  block,
  surface,
}: {
  block: CardsBlock;
  surface: boolean;
}) {
  const titleId = `${block.key}-title`;
  return (
    <Section
      tone="light"
      surface={surface}
      aria-labelledby={block.title ? titleId : undefined}
    >
      {block.title ? (
        <SectionHeader id={titleId} title={block.title} lead={block.intro} />
      ) : block.intro ? (
        <p className="max-w-2xl text-lead text-fg-muted">{block.intro}</p>
      ) : null}
      <ul
        className={cn(
          "grid gap-4",
          (block.title || block.intro) && "mt-12",
          COLUMNS[block.columns],
        )}
      >
        {block.cards.map((card) => {
          const label = card.title ?? card.linkLabel ?? "";
          const link = card.href ? (
            card.href.startsWith("/") ? (
              <Link href={card.href} className={CARD_LINK}>
                {label}
              </Link>
            ) : (
              <a
                href={card.href}
                className={CARD_LINK}
                {...(isExternalHref(card.href)
                  ? { rel: "noopener noreferrer" }
                  : {})}
              >
                {label}
              </a>
            )
          ) : null;
          return (
            <li
              key={`${card.title ?? ""}|${card.text ?? ""}|${card.href ?? ""}`}
              className="flex"
            >
              <Card
                interactive={Boolean(card.href)}
                className="flex w-full flex-col"
              >
                {card.title ? (
                  <h3 className="text-h3 text-fg">{link ?? card.title}</h3>
                ) : null}
                {card.text ? (
                  <p className={cn("text-fg-muted", card.title && "mt-3")}>
                    {card.text}
                  </p>
                ) : null}
                {card.href && card.linkLabel && card.title ? (
                  <span className="mt-6 inline-flex items-center gap-2 text-[0.9375rem] font-medium text-accent-text">
                    {card.linkLabel}
                    <ArrowIcon />
                  </span>
                ) : null}
                {card.href && !card.title ? (
                  <h3 className="text-h4 text-fg">{link}</h3>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
