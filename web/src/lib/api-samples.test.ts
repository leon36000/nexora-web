import { describe, expect, it } from "vitest";
import { agentSamples, agentStreamingSample } from "./agent-samples";
import { apiExampleModelId, apiSamples, streamingSample } from "./api-samples";

const FRENCH = /Bonjour|Raconte|votre|nom-du-modele|courte histoire/i;

describe("exemples d'appel de l'API : une langue par page", () => {
  it("en anglais, aucun exemple ne contient de mot français", () => {
    const all = [
      ...apiSamples("https://x.test/v1", apiExampleModelId("en"), "chat", "en"),
      ...apiSamples(
        "https://x.test/v1",
        apiExampleModelId("en"),
        "embedding",
        "en",
      ),
      ...agentSamples("https://x.test/v1", "agent/x", "en"),
    ].map((s) => s.code);
    all.push(streamingSample(apiExampleModelId("en"), "en"));
    all.push(agentStreamingSample("agent/x", "en"));
    for (const code of all) expect(code).not.toMatch(FRENCH);
    expect(all.join("\n")).toContain("nxk_your_api_key");
  });

  it("en français (défaut), les exemples restent inchangés", () => {
    const chat = apiSamples("https://x.test/v1", apiExampleModelId("fr"))
      .map((s) => s.code)
      .join("\n");
    expect(chat).toContain("Bonjour !");
    expect(chat).toContain("nxk_votre_cle_api");
    expect(apiExampleModelId("fr")).toBe("nexora/nom-du-modele");
    expect(streamingSample("m")).toContain("Raconte une courte histoire.");
  });
});
