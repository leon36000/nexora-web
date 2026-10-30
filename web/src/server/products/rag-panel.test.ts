import { describe, expect, it } from "vitest";
import { defaultBaseName, loadRagPanel } from "./rag-panel";
import { baseSummary, FakeRagPanel } from "./test-support";

describe("nom proposé pour « Créer mon RAG »", () => {
  it("« Mon RAG » d'abord, puis « Mon RAG 2 », « Mon RAG 3 »… sans reprendre un nom pris", () => {
    expect(defaultBaseName("Mon RAG", [])).toBe("Mon RAG");
    expect(defaultBaseName("Mon RAG", ["Mon RAG"])).toBe("Mon RAG 2");
    expect(defaultBaseName("Mon RAG", ["Mon RAG", "Mon RAG 2"])).toBe(
      "Mon RAG 3",
    );
    expect(defaultBaseName("Mon RAG", ["Mon RAG 2"])).toBe("Mon RAG");
  });

  it("la comparaison ignore la casse et les espaces en trop", () => {
    expect(defaultBaseName("Mon RAG", ["  mon rag "])).toBe("Mon RAG 2");
  });
});

describe("panneau RAG : états", () => {
  const input = { orgId: "org1", defaultNameBase: "Mon RAG" };

  it("interrupteur éteint : « Bientôt », sans jamais appeler le service", async () => {
    const service = new FakeRagPanel();
    service.failList = new Error("ne doit pas être appelé");
    expect(await loadRagPanel({ ...input, enabled: false, service })).toEqual({
      kind: "soon",
    });
  });

  it("interrupteur allumé mais service non branché : « indisponible », pas de faux contenu", async () => {
    expect(
      await loadRagPanel({ ...input, enabled: true, service: null }),
    ).toEqual({ kind: "unavailable" });
  });

  it("le service échoue : état d'erreur, l'erreur elle-même n'est pas transmise à la page", async () => {
    const service = new FakeRagPanel();
    service.failList = new Error("secret interne : postgres://…");
    const model = await loadRagPanel({ ...input, enabled: true, service });
    expect(model).toEqual({ kind: "error" });
    expect(JSON.stringify(model)).not.toContain("postgres");
  });

  it("aucune base : liste vide, nom proposé « Mon RAG », informations de connexion fournies", async () => {
    const model = await loadRagPanel({
      ...input,
      enabled: true,
      service: new FakeRagPanel(),
    });
    expect(model).toMatchObject({
      kind: "ready",
      bases: [],
      defaultName: "Mon RAG",
      connection: { apiUrl: "https://site.example/v1/rag" },
    });
  });

  it("des bases existent : elles sont rendues dans l'ordre du service, le nom proposé évite les noms pris", async () => {
    const service = new FakeRagPanel();
    service.bases = [
      baseSummary({ id: "b2", name: "Mon RAG", usedBytes: 5 }),
      baseSummary({ id: "b1", name: "Contrats" }),
    ];
    const model = await loadRagPanel({ ...input, enabled: true, service });
    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") return;
    expect(model.bases.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(model.defaultName).toBe("Mon RAG 2");
    expect(model.totalBytes).toBe(5);
  });
});
