import { Fragment } from "react";
import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildToc } from "@/lib/toc";
import type { Block, PageModel, Tone } from "@/server/cms/model";
import { CardsBlockView } from "./cards-block";
import { CtaBlockView } from "./cta-block";
import { FaqBlockView } from "./faq-block";
import { HeroBlockView } from "./hero-block";
import { PageToc } from "./page-toc";
import { PricingBlockView } from "./pricing-block";
import { SectionBlockView } from "./section-block";

/** Ton d'un bloc ; défensif : un instantané antérieur à S3 n'a pas encore de ton. */
function toneOf(block: Block): Tone {
  if (block.type === "hero") return block.variant ?? "sombre";
  if (block.type === "cta") return block.tone ?? "sombre";
  return block.tone ?? "clair";
}

/** Un bloc de contenu (ni héros ni appel à l'action) peut prolonger le précédent quand leur ton est le même. */
const joinable = (block: Block | undefined): block is Block =>
  block !== undefined && block.type !== "hero" && block.type !== "cta";

/**
 * Rend les blocs d'une page dans l'ordre, chacun à son ton (sombre, clair, sable). Deux blocs de contenu voisins
 * du même ton ne forment qu'une bande (espacement resserré). Un seul h1 par page (premier héros, sinon un h1
 * réservé aux lecteurs d'écran). Avec au moins trois ancres, un sommaire collant suit le premier bloc.
 */
export function PageBlocks({ lang, page }: { lang: Lang; page: PageModel }) {
  const { cms } = getDictionary(lang);
  const hasHero = page.blocks.some((b) => b.type === "hero");
  const toc = buildToc(page.blocks);
  let heroSeen = false;
  const tocAfter = page.blocks[0]?.type === "hero" ? 0 : -1;
  const tocNode = toc ? (
    <PageToc
      key="toc"
      entries={toc}
      label={cms.toc.label}
      openLabel={cms.toc.open}
    />
  ) : null;
  return (
    <>
      {hasHero ? null : <h1 className="sr-only">{page.title}</h1>}
      {tocAfter === -1 ? tocNode : null}
      {page.blocks.map((block, i) => {
        const prev = page.blocks[i - 1];
        const next = page.blocks[i + 1];
        const sameAsPrev =
          joinable(block) && joinable(prev) && toneOf(prev) === toneOf(block);
        const sameAsNext =
          joinable(block) && joinable(next) && toneOf(next) === toneOf(block);
        const joined = sameAsPrev
          ? sameAsNext
            ? ("both" as const)
            : ("after" as const)
          : sameAsNext
            ? ("before" as const)
            : undefined;
        let view: React.ReactNode = null;
        switch (block.type) {
          case "hero": {
            const level = heroSeen ? 2 : 1;
            heroSeen = true;
            view = <HeroBlockView block={block} level={level} />;
            break;
          }
          case "section":
            view = <SectionBlockView block={block} joined={joined} t={cms} />;
            break;
          case "cards":
            view = <CardsBlockView block={block} joined={joined} t={cms} />;
            break;
          case "pricing":
            view = <PricingBlockView block={block} joined={joined} t={cms} />;
            break;
          case "faq":
            view = <FaqBlockView block={block} joined={joined} />;
            break;
          case "cta":
            view = <CtaBlockView block={block} joined={joined} />;
            break;
          default:
            view = null;
        }
        return (
          <Fragment key={block.key}>
            {view}
            {i === tocAfter ? tocNode : null}
          </Fragment>
        );
      })}
    </>
  );
}
