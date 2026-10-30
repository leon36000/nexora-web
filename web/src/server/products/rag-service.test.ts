import { describe, expect, it } from "vitest";
import type { BaseView } from "../rag/bases";
import { createRagPanelService, toRagSummary } from "./rag-service";

const view = (over: Partial<BaseView> = {}): BaseView =>
  ({
    id: "b1",
    organizationId: "org1",
    name: "Contrats",
    description: "Les contrats 2026",
    createdAt: new Date("2026-10-30T12:00:00Z"),
    stats: {
      documents: 12,
      ready: 9,
      pending: 2,
      failed: 1,
      chunks: 300,
      bytes: 250_000,
    },
    ...over,
  }) as BaseView;

describe("adaptateur du RAG managé (chantier B) vers le panneau", () => {
  it("rend, pour chaque base, ses documents, ceux en attente ou en échec, et l'espace occupé", () => {
    expect(toRagSummary(view())).toEqual({
      id: "b1",
      name: "Contrats",
      description: "Les contrats 2026",
      createdAt: new Date("2026-10-30T12:00:00Z"),
      documents: 12,
      pending: 2,
      failed: 1,
      usedBytes: 250_000,
    });
  });

  it("ne transmet rien d'autre (ni organisation, ni modèles, ni paramètres de découpage)", () => {
    const keys = Object.keys(toRagSummary(view())).sort();
    expect(keys).toEqual([
      "createdAt",
      "description",
      "documents",
      "failed",
      "id",
      "name",
      "pending",
      "usedBytes",
    ]);
  });

  it("liste les bases de l'organisation demandée, dans l'ordre du chantier B", async () => {
    const asked: string[] = [];
    const service = createRagPanelService({
      list: async (org) => {
        asked.push(org);
        return [view({ id: "b2", name: "Récent" }), view({ id: "b1" })];
      },
      siteUrl: "https://site.example",
    });
    const bases = await service.listBases("org42");
    expect(asked).toEqual(["org42"]);
    expect(bases.map((b) => b.id)).toEqual(["b2", "b1"]);
  });

  it("les adresses de connexion viennent de l'adresse du site, barre finale retirée", () => {
    const service = createRagPanelService({
      list: async () => [],
      siteUrl: "https://site.example/",
    });
    expect(service.connection()).toEqual({
      siteUrl: "https://site.example",
      apiUrl: "https://site.example/v1/rag",
      mcpUrl: "https://site.example/v1/rag/mcp",
    });
  });
});
