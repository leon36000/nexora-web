import { PerimeterGrid } from "@/components/brand/perimeter-grid";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/cn";
import type { HeroBlock } from "@/server/cms/model";
import { CmsImage } from "./cms-image";
import { anchorProps, toneProps } from "./tone";

/** Héros du CMS : surtitre, titre, sous-titre, deux appels à l'action, grille de périmètre en signature. */
export function HeroBlockView({
  block,
  level = 1,
}: {
  block: HeroBlock;
  /** Un seul h1 par page : les héros suivants sont des h2. */
  level?: 1 | 2;
}) {
  const H = level === 1 ? "h1" : "h2";
  const titleId = `${block.key}-title`;
  const anchor = anchorProps(block.anchorId);
  return (
    <Section
      {...toneProps(block.variant)}
      flush
      aria-labelledby={titleId}
      id={anchor.id}
      className={cn("pb-20 pt-14 md:pb-32 md:pt-28", anchor.className)}
      background={
        block.perimeterGrid ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 hidden opacity-70 md:block"
          >
            <PerimeterGrid shape="wide" />
          </div>
        ) : undefined
      }
    >
      <div className={cn("max-w-2xl lg:max-w-[43rem]")}>
        {block.eyebrow ? <Badge tone="accent">{block.eyebrow}</Badge> : null}
        <H
          id={titleId}
          className={cn("text-display text-fg", block.eyebrow && "mt-6")}
        >
          {block.headline}
        </H>
        {block.subheadline ? (
          <p className="mt-7 max-w-xl text-lead text-fg-muted">
            {block.subheadline}
          </p>
        ) : null}
        {block.primary || block.secondary ? (
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
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
      {block.media ? (
        <div className="mt-12 max-w-3xl overflow-hidden rounded-lg border border-line">
          <CmsImage
            media={block.media}
            sizes="(min-width: 1280px) 768px, 100vw"
            priority
            className="h-auto w-full"
          />
        </div>
      ) : null}
      {block.perimeterGrid ? (
        /* Composition propre au mobile : le périmètre est un bloc sous le texte, pas un fond rogné. */
        <div
          aria-hidden="true"
          className="mt-14 aspect-[12/7] w-full opacity-90 md:hidden"
        >
          <PerimeterGrid shape="compact" />
        </div>
      ) : null}
    </Section>
  );
}
