import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ApiKeySummary } from "@/server/gateway/keys";
import { ApiKeysSection } from "./api-keys-section";

// Le formulaire de création est un composant client qui lit le routeur.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

// Membre : pas de formulaire de création (composant client, hors du rendu statique).
const member = { role: "member" } as const;
const owner = { role: "owner" } as const;

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
  ragAccess: null,
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

describe("clés d'API : expiration, limites et modèles permis", () => {
  const limited = key({
    name: "Limitée",
    rpmLimit: 30,
    tpmLimit: 50_000,
    allowedModels: ["nexora/glm-5.3", "nexora/kimi-k3.1-pro"],
    expiresAt: new Date("2026-12-31T12:00:00Z"),
  });

  it("montre l'expiration, les limites propres et le nombre de modèles (fr-CA)", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection lang="fr" {...member} keys={[limited, key({})]} />,
    );
    expect(html).toContain("Expiration");
    expect(html).toContain("2 modèles permis");
    expect(html).toContain("30 requêtes/min");
    // Une clé sans réglage : limites par défaut, tous les modèles, aucune expiration.
    expect(html).toContain("Limites par défaut");
    expect(html).toContain("Tous les modèles publics");
  });

  it("en-CA", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection lang="en" {...member} keys={[limited]} />,
    );
    expect(html).toContain("2 models allowed");
    expect(html).toContain("30 requests/min");
  });

  it("le propriétaire voit les champs RPM, TPM et la liste des modèles à cocher", () => {
    const html = renderToStaticMarkup(
      <ApiKeysSection
        lang="fr"
        {...owner}
        keys={[]}
        models={[{ id: "nexora/glm-5.3", name: "GLM 5.3" }]}
      />,
    );
    expect(html).toContain('name="rpmLimit"');
    expect(html).toContain('name="tpmLimit"');
    expect(html).toContain('name="allowedModel"');
    expect(html).toContain("nexora/glm-5.3");
  });
});
