import { describe, expect, test } from "bun:test";
import { isAllowed } from "../admin-relay/relay";
import { CREATIVE_RELAY, relayToCreative } from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};

describe("liste fermée des appels (Nexora Creative)", () => {
  test("accepte la lecture et le remplacement de la configuration", () => {
    expect(isAllowed(CREATIVE_RELAY, "GET", "config")).toBe(true);
    expect(isAllowed(CREATIVE_RELAY, "PUT", "config")).toBe(true);
  });
  test("refuse tout le reste, dont le coffre, les autres modules et la sortie de chemin", () => {
    for (const [m, p] of [
      ["DELETE", "config"],
      ["POST", "config"],
      ["GET", ""],
      ["GET", "config/../vault"],
      ["GET", "../vault"],
      ["GET", "options"],
    ] as const)
      expect(isAllowed(CREATIVE_RELAY, m, p)).toBe(false);
  });
  test("relaie avec le jeton d'administration et transmet un refus 422 tel quel", async () => {
    let seen: { url: string; method: string; auth: string; body: string } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, method: String(init.method), auth: String((init.headers as Record<string, string>).authorization), body: String(init.body) };
      return new Response(JSON.stringify({ error: "invalid_config", issues: [{ path: "llm.default", code: "unknown_model" }] }), { status: 422 });
    }) as unknown as typeof fetch;
    const r = await relayToCreative({ method: "PUT", path: "config", body: { version: 1 } }, { env, fetchFn });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toContain("unknown_model");
    expect(seen).toEqual({ url: "http://app.interne:3500/api/admin/creative/config", method: "PUT", auth: "Bearer jeton-admin-app", body: '{"version":1}' });
  });
  test("sans configuration du service, répond 503 sans appeler l'app", async () => {
    const r = await relayToCreative({ method: "GET", path: "config" }, { env: {} });
    expect(r.status).toBe(503);
  });
});
