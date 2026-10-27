import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDuration, VideoStage } from "./cms-video";

const VID = "5a1b0000-0000-4000-8000-000000000001";
const CAP = "5a1b0000-0000-4000-8000-000000000002";
const MEDIA = {
  id: VID,
  width: 1920,
  height: 1080,
  alt: "",
  kind: "video" as const,
  mime: "video/mp4",
  durationMs: 75_000,
};
const CAPTIONS = { id: CAP, lang: "fr-CA" as const };

const stage = (over: Partial<Parameters<typeof VideoStage>[0]> = {}) =>
  renderToStaticMarkup(
    <VideoStage
      lang="fr"
      title="Présentation d'OPSYS-AI"
      media={MEDIA}
      captions={CAPTIONS}
      open={false}
      onOpen={() => {}}
      {...over}
    />,
  );

describe("façade vidéo : aucun octet de vidéo avant le clic", () => {
  it("carte au ratio 16/9 avec le titre, la durée et un grand bouton « Lire la vidéo »", () => {
    const html = stage();
    expect(html).toContain("aspect-video");
    expect(html).toContain("Présentation d&#x27;OPSYS-AI");
    expect(html).toContain("1:15");
    expect(html).toContain("Lire la vidéo");
    expect(html).toContain("<button");
    expect(html).toContain('type="button"');
  });

  it("n'émet ni balise vidéo, ni piste, ni adresse de fichier", () => {
    const html = stage();
    expect(html).not.toContain("<video");
    expect(html).not.toContain("<track");
    expect(html).not.toContain("<source");
    expect(html).not.toContain("/api/media/");
    expect(html).not.toContain(VID);
    expect(html).not.toContain(CAP);
  });

  it("en anglais : libellé « Play the video »", () => {
    const html = stage({ lang: "en" });
    expect(html).toContain("Play the video");
    expect(html).not.toContain("Lire la vidéo");
  });

  it("sans durée connue, aucune durée n'est affichée", () => {
    const html = stage({ media: { ...MEDIA, durationMs: null } });
    expect(html).not.toMatch(/\d:\d\d/);
    expect(html).toContain("Lire la vidéo");
  });
});

describe("après le clic : lecteur natif avec source et sous-titres", () => {
  it("<video> contrôlé, lecture en ligne, préchargement, source MP4 du site", () => {
    const html = stage({ open: true });
    expect(html).toContain("<video");
    expect(html).toMatch(/<video[^>]*\bcontrols=""/);
    expect(html).toMatch(/<video[^>]*\bautoPlay=""|<video[^>]*\bautoplay=""/i);
    expect(html).toMatch(
      /<video[^>]*\bplaysInline=""|<video[^>]*\bplaysinline=""/i,
    );
    expect(html).toContain('preload="auto"');
    expect(html).toContain(`src="/api/media/${VID}"`);
    expect(html).toContain('type="video/mp4"');
    expect(html).not.toContain("Lire la vidéo");
  });

  it("piste de sous-titres par défaut, dans la langue de la traduction", () => {
    const html = stage({ open: true });
    expect(html).toContain('<track kind="captions"');
    expect(html).toContain(`src="/api/media/${CAP}"`);
    expect(html).toContain('srcLang="fr-CA"');
    expect(html).toContain('label="français canadien"');
    expect(html).toMatch(/<track[^>]*\bdefault=""/);
  });

  it("en anglais : piste « Canadian English »", () => {
    const html = stage({
      open: true,
      lang: "en",
      captions: { id: CAP, lang: "en-CA" },
    });
    expect(html).toContain('srcLang="en-CA"');
    expect(html).toContain('label="Canadian English"');
  });

  it("sans sous-titres, aucune piste", () => {
    const html = stage({ open: true, captions: null });
    expect(html).toContain("<video");
    expect(html).not.toContain("<track");
  });
});

describe("formatDuration", () => {
  it("mm:ss, avec les heures au-delà d'une heure ; absent si inconnu", () => {
    expect(formatDuration(75_000)).toBe("1:15");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
    expect(formatDuration(null)).toBeNull();
  });
});
