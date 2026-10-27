import { beforeEach, describe, expect, it } from "vitest";
import { embedCspFor, resetEmbedPolicyCache } from "./embed-policy";

const source = { origin: "https://ia.exemple.ca", pages: ["/agents"] };
beforeEach(() => resetEmbedPolicyCache());

describe("embedCspFor", () => {
  it("renvoie la politique de la seule origine configurée, sur les pages choisies", async () => {
    const csp = await embedCspFor("/en/agents", { load: async () => source });
    expect(csp).toContain("frame-src https://ia.exemple.ca");
    expect(csp).not.toContain("*");
    expect(
      await embedCspFor("/solutions", { load: async () => source }),
    ).toBeNull();
  });
  it("n'ajoute rien quand la bulle est désactivée", async () => {
    expect(await embedCspFor("/agents", { load: async () => null })).toBeNull();
  });
  it("échoue ouvert (aucun en-tête) quand la lecture échoue", async () => {
    expect(
      await embedCspFor("/agents", {
        load: async () => {
          throw new Error("base indisponible");
        },
      }),
    ).toBeNull();
  });
  it("garde le réglage en cache pour un court délai puis le relit", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return source;
    };
    await embedCspFor("/agents", { load, now: 1000 });
    await embedCspFor("/agents", { load, now: 5000 });
    expect(calls).toBe(1);
    await embedCspFor("/agents", { load, now: 20_000 });
    expect(calls).toBe(2);
  });
});
