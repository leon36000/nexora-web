import { describe, expect, it } from "vitest";
import type { Block, MediaRef, PageModel } from "@/server/cms/model";
import { pickCreativeFilm } from "./creative-film";

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
  ({
    type: "section",
    key: "k",
    anchorId,
    media,
    poster: ref("p", "image"),
  }) as unknown as Block;

const page = (blocks: Block[]) => ({ blocks }) as unknown as PageModel;

describe("film de la fiche Creative", () => {
  it("reprend la vidéo et l'affiche de la section d'ancre creative", () => {
    const film = pickCreativeFilm(
      page([
        section("autre", ref("x", "video")),
        section("creative", ref("v", "video")),
      ]),
    );
    expect(film?.media.id).toBe("v");
    expect(film?.poster?.id).toBe("p");
  });

  it("sans section, sans vidéo ou avec une image : aucun lecteur", () => {
    expect(pickCreativeFilm(page([]))).toBeNull();
    expect(pickCreativeFilm(page([section("creative", null)]))).toBeNull();
    expect(
      pickCreativeFilm(page([section("creative", ref("i", "image"))])),
    ).toBeNull();
  });
});
