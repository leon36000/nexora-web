import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiKeySummary } from "@/server/gateway/keys";
import { ApiKeysSection } from "./api-keys-section";

// Membre : pas de formulaire de création (composant client, hors du rendu statique).
const member = { role: "member" } as const;

const key = (over: Partial<ApiKeySummary>): ApiKeySummary => ({
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "org",
  name: "Production",
  prefix: "nxk_abcdefg",
  allowedModels: null,
  spendCapMicro: null,
  spentMicro: 0n,
  rpmLimit: null,
  tpmLimit: null,
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  webpilotOperations: null,
  createdBy: null,
  createdAt: new Date("2026-10-01T12:00:00Z"),
  ...over,
});

describe("clés d'API : permission WebPilot", () => {
  it("« Non » par défaut, les opérations cochées sinon (fr-CA et en-CA)", () => {
    const keys = [
      key({}),
      key({
        id: "22222222-2222-4222-8222-222222222222",
        name: "Veille",
        webpilotOperations: ["search", "crawl"],
      }),
    ];
    const fr = renderToStaticMarkup(
      <ApiKeysSection lang="fr" {...member} keys={keys} />,
    );
    expect(fr).toContain("WebPilot");
    expect(fr).toContain(">Non<");
    expect(fr).toContain("Recherche, Exploration d’un site");
    const en = renderToStaticMarkup(
      <ApiKeysSection lang="en" {...member} keys={keys} />,
    );
    expect(en).toContain(">No<");
    expect(en).toContain("Search, Crawl a site");
  });
});
