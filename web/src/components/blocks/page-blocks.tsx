import type { Lang } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import type { PageModel } from "@/server/cms/model";
import { CardsBlockView } from "./cards-block";
import { CtaBlockView } from "./cta-block";
import { FaqBlockView } from "./faq-block";
import { HeroBlockView } from "./hero-block";
import { PricingBlockView } from "./pricing-block";
import { SectionBlockView } from "./section-block";

/**
 * Rend les blocs d'une page dans l'ordre. Les sections claires alternent entre fond et surface ;
 * un seul h1 par page (premier héros, sinon un h1 réservé aux lecteurs d'écran avec le titre de la page).
 */
export function PageBlocks({ lang, page }: { lang: Lang; page: PageModel }) {
  const { cms } = getDictionary(lang);
  const hasHero = page.blocks.some((b) => b.type === "hero");
  let heroSeen = false;
  let light = 0;
  const nextSurface = () => light++ % 2 === 1;
  return (
    <>
      {hasHero ? null : <h1 className="sr-only">{page.title}</h1>}
      {page.blocks.map((block) => {
        switch (block.type) {
          case "hero": {
            const level = heroSeen ? 2 : 1;
            heroSeen = true;
            light = 0;
            return (
              <HeroBlockView key={block.key} block={block} level={level} />
            );
          }
          case "section":
            return (
              <SectionBlockView
                key={block.key}
                block={block}
                surface={nextSurface()}
              />
            );
          case "cards":
            return (
              <CardsBlockView
                key={block.key}
                block={block}
                surface={nextSurface()}
              />
            );
          case "pricing":
            return (
              <PricingBlockView
                key={block.key}
                block={block}
                surface={nextSurface()}
                t={cms}
              />
            );
          case "faq":
            return (
              <FaqBlockView
                key={block.key}
                block={block}
                surface={nextSurface()}
              />
            );
          case "cta":
            light = 0;
            return <CtaBlockView key={block.key} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}
