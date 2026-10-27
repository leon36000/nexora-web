import { PerimeterGrid } from "@/components/brand/perimeter-grid";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { CtaBlock } from "@/server/cms/model";

/** Bandeau d'appel à l'action. « accent » : fond papier relevé d'un filet orange (jamais de texte courant sur l'orange). */
export function CtaBlockView({ block }: { block: CtaBlock }) {
  const titleId = `${block.key}-title`;
  const dark = block.tone === "sombre";
  return (
    <Section
      tone={dark ? "dark" : "light"}
      surface={!dark}
      aria-labelledby={titleId}
      className={
        block.tone === "accent" ? "border-t-4 border-accent" : undefined
      }
      background={
        <div
          aria-hidden="true"
          className={`absolute inset-0 -z-10 hidden md:block ${dark ? "opacity-50" : "opacity-40"}`}
        >
          <PerimeterGrid shape="wide" animated={false} />
        </div>
      }
    >
      <div className="max-w-2xl">
        <h2 id={titleId} className="text-h1 text-fg">
          {block.title}
        </h2>
        {block.text ? (
          <p className="mt-5 text-lead text-fg-muted">{block.text}</p>
        ) : null}
        {block.primary || block.secondary ? (
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            {block.primary ? (
              <ButtonLink href={block.primary.href} size="lg">
                {block.primary.label}
              </ButtonLink>
            ) : null}
            {block.secondary ? (
              <ButtonLink
                href={block.secondary.href}
                variant="secondary"
                size="lg"
              >
                {block.secondary.label}
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}
