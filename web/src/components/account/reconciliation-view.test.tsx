import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import { type FindingRow, ReconciliationView } from "./reconciliation-view";

const row = (over: Partial<FindingRow> = {}): FindingRow => ({
  id: "f1",
  kind: "negative_margin",
  status: "open",
  foundAt: new Date("2026-11-11T08:05:00Z"),
  day: "2026-11-10",
  model: "nexora/m",
  requestId: "req_1",
  expectedUsdNano: "5000000",
  actualUsdNano: null,
  deltaUsdNano: "-1600000000",
  ...over,
});

const render = (lang: "fr" | "en", rows: FindingRow[], withRun = true) =>
  renderToStaticMarkup(
    <ReconciliationView
      lang={lang}
      t={getAccountDictionary(lang)}
      rows={rows}
      filters={{ kind: undefined, status: "open" }}
      action="/compte/ecarts-facturation"
      lastRun={
        withRun
          ? {
              day: "2026-11-10",
              status: "alert",
              ledgerRows: 42,
              unavailable: ["openrouter"],
            }
          : null
      }
    />,
  );

describe("page des écarts de facturation", () => {
  it("fr-CA : un seul h1, tableau accessible (légende, en-têtes de colonnes et de lignes), montants exacts, textes du dictionnaire", () => {
    const html = render("fr", [row()]);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Écarts de facturation.");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("Facturé sous le coût du fournisseur");
    expect(html).toContain("0.005"); // 5 000 000 nano-USD
    expect(html).toContain("-1.60");
    expect(html).toContain("Écarts à réviser");
    expect(html).toContain("OpenRouter");
    // Région défilable atteignable au clavier, filtres reliés à leur libellé.
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('for="findings-kind"');
    expect(html).toContain('for="findings-status"');
  });

  it("en-CA : mêmes éléments, textes anglais, aucune chaîne française", () => {
    const html = render("en", [row()]);
    expect(html).toContain("Billing discrepancies.");
    expect(html).toContain("Billed below the provider’s cost");
    expect(html).toContain("n/a"); // montant absent
    expect(html).not.toContain("Écarts");
    expect(html).not.toContain("Constaté");
  });

  it("aucun écart ni exécution : messages explicites, pas de tableau vide", () => {
    const fr = render("fr", [], false);
    expect(fr).toContain("Aucune exécution pour l’instant.");
    expect(fr).toContain("Aucun écart pour ces critères.");
    expect(fr).not.toContain("<table");
  });

  it("n'affiche jamais de contenu de requête : seulement identifiant, modèle et montants", () => {
    const html = render("fr", [row()]);
    expect(html).not.toMatch(/prompt|messages|content/i);
  });
});
