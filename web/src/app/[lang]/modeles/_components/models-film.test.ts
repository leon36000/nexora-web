import { describe, expect, it } from "vitest";
import type { Block, MediaRef, PageModel } from "@/server/cms/model";
import { pickModelsFilm } from "./models-film";

const ref = (id: string, kind: "image" | "video"): MediaRef => ({
  id,
  width: null,
  height: null,
  alt: "",
  kind,
  mime: kind === "video" ? "video/mp4" : "image/jpeg",
  durationMs: null,
});

const section = (anchorId: string | null, media: MediaRef | null): Block =>
  ({ type: "section", key: "k", anchorId, media }) as unknown as Block;

const page = (blocks: Block[]) => ({ blocks }) as unknown as PageModel;

describe("film de la page Modèles et API", () => {
  it("reprend la section d'ancre film", () => {
    const block = pickModelsFilm(
      page([
        section("autre", ref("x", "video")),
        section("film", ref("v", "video")),
      ]),
    );
    expect(block?.media?.id).toBe("v");
  });

  it("sans section, sans vidéo ou avec une image : aucune bande", () => {
    expect(pickModelsFilm(page([]))).toBeNull();
    expect(pickModelsFilm(page([section("film", null)]))).toBeNull();
    expect(
      pickModelsFilm(page([section("film", ref("i", "image"))])),
    ).toBeNull();
  });
});
