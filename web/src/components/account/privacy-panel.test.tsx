import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import type { PrivacyView } from "@/server/privacy/view";
import { PrivacyPanel } from "./privacy-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

const view = (over: Partial<PrivacyView> = {}): PrivacyView => ({
  level: "standard",
  version: 0,
  isDefault: true,
  invalid: false,
  config: {
    maskCategories: ["email", "phone", "credit_card", "sin", "iban", "secret"],
    denyCategories: [],
    allowedHosts: [],
    blockedHosts: ["pirate.example"],
    allowedModels: [],
    blockAttachments: false,
  },
  recent: { days: 30, counts: { allow: 12, mask: 5, deny: 1 } },
  versions: [],
  ...over,
});

const render = (
  lang: "fr" | "en",
  v: PrivacyView,
  canEdit: boolean,
  versionDates: string[] = [],
) =>
  renderToStaticMarkup(
    <PrivacyPanel
      t={getAccountDictionary(lang)}
      view={v}
      canEdit={canEdit}
      months={["2026-10", "2026-09"]}
      versionDates={versionDates}
    />,
  );

describe("page Confidentialité", () => {
  it("propriétaire : niveaux, genres reconnus, listes, compteurs et rapports", () => {
    const html = render("fr", view(), true);
    expect(html).toContain("Confidentialité.");
    for (const name of ["Standard", "Renforcé", "Souverain strict"])
      expect(html).toContain(name);
    expect(html).toContain("Toujours masqué");
    expect(html).toContain("Courriel");
    expect(html).toContain("pirate.example");
    expect(html).toContain("Politique par défaut de Nexora");
    expect(html).toContain("Enregistrer la politique");
    expect(html).toContain('href="/api/account/privacy/report?month=2026-10"');
    // Compteurs sans contenu.
    expect(html).toContain("Décisions des 30 derniers jours");
    expect(html).toContain(">12<");
    expect(html).toContain("Ce que cela ne fait pas");
  });

  it("membre : lecture seule, pas de bouton ni de rapport", () => {
    const html = render("fr", view(), false);
    expect(html).toContain("lecture seule");
    expect(html).not.toContain("Enregistrer la politique");
    expect(html).not.toContain("/api/account/privacy/report");
    expect(html).toContain("disabled");
  });

  it("anglais : libellés en en-CA", () => {
    const html = render("en", view({ level: "souverain" }), true);
    expect(html).toContain("Privacy.");
    expect(html).toContain("Strict sovereign");
    expect(html).toContain("Save the policy");
    expect(html).not.toContain("Enregistrer");
  });

  it("politique illisible : alerte explicite", () => {
    const html = render("fr", view({ invalid: true }), true);
    expect(html).toContain("toutes les requêtes sont refusées");
  });

  it("historique : version courante signalée", () => {
    const html = render(
      "fr",
      view({
        isDefault: false,
        version: 2,
        level: "renforce",
        versions: [
          {
            version: 2,
            level: "renforce",
            current: true,
            createdAt: "2026-10-29T12:00:00.000Z",
          },
          {
            version: 1,
            level: "standard",
            current: false,
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        ],
      }),
      true,
      ["29 octobre 2026", "1 octobre 2026"],
    );
    expect(html).toContain("2 (en vigueur)");
    expect(html).toContain("29 octobre 2026");
    expect(html).toContain("Version 2, enregistrée dans l’historique");
  });

  it("ne dit jamais « conforme » à une loi", () => {
    for (const lang of ["fr", "en"] as const) {
      const html = render(lang, view(), true);
      expect(html).not.toMatch(/conforme|compliant|Loi 25|Law 25/i);
    }
  });
});
