import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/cn";
import type { SectionBlock } from "@/server/cms/model";
import { CmsImage } from "./cms-image";
import { RichText } from "./rich-text";

/** Section : titre, texte riche, média (gauche, droite ou au-dessus) et liste de points. */
export function SectionBlockView({
  block,
  surface,
}: {
  block: SectionBlock;
  surface: boolean;
}) {
  const titleId = `${block.key}-title`;
  const withMedia = block.media && block.mediaPosition !== "none";
  const side =
    withMedia &&
    (block.mediaPosition === "left" || block.mediaPosition === "right");
  const media =
    withMedia && block.media ? (
      <div className="overflow-hidden rounded-lg border border-line">
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
            "max-w-2xl text-lead text-fg-muted",
            block.title && "mt-6",
          )}
        />
      ) : null}
    </div>
  );
  return (
    <Section
      tone="light"
      surface={surface}
      aria-labelledby={block.title ? titleId : undefined}
    >
      {side ? (
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className={cn(block.mediaPosition === "left" && "lg:order-2")}>
            {text}
          </div>
          <div className={cn(block.mediaPosition === "left" && "lg:order-1")}>
            {media}
          </div>
        </div>
      ) : (
        <>
          {withMedia ? <div className="mb-10 max-w-4xl">{media}</div> : null}
          {text}
        </>
      )}
      {block.items.length > 0 ? (
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {block.items.map((item) => (
            <li key={`${item.title ?? ""}|${item.text ?? ""}`} className="flex">
              <Card className="flex w-full flex-col">
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
