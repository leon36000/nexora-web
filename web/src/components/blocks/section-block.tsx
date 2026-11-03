import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { SectionVisualFigure } from "@/components/visuals";
import type { Lang } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { hasWideContent } from "@/lib/rich-text";
import type { SectionBlock } from "@/server/cms/model";
import { CELL_GRID, cellClasses } from "./card-grid";
import { CmsImage } from "./cms-image";
import { CmsVideo } from "./cms-video";
import { RichText } from "./rich-text";
import { anchorProps, effectiveTone, toneProps } from "./tone";

/**
 * Section : titre, texte riche, média ou schéma (gauche, droite ou au-dessus) et liste de points.
 * Un schéma (`visual`) prend la place du média ; sans position, il se place à droite.
 */
export function SectionBlockView({
  block,
  joined,
  lang,
}: {
  block: SectionBlock;
  joined?: "after" | "before" | "both";
  lang: Lang;
}) {
  const titleId = `${block.key}-title`;
  const anchor = anchorProps(block.anchorId);
  const visual = block.visual && block.visual !== "aucun" ? block.visual : null;
  const withMedia = !visual && block.media && block.mediaPosition !== "none";
  const side =
    Boolean(visual) ||
    (withMedia &&
      (block.mediaPosition === "left" || block.mediaPosition === "right"));
  const left = block.mediaPosition === "left";
  const media = visual ? (
    <SectionVisualFigure visual={visual} lang={lang} />
  ) : withMedia && block.media?.kind === "video" ? (
    <CmsVideo
      lang={lang}
      title={block.title}
      media={block.media}
      captions={block.captions}
      poster={block.poster}
    />
  ) : withMedia && block.media ? (
    <div className="overflow-hidden rounded-frame border border-line">
      <CmsImage
        media={block.media}
        sizes={
          side
            ? "(min-width: 1024px) 560px, 100vw"
            : "(min-width: 1280px) 1100px, 100vw"
        }
        className="h-auto w-full"
      />
    </div>
  ) : null;
  const text = (
    <div>
      {block.title ? (
        <SectionHeader id={titleId} title={block.title} narrow={false} />
      ) : null}
      {block.body ? (
        <RichText
          nodes={block.body}
          demote={Boolean(block.title)}
          className={cn(
            // un tableau ou un bloc de code a besoin de plus de largeur que le texte courant
            hasWideContent(block.body) ? "max-w-4xl" : "max-w-2xl",
            "text-lead text-fg-muted",
            block.title && "mt-6",
          )}
        />
      ) : null}
    </div>
  );
  const cells = cellClasses(block.items.length, 3);
  // Scène large : un schéma « au-dessus » devient la vitrine d'un produit, sous un titre en deux colonnes.
  if (visual && block.mediaPosition === "top") {
    return (
      <Section
        {...toneProps(effectiveTone(block))}
        joined={joined}
        aria-labelledby={block.title ? titleId : undefined}
        id={anchor.id}
        className={cn(anchor.className, "overflow-hidden")}
      >
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-16">
          {block.title ? (
            <div className="lg:col-span-7">
              <SectionHeader id={titleId} title={block.title} narrow={false} />
            </div>
          ) : null}
          {block.body ? (
            <RichText
              nodes={block.body}
              demote={Boolean(block.title)}
              className="max-w-xl text-lead text-fg-muted lg:col-span-5"
            />
          ) : null}
        </div>
        <div className="relative mt-12 md:mt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-24 -top-24 bottom-1/3 -z-10 bg-[radial-gradient(60%_55%_at_50%_0%,rgb(255_102_0/0.22),transparent_72%)]"
          />
          {media}
        </div>
        {block.items.length > 0 ? (
          <ul className="mt-12 grid gap-x-10 gap-y-8 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-3 md:mt-16">
            {block.items.map((item) => (
              <li key={`${item.title ?? ""}|${item.text ?? ""}`}>
                {item.title ? (
                  <h3 className="text-h4 text-fg">{item.title}</h3>
                ) : null}
                {item.text ? (
                  <p className={cn("text-fg-muted", item.title && "mt-2")}>
                    {item.text}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    );
  }
  // Bloc « visuel seul » : ni titre, ni texte, ni points. La maquette occupe la bande, centrée (vitrine d'un produit).
  if (visual && !block.title && !block.body && block.items.length === 0) {
    return (
      <Section
        {...toneProps(effectiveTone(block))}
        joined={joined}
        id={anchor.id}
        className={anchor.className}
      >
        <div className="mx-auto max-w-4xl">{media}</div>
      </Section>
    );
  }
  return (
    <Section
      {...toneProps(effectiveTone(block))}
      joined={joined}
      aria-labelledby={block.title ? titleId : undefined}
      id={anchor.id}
      className={anchor.className}
    >
      {side ? (
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className={cn(left && "lg:order-2")}>{text}</div>
          <div className={cn(left && "lg:order-1")}>{media}</div>
        </div>
      ) : (
        <>
          {/* une vidéo en vitrine (film) vient après son titre, sur toute la largeur ; une image reste au-dessus */}
          {media && block.media?.kind !== "video" ? (
            <div className="mb-12 max-w-4xl">{media}</div>
          ) : null}
          {text}
          {media && block.media?.kind === "video" ? (
            <div className="reveal mt-12 md:mt-16">{media}</div>
          ) : null}
        </>
      )}
      {block.items.length > 0 ? (
        <ul className={cn(CELL_GRID, "mt-12")}>
          {block.items.map((item, i) => (
            <li
              key={`${item.title ?? ""}|${item.text ?? ""}`}
              className={cells[i]}
            >
              <Card variant="cell" className="flex w-full flex-col">
                {item.title ? (
                  <h3 className="text-h4 text-fg">{item.title}</h3>
                ) : null}
                {item.text ? (
                  <p className={cn("text-fg-muted", item.title && "mt-3")}>
                    {item.text}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
