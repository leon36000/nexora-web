import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowIcon } from "@/components/ui/button";
import { CARD_LINK } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { type Lang, localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

/** La suite : liste éditoriale (une rangée par produit), plutôt qu'une grille de cartes uniformes. */
export function Products({
  lang,
  t,
}: {
  lang: Lang;
  t: Dictionary["home"]["products"];
}) {
  return (
    <Section tone="light" aria-labelledby="products-title">
      <SectionHeader
        id="products-title"
        label={t.label}
        title={t.title}
        lead={t.lead}
      />
      <ul className="mt-12 border-t border-line">
        {t.items.map((item) => (
          <li
            key={item.href}
            className="group/row relative grid items-start gap-3 border-b border-line py-7 transition-colors duration-150 hover:bg-surface sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:gap-8 sm:px-4 sm:py-8 has-[a:focus-visible]:bg-surface"
          >
            <Badge>{item.label}</Badge>
            <div>
              <h3 className="text-h3 text-fg">
                <Link
                  href={localizePath(lang, item.href)}
                  prefetch={false}
                  className={`${CARD_LINK} group/btn`}
                >
                  {item.title}
                  <span className="sr-only"> — {t.more}</span>
                </Link>
              </h3>
              <p className="mt-2 max-w-xl text-fg-muted">{item.text}</p>
            </div>
            <span
              aria-hidden="true"
              className="hidden self-center text-accent-text sm:block"
            >
              <ArrowIcon className="size-5 transition-transform duration-150 motion-safe:group-hover/row:translate-x-1" />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
