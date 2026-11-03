import Image from "next/image";
import { LightField } from "@/components/signal/light-field";
import { SignalBackdrop } from "@/components/signal/materials";
import { HeroVideo, MotionToggle } from "@/components/signal/motion";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { HeroApproval } from "@/components/visuals/hero-approval";
import type { VisualsDictionary } from "@/i18n/visuals";
import { cn } from "@/lib/cn";
import { mediaPath } from "@/lib/media";
import type { HeroBlock } from "@/server/cms/model";
import { CmsImage } from "./cms-image";
import { anchorProps, effectiveTone, toneProps } from "./tone";

type HeroProps = {
  block: HeroBlock;
  /** Un seul h1 par page : les héros suivants sont des h2. */
  level?: 1 | 2;
  /** Textes de la carte d'exemple « à approuver » (accueil, héros standard seulement). */
  showcase?: VisualsDictionary["hero"];
  /** Libellés du bouton de pause des animations (WCAG 2.2.2). */
  motion: VisualsDictionary["signal"]["motion"];
  /** Libellés des cadres de détection (matière « détection »). */
  detectionLabels?: readonly string[];
};

/** Texte du héros : surtitre (point de lumière), titre très grand, sous-titre, deux appels à l'action. */
function HeroText({
  block,
  level,
  mega,
  opening,
}: {
  block: HeroBlock;
  level: 1 | 2;
  mega?: boolean;
  /** Ouverture sobre (accueil) : titre géant sur fond clair, rien d'autre ne concurrence le texte. */
  opening?: boolean;
}) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <>
      {block.eyebrow ? (
        <Badge tone="accent" className="rise">
          {block.eyebrow}
        </Badge>
      ) : null}
      <H
        id={`${block.key}-title`}
        style={{ "--d": 1 } as React.CSSProperties}
        className={cn(
          "rise text-fg",
          opening
            ? "max-w-[16ch] text-display"
            : mega
              ? "max-w-[15ch] text-mega"
              : "max-w-[18ch] text-display",
          block.eyebrow && "mt-6 md:mt-8",
        )}
      >
        {block.headline}
      </H>
      {block.subheadline ? (
        <p
          style={{ "--d": 2 } as React.CSSProperties}
          className={cn(
            "rise mt-7 text-lead text-fg-muted md:mt-9",
            opening ? "max-w-[40rem]" : "max-w-2xl",
          )}
        >
          {block.subheadline}
        </p>
      ) : null}
      {block.primary || block.secondary ? (
        <div
          style={{ "--d": 3 } as React.CSSProperties}
          className="rise mt-9 flex flex-col gap-3 sm:flex-row md:mt-11"
        >
          {block.primary ? (
            <ButtonLink href={block.primary.href} size="lg" arrow>
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
    </>
  );
}

/**
 * Héros plein écran : boucle vidéo silencieuse (chargée au repos, jamais sous mouvement réduit) sur son affiche, ou à
 * défaut le champ de lumière ; voiles dégradés pour la lisibilité ; titre géant en bas à gauche ; bouton de pause.
 */
function FullscreenHero({
  block,
  level,
  motion,
}: HeroProps & { level: 1 | 2 }) {
  const anchor = anchorProps(block.anchorId);
  const poster = block.media;
  return (
    <section
      aria-labelledby={`${block.key}-title`}
      id={anchor.id}
      className={cn(
        "theme-dark relative isolate flex min-h-[calc(100svh-4rem)] flex-col justify-end overflow-hidden border-b border-line bg-bg text-fg",
        anchor.className,
      )}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        {poster ? (
          <Image
            src={mediaPath(poster.id)}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : null}
        {block.video ? (
          <HeroVideo
            src={mediaPath(block.video.id)}
            type={block.video.mime ?? "video/mp4"}
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        {!poster && !block.video ? (
          <div className="absolute inset-x-0 bottom-0 top-[8%]">
            <LightField cols={110} horizon={0.22} relief={0.2} hotspot />
          </div>
        ) : null}
        {/* voiles : lisibilité du texte en bas à gauche, quel que soit le plan de la vidéo */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-abyss-950)_2%,rgb(20_23_26/0.86)_24%,rgb(20_23_26/0.25)_62%,rgb(20_23_26/0.55))]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_0%_100%,rgb(20_23_26/0.8),transparent_70%)]" />
        <div className="grid-precision absolute inset-0 opacity-60" />
        <div className="scan-loop absolute inset-0 overflow-hidden">
          <div className="scanline" />
        </div>
      </div>
      <Container className="relative pb-14 pt-32 md:pb-20 lg:pb-24">
        <HeroText block={block} level={level} mega />
        <div className="mt-14 flex items-center justify-between gap-4 border-t border-line pt-5 md:mt-20">
          <span aria-hidden="true" className="flex flex-1 items-center gap-3">
            <span className="live-dot size-1.5 shrink-0 rounded-full bg-flare text-flare" />
            <span className="ruler hidden h-2.5 flex-1 sm:block" />
          </span>
          <MotionToggle labels={motion} />
        </div>
      </Container>
    </section>
  );
}

/** Héros du CMS : plein écran (vidéo) ou standard (titre sur la matière « Signal » choisie). */
export function HeroBlockView({
  block,
  level = 1,
  showcase,
  motion,
  detectionLabels,
}: HeroProps) {
  if (block.layout === "plein-ecran")
    return (
      <FullscreenHero
        block={block}
        level={level}
        showcase={showcase}
        motion={motion}
      />
    );
  const anchor = anchorProps(block.anchorId);
  const material =
    block.perimeterGrid && block.signature !== "aucun" ? block.signature : null;
  const animated = material === "champ" || material === "onde";
  const side = block.media || (showcase && material);
  // Sans média ni matière : ouverture sobre (très grand titre, deux boutons), sur un voile vert très léger.
  const opening = !side && !material;
  return (
    <Section
      {...toneProps(effectiveTone(block))}
      flush
      aria-labelledby={`${block.key}-title`}
      id={anchor.id}
      className={cn(
        opening
          ? "pb-20 pt-20 md:pb-28 md:pt-28 lg:pb-32 lg:pt-32"
          : "pb-20 pt-20 md:pb-28 md:pt-32 lg:pb-36 lg:pt-40",
        anchor.className,
      )}
      background={
        opening ? (
          <div aria-hidden="true" className="opening-wash absolute inset-0" />
        ) : material ? (
          <SignalBackdrop
            variant={material === "infra" ? "grille" : material}
            labels={detectionLabels}
            className="opacity-90"
          />
        ) : undefined
      }
    >
      <div
        className={cn(
          side && "grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]",
        )}
      >
        <div>
          <HeroText block={block} level={level} opening={opening} />
          {animated ? (
            <div
              className="rise mt-12"
              style={{ "--d": 4 } as React.CSSProperties}
            >
              <MotionToggle labels={motion} />
            </div>
          ) : null}
        </div>
        {block.media ? (
          <div className="relative overflow-hidden rounded-frame border border-line">
            <CmsImage
              media={block.media}
              sizes="(min-width: 1024px) 560px, 100vw"
              priority
              className="h-auto w-full"
            />
          </div>
        ) : showcase && material ? (
          <div aria-hidden="true" className="hidden justify-end lg:flex">
            <HeroApproval t={showcase} />
          </div>
        ) : null}
      </div>
    </Section>
  );
}
