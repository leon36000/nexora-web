import { describe, expect, it } from "vitest";
import {
  embedAppliesTo,
  embedCsp,
  embedScriptAttributes,
  isChatIdentifier,
  isHexColor,
  normalizeEmbedOrigin,
  normalizeEmbedPage,
  stripLangPrefix,
} from "./workstudio-embed";

describe("normalizeEmbedOrigin", () => {
  it("normalise une origine https", () => {
    expect(normalizeEmbedOrigin(" HTTPS://Ia.Exemple.ca/ ")).toBe(
      "https://ia.exemple.ca",
    );
    expect(normalizeEmbedOrigin("https://ia.exemple.ca:8443")).toBe(
      "https://ia.exemple.ca:8443",
    );
  });
  it("n'accepte http que pour un hôte local", () => {
    expect(normalizeEmbedOrigin("http://localhost:3200")).toBe(
      "http://localhost:3200",
    );
    expect(normalizeEmbedOrigin("http://127.0.0.1:3200")).toBe(
      "http://127.0.0.1:3200",
    );
    expect(normalizeEmbedOrigin("http://ia.exemple.ca")).toBeNull();
  });
  it.each([
    "https://*.exemple.ca",
    "https://ia.exemple.ca/chemin",
    "https://ia.exemple.ca?x=1",
    "https://ia.exemple.ca#a",
    "https://u:p@ia.exemple.ca",
    "javascript:alert(1)",
    "ftp://ia.exemple.ca",
    "",
    "pas une url",
  ])("refuse %s", (value) => {
    expect(normalizeEmbedOrigin(value)).toBeNull();
  });
});

describe("pages, chat et couleur", () => {
  it("normalise les chemins", () => {
    expect(normalizeEmbedPage("/Agents/")).toBe("/agents");
    expect(normalizeEmbedPage("/solutions/courriels")).toBe(
      "/solutions/courriels",
    );
    expect(normalizeEmbedPage("")).toBe("/");
    expect(normalizeEmbedPage("agents")).toBeNull();
    expect(normalizeEmbedPage("/a?b=1")).toBeNull();
    expect(normalizeEmbedPage("/a//b")).toBeNull();
    expect(normalizeEmbedPage("/*")).toBeNull();
  });
  it("valide l'identifiant du chat et la couleur", () => {
    expect(isChatIdentifier("assistant-9bc75ebb")).toBe(true);
    expect(isChatIdentifier("Assistant")).toBe(false);
    expect(isChatIdentifier("a b")).toBe(false);
    expect(isHexColor("#4F46E5")).toBe(true);
    expect(isHexColor("#fa0")).toBe(true);
    expect(isHexColor("4F46E5")).toBe(false);
    expect(isHexColor("red")).toBe(false);
  });
  it("reconnaît une page avec ou sans préfixe de langue", () => {
    expect(stripLangPrefix("/en/agents/")).toBe("/agents");
    expect(stripLangPrefix("/agents")).toBe("/agents");
    expect(stripLangPrefix("/en")).toBe("/");
    expect(stripLangPrefix("/energie")).toBe("/energie");
    expect(embedAppliesTo(["/agents"], "/en/agents")).toBe(true);
    expect(embedAppliesTo(["/agents"], "/agents/mon-agent")).toBe(false);
    expect(embedAppliesTo([], "/agents")).toBe(false);
  });
});

describe("pages interdites à la bulle", () => {
  it("refuse l'espace client et les adresses techniques : un script tiers n'y entre jamais", () => {
    for (const page of [
      "/compte",
      "/compte/securite",
      "/compte/vps",
      "/api/auth",
      "/api",
      "/v1",
      "/admin",
      "/_next/static",
      "/og",
      "/COMPTE",
    ])
      expect(normalizeEmbedPage(page), page).toBeNull();
    expect(normalizeEmbedPage("/agents")).toBe("/agents");
    expect(normalizeEmbedPage("/comptes-rendus")).toBe("/comptes-rendus");
  });

  it("n'applique plus la bulle à une page interdite déjà enregistrée (réglage ancien)", () => {
    expect(embedAppliesTo(["/compte", "/agents"], "/compte")).toBe(false);
    expect(embedAppliesTo(["/compte", "/agents"], "/en/compte/securite")).toBe(
      false,
    );
    expect(embedAppliesTo(["/compte", "/agents"], "/agents")).toBe(true);
  });
});

describe("embedCsp", () => {
  it("n'ouvre que l'origine configurée, sans joker", () => {
    const csp = embedCsp("https://ia.exemple.ca");
    expect(csp).toContain("frame-src https://ia.exemple.ca");
    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' https://ia.exemple.ca",
    );
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("*");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("default-src");
  });
  it("n'ajoute eval et les websockets qu'en développement", () => {
    const csp = embedCsp("http://localhost:3200", { dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});

describe("embedScriptAttributes", () => {
  const base = {
    origin: "https://ia.exemple.ca",
    chatIdentifier: "support",
    position: "left" as const,
    color: null,
  };
  it("pose l'identifiant du chat, le côté et le libellé", () => {
    expect(embedScriptAttributes(base, "Discuter")).toEqual({
      "data-nexora-chat": "support",
      "data-position": "left",
      "data-label": "Discuter",
    });
  });
  it("n'ajoute la couleur que si elle est valide", () => {
    expect(
      embedScriptAttributes({ ...base, color: "#0a7d33" }, "x")["data-color"],
    ).toBe("#0a7d33");
    expect(
      embedScriptAttributes({ ...base, color: "rouge" }, "x")["data-color"],
    ).toBeUndefined();
  });
});
