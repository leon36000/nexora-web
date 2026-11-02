import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SectionBlock } from "@/server/cms/model";
import { SectionBlockView } from "./section-block";

const block = (
  media: SectionBlock["media"],
  captions: SectionBlock["captions"] = null,
): SectionBlock => ({
  type: "section",
  key: "s1",
  anchorId: null,
  tone: "clair",
  visual: "aucun",
  title: "Présentation",
  body: null,
  media,
  captions,
  poster: null,
  mediaPosition: "right",
  items: [],
});

const VIDEO = {
  id: "5a1b0000-0000-4000-8000-000000000001",
  width: 1920,
  height: 1080,
  alt: "",
  kind: "video" as const,
  mime: "video/mp4",
  durationMs: null,
};
const IMAGE = {
  id: "5a1b0000-0000-4000-8000-000000000009",
  width: 800,
  height: 600,
  alt: "Schéma",
  kind: "image" as const,
  mime: "image/png",
  durationMs: null,
};

describe("section : média vidéo ou image", () => {
  it("une vidéo prend la place de l'image : façade « Lire la vidéo », aucune image du média", () => {
    const html = renderToStaticMarkup(
      <SectionBlockView block={block(VIDEO)} lang="fr" />,
    );
    expect(html).toContain("Lire la vidéo");
    expect(html).toContain("aspect-video");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<video");
  });

  it("une image garde son rendu d'image, sans façade vidéo", () => {
    const html = renderToStaticMarkup(
      <SectionBlockView block={block(IMAGE)} lang="fr" />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain("Lire la vidéo");
  });
});
