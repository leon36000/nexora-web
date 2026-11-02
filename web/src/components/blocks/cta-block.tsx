import { LightField } from "@/components/signal/light-field";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { CtaBlock } from "@/server/cms/model";
import { anchorProps, effectiveTone, toneProps } from "./tone";

/**
 * Appel à l'action de fin de page : titre très grand centré sur un horizon de lumière (champ figé) ; le bouton
 * principal porte le seul point de chaleur de l'écran (flare).
 */
export function CtaBlockView({
  block,
  joined,
}: {
  block: CtaBlock;
  joined?: "after" | "before" | "both";
}) {
  const titleId = `${block.key}-title`;
  const dark = effectiveTone(block) === "dark";
  const anchor = anchorProps(block.anchorId);
  return (
    <Section
      {...toneProps(effectiveTone(block))}
      joined={joined}
      aria-labelledby={titleId}
      id={anchor.id}
      className={anchor.className}
      scan
      background={
        <div
          aria-hidden="true"
          className={`absolute inset-0 -z-10 ${dark ? "" : "opacity-70"}`}
        >
          <div className="grid-precision absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-[60%] [mask-image:linear-gradient(to_top,#000_30%,transparent)]">
            <LightField
              animated={false}
              horizon={0.05}
              relief={0.1}
              cols={80}
            />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_45%,color-mix(in_oklab,var(--bg)_85%,transparent),transparent_80%)]" />
        </div>
      }
    >
      <div className="mx-auto max-w-4xl py-10 text-center md:py-20">
        <h2 id={titleId} className="text-display text-fg">
          {block.title}
        </h2>
        {block.text ? (
          <p className="mx-auto mt-7 max-w-2xl text-lead text-fg-muted">
            {block.text}
          </p>
        ) : null}
        {block.primary || block.secondary ? (
          <div className="mt-11 flex flex-col justify-center gap-3 sm:flex-row">
            {block.primary ? (
              <ButtonLink
                href={block.primary.href}
                size="lg"
                variant={dark ? "flare" : "primary"}
                arrow
              >
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
