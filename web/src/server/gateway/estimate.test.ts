import { describe, expect, it } from "vitest";
import { estimateOutputTokens, estimateTokens, MEDIA_TOKENS } from "./estimate";

const image = (url: string) => ({
  type: "image_url",
  image_url: { url },
});

describe("estimation des jetons d'entrée", () => {
  it("chaque image par adresse vaut le forfait, quelle que soit la longueur de l'adresse", () => {
    const short = estimateTokens({
      messages: [{ role: "user", content: [image("https://a.b/x.png")] }],
    });
    const long = estimateTokens({
      messages: [
        {
          role: "user",
          content: [image(`https://a.b/${"x".repeat(5000)}.png`)],
        },
      ],
    });
    expect(short).toBeGreaterThanOrEqual(MEDIA_TOKENS);
    expect(short).toBe(long);
  });

  it("50 images par adresse (requête qui tient en quelques kilo-octets) réservent au moins 50 forfaits", () => {
    const parts = Array.from({ length: 50 }, (_, i) =>
      image(`https://a.b/${i}.png`),
    );
    const body = { messages: [{ role: "user", content: parts }] };
    expect(JSON.stringify(body).length).toBeLessThan(6000);
    expect(estimateTokens(body)).toBeGreaterThanOrEqual(50 * MEDIA_TOKENS);
  });

  it("une image en data: vaut aussi le forfait (pas la taille du texte encodé)", () => {
    const small = estimateTokens({ c: [image("data:image/png;base64,AAAA")] });
    const big = estimateTokens({
      c: [image(`data:image/png;base64,${"A".repeat(200_000)}`)],
    });
    expect(big).toBe(small);
  });

  it("l'audio d'entrée vaut le forfait", () => {
    const audio = {
      type: "input_audio",
      input_audio: { data: "AAAA", format: "wav" },
    };
    expect(estimateTokens({ c: [audio] })).toBeGreaterThanOrEqual(MEDIA_TOKENS);
  });

  it("un texte ASCII compte un jeton pour trois octets", () => {
    expect(estimateTokens("a".repeat(300))).toBe(100);
  });

  it("un texte non ASCII compte un jeton par octet UTF-8", () => {
    // 100 idéogrammes = 300 octets UTF-8 = 300 jetons (contre 100 à raison de 3 octets par jeton).
    expect(estimateTokens("漢".repeat(100))).toBe(300);
    // Emoji : 4 octets, 4 jetons.
    expect(estimateTokens("😀".repeat(10))).toBe(40);
    // Accent : é = 2 octets.
    expect(estimateTokens("é".repeat(50))).toBe(100);
  });

  it("texte mixte : l'ASCII au tiers, le reste à l'octet", () => {
    expect(estimateTokens(`${"a".repeat(30)}${"é".repeat(5)}`)).toBe(10 + 10);
  });

  it("ne descend jamais sous un jeton", () => {
    expect(estimateTokens("")).toBe(1);
  });
});

describe("estimation prudente : aucune astuce de forme ne réduit la réservation", () => {
  it("un objet type:text qui porte une clé image_url est compté comme du texte, pas au forfait média", () => {
    const hidden = "a".repeat(30_000); // 10 000 jetons
    const n = estimateTokens({
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: hidden, image_url: "x" }],
        },
      ],
    });
    expect(n).toBeGreaterThanOrEqual(10_000);
    const audio = estimateTokens({
      c: [{ type: "text", text: hidden, input_audio: "x" }],
    });
    expect(audio).toBeGreaterThanOrEqual(10_000);
  });

  it("un vrai média compte le forfait ET tout texte qui l'accompagne", () => {
    const text = "b".repeat(30_000);
    const n = estimateTokens({
      c: [{ type: "image_url", image_url: { url: "https://a.b/x.png" }, text }],
    });
    expect(n).toBeGreaterThanOrEqual(MEDIA_TOKENS + 10_000);
  });

  it("une imbrication de plus de 40 niveaux n'est pas comptée pour zéro", () => {
    let deep: unknown = "c".repeat(30_000);
    for (let i = 0; i < 80; i++) deep = { a: deep };
    expect(estimateTokens({ messages: deep })).toBeGreaterThanOrEqual(10_000);
    let deepArr: unknown = "d".repeat(30_000);
    for (let i = 0; i < 80; i++) deepArr = [deepArr];
    expect(estimateTokens(deepArr)).toBeGreaterThanOrEqual(10_000);
  });

  it("une imbrication si profonde que JSON.stringify échoue donne une estimation énorme (refus), jamais zéro", () => {
    let deep: unknown = "e";
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(estimateTokens(deep)).toBeGreaterThan(1_000_000);
  });
});

describe("estimation de la sortie", () => {
  it("zéro caractère : zéro jeton ; sinon au moins un", () => {
    expect(estimateOutputTokens(0)).toBe(0);
    expect(estimateOutputTokens(1)).toBe(1);
    expect(estimateOutputTokens(30)).toBe(10);
  });
});
