import { describe, expect, it } from "vitest";
import {
  assertAgentRequestAllowed,
  createAgentDirectus,
  ForbiddenDirectusRequest,
  isAgentRequestAllowed,
} from "./directus-client.ts";

const V = "0b9a7f0e-6a54-4f53-9c63-5b7c0a1d2e3f";

describe("garde du client Directus des agents (liste fermée)", () => {
  it("autorise lecture des pages, coquille en brouillon, version, enregistrement et approbation", () => {
    expect(isAgentRequestAllowed("GET", `/items/pages/${V}?fields=id`)).toBe(
      true,
    );
    expect(
      isAgentRequestAllowed("GET", "/items/pages_translations?limit=1"),
    ).toBe(true);
    expect(
      isAgentRequestAllowed("POST", "/items/pages?fields=id", {
        status: "draft",
      }),
    ).toBe(true);
    expect(
      isAgentRequestAllowed("POST", "/versions", {
        collection: "pages",
        item: V,
      }),
    ).toBe(true);
    expect(isAgentRequestAllowed("POST", `/versions/${V}/save`, {})).toBe(true);
    expect(
      isAgentRequestAllowed("POST", "/items/approvals", { version_id: V }),
    ).toBe(true);
  });

  it.each([
    ["DELETE", `/items/pages/${V}`],
    ["PATCH", `/items/pages/${V}`],
    ["PUT", `/items/pages/${V}`],
    ["DELETE", `/versions/${V}`],
    ["POST", `/versions/${V}/promote`],
    ["PATCH", "/items/approvals/1"],
    ["POST", "/items/directus_users"],
    ["POST", "/users"],
    ["POST", "/permissions"],
    ["GET", "/items/claims"],
    ["GET", "/users/me"],
    ["POST", "/items/pages_translations"],
    ["POST", "/items/block_hero"],
    ["POST", "/files"],
    ["GET", `/items/pages/${V}/../../users`],
    ["GET", "/items/pages%2F..%2Fusers"],
  ])("refuse %s %s", (method, path) => {
    expect(
      isAgentRequestAllowed(method, path, {
        status: "draft",
        collection: "pages",
      }),
    ).toBe(false);
  });

  it("refuse une coquille publiée et une version hors de la collection pages", () => {
    expect(
      isAgentRequestAllowed("POST", "/items/pages", { status: "published" }),
    ).toBe(false);
    expect(isAgentRequestAllowed("POST", "/items/pages", {})).toBe(false);
    expect(
      isAgentRequestAllowed("POST", "/versions", {
        collection: "directus_users",
      }),
    ).toBe(false);
  });

  it("le client réel n'envoie rien quand la requête est refusée", async () => {
    let sent = 0;
    const client = createAgentDirectus({
      baseUrl: "http://x",
      token: "t",
      fetchImpl: (async () => {
        sent++;
        return new Response("{}");
      }) as typeof fetch,
    });
    await expect(
      client.post(`/versions/${V}/promote`, {}),
    ).rejects.toBeInstanceOf(ForbiddenDirectusRequest);
    await expect(
      client.post("/items/pages", { status: "published" }),
    ).rejects.toBeInstanceOf(ForbiddenDirectusRequest);
    expect(() =>
      assertAgentRequestAllowed("DELETE", `/items/pages/${V}`),
    ).toThrow(ForbiddenDirectusRequest);
    expect(sent).toBe(0);
  });

  it("n'expose aucune méthode de suppression ni de modification", () => {
    const client = createAgentDirectus({ baseUrl: "http://x", token: "t" });
    expect(Object.keys(client).sort()).toEqual(["get", "post"]);
  });
});
