/**
 * Réconciliation quotidienne (audit F-06) : logique pure de comparaison du grand livre aux sources amont. Reprend les
 * cas du code de référence de l'audit, adaptés aux colonnes réelles et à la provenance des jetons.
 */
import { describe, expect, it } from "vitest";
import {
  type LedgerRow,
  reconcile,
  type UpstreamRecord,
} from "./reconciliation.ts";
import { usdToNano } from "./upstream-money.ts";

const nano = (v: string | number) => usdToNano(v) as bigint;

const row = (o: Partial<LedgerRow> = {}): LedgerRow => ({
  eventId: "e1",
  requestId: "r1",
  organizationId: "org",
  model: "nexora/m",
  day: "2026-11-10",
  status: "ok",
  billed: true,
  upstreamGenerationId: "gen-1",
  litellmCallId: null,
  promptTokens: 1000,
  completionTokens: 200,
  cachedTokens: 0,
  usageSource: "provider",
  billedMicroCad: 1540n,
  reportedUsdNano: nano("0.001"),
  litellmResponseCostNano: null,
  computedUsdNano: nano("0.001"),
  fxUsdToCadMicro: 1_400_000n,
  provider: "openrouter",
  ...o,
});
const up = (o: Partial<UpstreamRecord> = {}): UpstreamRecord => ({
  id: "gen-1",
  source: "openrouter",
  day: "2026-11-10",
  model: "nexora/m",
  totalCostUsdNano: nano("0.001"),
  nativePrompt: 1000,
  nativeCompletion: 200,
  nativeCached: 0,
  nativeReasoning: 0,
  cancelled: false,
  provider: "Wafer",
  ...o,
});
const BOTH = { openrouter: true, litellm: true };
const kinds = (r: ReturnType<typeof reconcile>) =>
  r.findings.map((f) => f.kind);

describe("reconcile", () => {
  it("cas sain : aucun écart, l'événement est « ok » avec les jetons natifs", () => {
    const r = reconcile([row()], [up()], [], BOTH);
    expect(r.findings).toEqual([]);
    expect(r.results[0]).toMatchObject({
      eventId: "e1",
      status: "ok",
      source: "openrouter",
      nativePrompt: 1000,
      nativeCompletion: 200,
    });
  });

  it("génération amont sans ligne chez nous : unbilled_upstream (perte)", () => {
    const r = reconcile(
      [],
      [],
      [up({ id: "call-9", source: "litellm", totalCostUsdNano: nano("0.25") })],
      BOTH,
    );
    expect(kinds(r)).toEqual(["unbilled_upstream"]);
    expect(r.findings[0]).toMatchObject({
      dedupeKey: "unbilled_upstream:call-9",
      actualUsdNano: nano("0.25"),
    });
  });

  it("rien chez l'amont pour une ligne facturée : billed_no_upstream et statut « missing_upstream »", () => {
    const r = reconcile([row()], [], [], BOTH);
    expect(kinds(r)).toEqual(["billed_no_upstream"]);
    expect(r.results[0]?.status).toBe("missing_upstream");
  });

  it("source amont INDISPONIBLE : rien n'est conclu (ni écart, ni résultat) ; l'événement sera repris au prochain passage", () => {
    const r = reconcile([row()], [], [], { openrouter: false, litellm: false });
    expect(r.findings).toEqual([]);
    expect(r.results).toEqual([]);
  });

  it("jointure par l'identifiant d'appel LiteLLM quand il n'y a pas de génération (DeepInfra)", () => {
    const r = reconcile(
      [row({ upstreamGenerationId: null, litellmCallId: "call-1" })],
      [up({ id: "call-1", source: "litellm" })],
      [],
      BOTH,
    );
    expect(r.findings).toEqual([]);
    expect(r.results[0]?.source).toBe("litellm");
  });

  it("jetons estimés (abandon) : l'écart avec les jetons natifs est signalé avec la provenance et le complément", () => {
    const r = reconcile(
      [
        row({
          promptTokens: 27,
          completionTokens: 0,
          usageSource: "estimated_aborted",
        }),
      ],
      [up({ nativePrompt: 27, nativeCompletion: 812 })],
      [],
      BOTH,
    );
    const f = r.findings.find((x) => x.kind === "token_mismatch");
    expect(f?.detail).toMatchObject({
      usageSource: "estimated_aborted",
      complementCompletionTokens: 812,
    });
    expect(r.results[0]?.status).toBe("mismatch");
  });

  it("jetons « provider » : tolérance de 5 % avec OpenRouter (jetons natifs ≠ normalisés), exacts avec LiteLLM", () => {
    const small = reconcile([row({ promptTokens: 1030 })], [up()], [], BOTH);
    expect(kinds(small)).not.toContain("token_mismatch");
    const big = reconcile([row({ promptTokens: 1200 })], [up()], [], BOTH);
    expect(kinds(big)).toContain("token_mismatch");
    const exact = reconcile(
      [
        row({
          upstreamGenerationId: null,
          litellmCallId: "c",
          promptTokens: 1001,
        }),
      ],
      [up({ id: "c", source: "litellm" })],
      [],
      BOTH,
    );
    expect(kinds(exact)).toContain("token_mismatch");
  });

  it("marge négative : on a facturé moins que l'amont converti au change figé de l'événement", () => {
    const r = reconcile([row({ billedMicroCad: 1000n })], [up()], [], BOTH);
    expect(kinds(r)).toContain("negative_margin");
    // Organisation « maison » (rien facturé) : jamais de marge négative.
    const house = reconcile(
      [row({ billed: false, billedMicroCad: 0n })],
      [up()],
      [],
      BOTH,
    );
    expect(kinds(house)).not.toContain("negative_margin");
  });

  it("coût rapporté dans la réponse ≠ coût de l'enregistrement amont : cost_mismatch", () => {
    const r = reconcile(
      [row({ reportedUsdNano: nano("0.002") })],
      [up()],
      [],
      BOTH,
    );
    expect(kinds(r)).toContain("cost_mismatch");
  });

  it("l'arrondi en micro-USD faussait une petite requête de 40 % : en nano-USD, aucun faux positif", () => {
    const r = reconcile(
      [
        row({
          reportedUsdNano: nano(0.0000014),
          computedUsdNano: nano(0.0000014),
          billedMicroCad: 10n,
        }),
      ],
      [up({ totalCostUsdNano: nano("0.0000014") })],
      [],
      BOTH,
    );
    expect(kinds(r)).not.toContain("cost_mismatch");
  });

  it("dérive agrégée de 1,6 USD signalée même si chaque requête est sous 0,5 %", () => {
    const L: LedgerRow[] = [];
    const U: UpstreamRecord[] = [];
    for (let i = 0; i < 4000; i++) {
      L.push(
        row({
          eventId: `e${i}`,
          requestId: `r${i}`,
          upstreamGenerationId: `gen-${i}`,
          reportedUsdNano: nano("1.0000"),
          computedUsdNano: nano("1.0000"),
          billedMicroCad: 2_000_000n,
        }),
      );
      U.push(up({ id: `gen-${i}`, totalCostUsdNano: nano("1.0004") }));
    }
    const r = reconcile(L, U, [], BOTH);
    expect(r.findings.filter((x) => x.kind === "cost_mismatch")).toHaveLength(
      0,
    );
    const drift = r.findings.filter((x) => x.kind === "aggregate_drift");
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      dedupeKey: "aggregate_drift:openrouter:2026-11-10:nexora/m",
      deltaUsdNano: -nano("1.6"),
    });
  });

  it("un écart agrégé sous 0,5 % et sous 1 USD n'alerte pas", () => {
    const r = reconcile(
      [row({ computedUsdNano: nano("100"), reportedUsdNano: nano("100") })],
      [up({ totalCostUsdNano: nano("100.40") })],
      [],
      BOTH,
    );
    expect(kinds(r)).not.toContain("aggregate_drift");
  });

  it("idempotent : rejouer avec les mêmes données redonne exactement les mêmes clés d'écart", () => {
    const a = reconcile([row({ billedMicroCad: 1000n })], [up()], [], BOTH);
    const b = reconcile([row({ billedMicroCad: 1000n })], [up()], [], BOTH);
    expect(a.findings.map((f) => f.dedupeKey)).toEqual(
      b.findings.map((f) => f.dedupeKey),
    );
  });
});
