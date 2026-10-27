import { describe, expect, it } from "vitest";
import type { CallableAgent, EmbedSettings } from "./catalog";
import { publicAgents, toPublicAgent, toPublicEmbed } from "./public";

const agent = (over: Partial<CallableAgent> = {}): CallableAgent => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "assistant-general",
  publicId: "agent/assistant-general",
  upstreamId: "agent:641a6a96-ce5c-43e2-9be4-b41a6c9e1c21",
  nameFr: "Assistant général",
  nameEn: "General assistant",
  descriptionFr: "Répond.",
  descriptionEn: "Answers.",
  category: "general",
  visibility: "public",
  runTokenCap: 32000,
  publishedAt: new Date("2026-10-27T10:00:00Z"),
  region: "quebec",
  instance: {
    id: "i",
    baseUrl: "http://ws.interne:3200",
    secretRef: "workstudio.cle",
  },
  price: {
    id: "p",
    inputCadMicro: 1_000_000n,
    outputCadMicro: 0n,
    perRunCadMicro: 50_000n,
    isTrial: true,
    note: "",
  },
  ...over,
});

describe("vue publique d'un agent", () => {
  it("ne contient ni l'instance, ni la référence du coffre, ni l'identifiant amont", () => {
    const text = JSON.stringify(toPublicAgent(agent()));
    for (const secret of ["ws.interne", "workstudio.cle", "641a6a96", "agent:"])
      expect(text).not.toContain(secret);
  });
  it("écrit les prix en décimaux exacts et garde le marquage d'essai", () => {
    expect(toPublicAgent(agent())).toMatchObject({
      id: "agent/assistant-general",
      inputPerMillion: "1",
      outputPerMillion: "0",
      perRun: "0.05",
      trial: true,
    });
  });
  it("ne liste que les agents publics", () => {
    const list = publicAgents([
      agent(),
      agent({ slug: "a-cache", visibility: "unlisted" }),
      agent({ slug: "interne", visibility: "private" }),
    ]);
    expect(list.map((a) => a.slug)).toEqual(["assistant-general"]);
  });
});

describe("réglage public de la bulle", () => {
  const base: EmbedSettings = {
    enabled: true,
    origin: "https://ia.exemple.ca",
    chatIdentifier: "support",
    pages: ["/agents"],
    position: "right",
    color: null,
    labelFr: null,
    labelEn: null,
    updatedAt: null,
  };
  it("est nul quand la bulle est désactivée ou incomplète", () => {
    expect(toPublicEmbed({ ...base, enabled: false })).toBeNull();
    expect(toPublicEmbed({ ...base, origin: null })).toBeNull();
    expect(toPublicEmbed({ ...base, chatIdentifier: null })).toBeNull();
    expect(toPublicEmbed({ ...base, pages: [] })).toBeNull();
  });
  it("ne transmet que ce qui sert à afficher la bulle", () => {
    expect(toPublicEmbed(base)).toEqual({
      origin: "https://ia.exemple.ca",
      chatIdentifier: "support",
      pages: ["/agents"],
      position: "right",
      color: null,
      labelFr: null,
      labelEn: null,
    });
  });
});
