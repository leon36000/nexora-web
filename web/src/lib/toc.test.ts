import { describe, expect, it } from "vitest";
import type { Block } from "@/server/cms/model";
import { buildToc, MIN_TOC_ANCHORS } from "./toc";

const base = { key: "k", anchorId: null };
const section = (anchorId: string | null, title: string | null): Block => ({
  ...base,
  type: "section",
  tone: "clair",
  visual: "aucun",
  title,
  body: null,
  media: null,
  captions: null,
  poster: null,
  mediaPosition: "none",
  items: [],
  anchorId,
});
const faq = (anchorId: string | null): Block => ({
  ...base,
  type: "faq",
  tone: "clair",
  emitJsonLd: true,
  title: "Questions",
  items: [{ question: "q", answer: "a" }],
  anchorId,
});

describe("sommaire des pages longues", () => {
  it("exige au moins trois blocs avec ancre", () => {
    expect(MIN_TOC_ANCHORS).toBe(3);
    expect(
      buildToc([section("a", "A"), section("b", "B"), section(null, "C")]),
    ).toBeNull();
    const toc = buildToc([section("a", "A"), faq("b"), section("c", "C")]);
    expect(toc?.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(toc?.map((e) => e.label)).toEqual(["A", "Questions", "C"]);
  });

  it("ignore les ancres en double (la première gagne) et retombe sur l'identifiant sans titre", () => {
    const toc = buildToc([
      section("a", "A"),
      section("a", "Doublon"),
      section("b", null),
      section("c", "C"),
    ]);
    expect(toc?.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(toc?.[1]?.label).toBe("b");
  });

  it("retire le point final des titres ponctués du CMS", () => {
    const toc = buildToc([
      section("a", "Les dix départements."),
      section("b", "Vos questions. Nos réponses."),
      section("c", "Sans point"),
    ]);
    expect(toc?.map((e) => e.label)).toEqual([
      "Les dix départements",
      "Vos questions. Nos réponses",
      "Sans point",
    ]);
  });
});
