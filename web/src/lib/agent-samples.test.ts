import { describe, expect, it } from "vitest";
import { agentSamples, agentStreamingSample } from "./agent-samples";

describe("exemples d'appel d'un agent", () => {
  const samples = agentSamples(
    "https://nexora.exemple/v1",
    "agent/assistant-general",
  );
  it("couvrent curl, Python et TypeScript avec l'identifiant public et l'adresse de la passerelle", () => {
    expect(samples.map((s) => s.label)).toEqual([
      "curl",
      "Python",
      "TypeScript",
    ]);
    for (const s of samples) {
      expect(s.code).toContain("agent/assistant-general");
      expect(s.code).toContain("https://nexora.exemple/v1");
      expect(s.code).toContain("nxk_votre_cle_api");
    }
  });
  it("ne proposent aucun réglage de modèle sans effet sur un agent", () => {
    for (const s of samples) {
      expect(s.code).not.toContain("max_tokens");
      expect(s.code).not.toContain("temperature");
      expect(s.code).not.toContain('"system"');
    }
    expect(agentStreamingSample("agent/x")).toContain("stream: true");
  });
});
