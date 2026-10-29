import { describe, expect, test } from "bun:test";
import { analyzeRow, analyzeUsage } from "./reconciliation";

const row = (over: Record<string, unknown> = {}) => ({
  model: "nexora/glm-5-3",
  requests: 100,
  billedMicro: "2200000",
  offeredMicro: "0",
  upstreamComputedUsdMicro: "1000000",
  reportedRequests: 100,
  upstreamReportedUsdMicro: "1000000",
  driftUsdMicro: "0",
  ...over,
});
const FX = 1_400_000n;

describe("rapprochement des coûts", () => {
  test("coût facturé, coût amont rapporté, marge réalisée (au taux approuvé)", () => {
    const a = analyzeRow(row(), FX);
    expect(a.billed).toBe(2_200_000n);
    expect(a.upstreamCostUsd).toBe(1_000_000n);
    expect(a.upstreamCostCad).toBe(1_400_000n);
    // 2,20 $ facturés pour 1,40 $ de coût : 57,1 % de marge
    expect(a.realizedMarginBps).toBe(5714);
    expect(a.coverageBps).toBe(10_000);
    expect(a.status).toBe("ok");
  });
  test("l'amont rapporte plus cher que notre calcul : écart et alerte", () => {
    const a = analyzeRow(
      row({ upstreamReportedUsdMicro: "1200000", driftUsdMicro: "200000" }),
      FX,
    );
    // calculé pour les requêtes rapportées = rapporté - écart = 1 000 000
    expect(a.driftBps).toBe(2000);
    expect(a.status).toBe("derive");
    expect(a.upstreamCostUsd).toBe(1_200_000n);
    expect(a.message).toContain("20 %");
  });
  test("écart faible (moins de 5 %) : tout va bien", () => {
    expect(
      analyzeRow(
        row({ upstreamReportedUsdMicro: "1030000", driftUsdMicro: "30000" }),
        FX,
      ).status,
    ).toBe("ok");
    expect(
      analyzeRow(
        row({ upstreamReportedUsdMicro: "970000", driftUsdMicro: "-30000" }),
        FX,
      ).status,
    ).toBe("ok");
    expect(
      analyzeRow(
        row({ upstreamReportedUsdMicro: "900000", driftUsdMicro: "-100000" }),
        FX,
      ).status,
    ).toBe("derive");
  });
  test("fournisseur direct : aucun coût rapporté, on s'en tient au calcul", () => {
    const a = analyzeRow(
      row({
        reportedRequests: 0,
        upstreamReportedUsdMicro: "0",
        driftUsdMicro: "0",
      }),
      FX,
    );
    expect(a.status).toBe("non_rapporte");
    expect(a.upstreamCostUsd).toBe(1_000_000n);
    expect(a.coverageBps).toBe(0);
  });
  test("couverture partielle : le coût corrigé mélange rapporté et calculé", () => {
    // 50 requêtes sur 100 ont un coût rapporté ; calculé total 1,00 $ ; rapporté 0,60 pour des requêtes calculées à 0,50 : écart +0,10
    const a = analyzeRow(
      row({
        reportedRequests: 50,
        upstreamComputedUsdMicro: "1000000",
        upstreamReportedUsdMicro: "600000",
        driftUsdMicro: "100000",
      }),
      FX,
    );
    expect(a.upstreamCostUsd).toBe(1_100_000n);
    expect(a.coverageBps).toBe(5000);
    expect(a.driftBps).toBe(2000);
  });
  test("usage offert (organisations maison) : valeur offerte séparée, pas de marge", () => {
    const a = analyzeRow(row({ billedMicro: "0", offeredMicro: "500000" }), FX);
    expect(a.offered).toBe(500_000n);
    expect(a.realizedMarginBps).toBeNull();
  });
  test("sans taux approuvé : pas de marge calculée", () => {
    expect(analyzeRow(row(), null).realizedMarginBps).toBeNull();
  });
  test("totaux et tri : les modèles à vérifier d'abord", () => {
    const u = analyzeUsage(
      [
        row({ model: "a" }),
        row({
          model: "b",
          upstreamReportedUsdMicro: "1500000",
          driftUsdMicro: "500000",
        }),
      ],
      FX,
    );
    expect(u.rows.map((r) => r.model)).toEqual(["b", "a"]);
    expect(u.total.requests).toBe(200);
    expect(u.total.billed).toBe(4_400_000n);
    expect(u.toCheck).toBe(1);
  });
});
