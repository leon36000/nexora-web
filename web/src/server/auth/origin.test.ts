import { describe, expect, it } from "vitest";
import { isSameOriginRequest } from "./origin";

const SITE = "https://nexora.test";
const req = (headers: Record<string, string>) =>
  new Request(`${SITE}/api/billing/portal`, { method: "POST", headers });

describe("protection CSRF des routes qui modifient l'état", () => {
  it("accepte l'origine du site", () => {
    expect(isSameOriginRequest(req({ origin: SITE }), SITE)).toBe(true);
  });
  it("refuse une autre origine, un sous-domaine voisin ou une origine nulle", () => {
    for (const origin of [
      "https://evil.example",
      "https://nexora.test.evil.example",
      "http://nexora.test",
      "https://nexora.test:8443",
      "null",
    ])
      expect(isSameOriginRequest(req({ origin }), SITE)).toBe(false);
  });
  it("sans Origin, se rabat sur Referer de même origine", () => {
    expect(isSameOriginRequest(req({ referer: `${SITE}/compte` }), SITE)).toBe(
      true,
    );
    expect(
      isSameOriginRequest(req({ referer: "https://evil.example/x" }), SITE),
    ).toBe(false);
  });
  it("sans Origin ni Referer, accepte seulement Sec-Fetch-Site: same-origin", () => {
    expect(
      isSameOriginRequest(req({ "sec-fetch-site": "same-origin" }), SITE),
    ).toBe(true);
    expect(
      isSameOriginRequest(req({ "sec-fetch-site": "cross-site" }), SITE),
    ).toBe(false);
    expect(isSameOriginRequest(req({}), SITE)).toBe(false);
  });
  it("une origine différente l'emporte sur un Sec-Fetch-Site trompeur", () => {
    expect(
      isSameOriginRequest(
        req({
          origin: "https://evil.example",
          "sec-fetch-site": "same-origin",
        }),
        SITE,
      ),
    ).toBe(false);
  });
});
