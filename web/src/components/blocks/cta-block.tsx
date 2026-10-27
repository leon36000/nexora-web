import { MosaicBackdrop } from "@/components/brand/mosaic-backdrop";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import type { CtaBlock } from "@/server/cms/model";
import { anchorProps, toneProps } from "./tone";

/** Bandeau d'appel à l'action (sombre, clair ou sable), avec la mosaïque braise qui se dissout vers le texte. */
export function CtaBlockView({
  block,
  joined,
}: {
  block: CtaBlock;
  joined?: "after" | "before" | "both";
}) {
  const titleId = `${block.key}-title`;
  const dark = block.tone === "sombre";
  const anchor = anchorProps(block.anchorId);
  return (
    <Section
      {...toneProps(block.tone)}
      joined={joined}
      aria-labelledby={titleId}
      id={anchor.id}
      className={anchor.className}
      background={
        <div
          aria-hidden="true"
          className={`absolute inset-0 -z-10 hidden md:block ${dark ? "" : "opacity-80"}`}
        >
          <MosaicBackdrop shape="wide" animated={false} seed={9} rows={14} />
        </div>
      }
    >
      <div className="max-w-2xl py-6 md:py-10">
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
