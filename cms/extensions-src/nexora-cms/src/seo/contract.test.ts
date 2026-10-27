import { describe, expect, test } from "bun:test";
import { isAllowed } from "../admin-relay/relay";
import { relayToSeo, SEO_RELAY } from "./contract";

const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};
const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("liste fermée des appels (SEO)", () => {
  test("accepte les routes du SEO", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["GET", "audits"],
      ["GET", `audits/${ID}`],
      ["POST", "audits"],
      ["GET", "issues"],
      ["PATCH", `issues/${ID}`],
      ["GET", "indexing"],
      ["POST", "indexing/run"],
      ["PATCH", "adapters/bing"],
      ["POST", "adapters/postiz/check"],
    ] as const)
      expect(isAllowed(SEO_RELAY, m, p)).toBe(true);
  });
  test("refuse tout le reste", () => {
    for (const [m, p] of [
      ["GET", "../vault"],
      ["DELETE", `issues/${ID}`],
      ["PATCH", "adapters/inconnu"],
      ["POST", "adapters/bing/secret"],
      ["POST", "issues"],
      ["GET", "adapters"],
      ["PATCH", "issues/pas-un-uuid"],
    ] as const)
      expect(isAllowed(SEO_RELAY, m, p)).toBe(false);
  });
  test("transmet les filtres permis seulement", async () => {
    let url = "";
    const fetchFn = (async (u: string) => {
      url = u;
      return Response.json({ issues: [] });
    }) as unknown as typeof fetch;
    await relayToSeo(
      {
        method: "GET",
        path: "issues",
        query: { status: "open", severity: "error", x: "1" },
      },
      { env, fetchFn },
    );
    expect(url).toBe(
      "http://app.interne:3500/api/admin/seo/issues?status=open&severity=error",
    );
  });
});
