import { describe, expect, it } from "vitest";
import { checkInstance, discoverAgents } from "./discovery";

const KEY = "sk-nexora-CLE-SECRETE-0123456789abcdef";
const instance = {
  baseUrl: "http://ws.internal:3200/",
  secretRef: "workstudio.essai",
};
const models = {
  object: "list",
  data: [
    { id: "nexora-default", object: "model", owned_by: "nexora" },
    {
      id: "agent:Assistant général",
      object: "model",
      owned_by: "nexora-agent",
      name: "Assistant général",
      description: "Répond aux questions.",
    },
    {
      id: "agent:641a6a96-ce5c-43e2-9be4-b41a6c9e1c21",
      name: "Factures",
      description: null,
    },
    { id: "agent:", name: "vide" },
    { id: 12 },
  ],
};

function deps(fetchImpl: typeof fetch, secret: string | Error = KEY) {
  return {
    getSecret: async () => {
      if (secret instanceof Error) throw secret;
      return secret;
    },
    fetch: fetchImpl,
  };
}

describe("discoverAgents", () => {
  it("lit /v1/models avec la clé du coffre et ne garde que les agents", async () => {
    let seen: { url: string; auth: string | null } | null = null;
    const result = await discoverAgents(
      instance,
      deps((async (url, init) => {
        seen = {
          url: String(url),
          auth: new Headers(init?.headers).get("authorization"),
        };
        return Response.json(models);
      }) as typeof fetch),
    );
    expect(seen).toEqual({
      url: "http://ws.internal:3200/v1/models",
      auth: `Bearer ${KEY}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents).toEqual([
      {
        upstreamId: "agent:Assistant général",
        name: "Assistant général",
        description: "Répond aux questions.",
      },
      {
        upstreamId: "agent:641a6a96-ce5c-43e2-9be4-b41a6c9e1c21",
        name: "Factures",
        description: "",
      },
    ]);
    expect(result.detail).toContain("2 agent");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([
    [401, "clé refusée"],
    [403, "clé refusée"],
    [500, "HTTP 500"],
  ])("décrit un échec HTTP %i sans corps de réponse", async (status, text) => {
    const result = await discoverAgents(
      instance,
      deps((async () =>
        Response.json(
          { error: { message: `fuite ${KEY}` } },
          { status },
        )) as typeof fetch),
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(text);
    expect(result.detail).not.toContain("fuite");
    expect(result.detail).not.toContain(KEY);
  });

  it("décrit une instance injoignable, une réponse invalide et un coffre sans clé", async () => {
    const down = await discoverAgents(
      instance,
      deps((async () => {
        throw new Error(`ECONNREFUSED ${KEY}`);
      }) as typeof fetch),
    );
    expect(down).toMatchObject({ ok: false });
    expect(down.detail).not.toContain(KEY);
    const html = await discoverAgents(
      instance,
      deps((async () => new Response("<html>")) as typeof fetch),
    );
    expect(html).toMatchObject({ ok: false });
    const noKey = await discoverAgents(
      instance,
      deps(fetch, new Error("introuvable")),
    );
    expect(noKey).toMatchObject({ ok: false });
    expect(noKey.detail).toContain("coffre");
    const noRef = await discoverAgents(
      { ...instance, secretRef: null },
      deps(fetch),
    );
    expect(noRef).toMatchObject({ ok: false });
  });

  it("limite la taille des textes et le nombre d'agents lus", async () => {
    const many = {
      data: Array.from({ length: 700 }, (_, i) => ({
        id: `agent:a${i}`,
        name: `A${i}`,
        description: "d".repeat(5000),
      })),
    };
    const result = await discoverAgents(
      instance,
      deps((async () => Response.json(many)) as typeof fetch),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.agents.length).toBe(500);
    expect(result.agents[0]?.description.length).toBe(2000);
  });
});

describe("checkInstance", () => {
  it("résume le test de connexion", async () => {
    const check = await checkInstance(
      instance,
      deps((async () => Response.json(models)) as typeof fetch),
    );
    expect(check.ok).toBe(true);
    expect(check.detail).toMatch(/HTTP 200 en \d+ ms/);
  });
});
