import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lang as getLang } from "next/root-params";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageBlocks } from "@/components/blocks/page-blocks";
import { Logo } from "@/components/brand/logo";
import { isLang } from "@/i18n/config";
import { getVisualsDictionary } from "@/i18n/visuals";
import {
  type Block,
  type CardLayout,
  type PageModel,
  SECTION_VISUALS,
  TONES,
  type Tone,
} from "@/server/cms/model";

/**
 * Galerie des composants de la marque (outil de développement) : tous les visuels, tous les tons, toutes les
 * dispositions de cartes, sur le vrai chemin de rendu des blocs. Répond 404 hors développement : seule la variable
 * NEXORA_GALERIE_MARQUE=1 l'ouvre. Jamais dans le sitemap, jamais indexée.
 */
export const metadata: Metadata = {
  title: "Galerie de la marque",
  robots: { index: false, follow: false },
};

async function Gallery() {
  await connection();
  const lang = await getLang();
  if (!isLang(lang) || process.env.NEXORA_GALERIE_MARQUE !== "1") notFound();
  const v = getVisualsDictionary(lang);
  const cards = v.commitments.items.map((c, i) => ({
    title: c.title,
    text: c.text,
    href: i % 2 === 0 ? "/contact/" : null,
    linkLabel: i % 2 === 0 ? v.hero.approve : null,
    label: null,
    status: null,
  }));
  const blocks: Block[] = [
    {
      type: "hero",
      key: "g-hero",
      anchorId: null,
      variant: "sombre",
      perimeterGrid: true,
      media: null,
      eyebrow: v.hero.label,
      headline: v.hero.title,
      subheadline: v.hero.body,
      primary: { label: v.hero.approve, href: "/contact/" },
      secondary: { label: v.hero.edit, href: "/contact/" },
    },
  ];
  const tones: Tone[] = [...TONES];
  for (const visual of SECTION_VISUALS) {
    if (visual === "aucun") continue;
    blocks.push({
      type: "section",
      key: `g-${visual}`,
      anchorId: visual,
      tone: tones[blocks.length % 3] ?? "clair",
      visual,
      title: visual,
      body: null,
      media: null,
      captions: null,
      mediaPosition: "none",
      items: [],
    });
  }
  const layouts: CardLayout[] = ["bento", "grille", "liste", "etapes"];
  layouts.forEach((layout, i) => {
    blocks.push({
      type: "cards",
      key: `g-cards-${layout}`,
      anchorId: layout,
      tone: tones[(i + 1) % 3] ?? "clair",
      layout,
      columns: 3,
      title: layout,
      intro: null,
      cards: cards.slice(0, 5),
    });
  });
  const page: PageModel = {
    id: "galerie",
    lang: lang === "fr" ? "fr-CA" : "en-CA",
    slug: "",
    title: "Galerie",
    seoTitle: null,
    seoDescription: null,
    canonical: null,
    noindex: true,
    seoImageId: null,
    blocks,
    translations: [],
  };
  return (
    <>
      <div className="flex flex-wrap items-center gap-8 bg-paper-50 px-8 py-10">
        <Logo tone="light" label="Nexora AI" className="h-12" />
        <Logo
          tone="dark"
          label="Nexora AI"
          className="h-12 rounded-sm bg-ink-950 p-3"
        />
        <Logo
          tone="light"
          wordmark={false}
          label="Nexora AI"
          className="size-12"
        />
      </div>
      <PageBlocks lang={lang} page={page} />
    </>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  );
}
