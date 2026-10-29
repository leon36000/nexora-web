import { describe, expect, it } from "vitest";
import {
  type CatalogSnapshot,
  diffSnapshots,
  guardSnapshot,
  type SnapshotModel,
  type SnapshotProvider,
} from "./snapshot";

const provider = (over: Partial<SnapshotProvider> = {}): SnapshotProvider => ({
  id: "p1",
  code: "deepinfra",
  name: "DeepInfra",
  type: "openai_compatible",
  baseUrl: "https://api.deepinfra.com/v1/openai",
  litellmBaseUrl: null,
  secretRef: "llm.deepinfra",
  region: "autre",
  dataPolicyFr: "",
  dataPolicyEn: "",
  priority: 10,
  enabled: true,
  ...over,
});

const model = (over: Partial<SnapshotModel> = {}): SnapshotModel => ({
  id: "m1",
  publicId: "nexora/essai",
  name: "Essai",
  descriptionFr: "",
  descriptionEn: "",
  kind: "chat",
  providerId: "p1",
  upstreamId: "org/Essai",
  contextMax: 32_000,
  maxOutputTokens: null,
  capabilities: {},
  residency: "autre",
  visibility: "public",
  sunsetAt: null,
  price: {
    id: "pr1",
    upstreamInputUsdMicro: "500000",
    upstreamOutputUsdMicro: "1000000",
    upstreamCacheUsdMicro: null,
    sellInputCadMicro: "770000",
    sellOutputCadMicro: "1540000",
    sellCacheCadMicro: null,
    marginBps: 1000,
    marginFloorBps: 1000,
    effectiveAt: "2026-10-29T00:00:00.000Z",
    note: "",
  },
  ...over,
});

const snapshot = (
  models: SnapshotModel[],
  providers: SnapshotProvider[] = [provider()],
  fx: CatalogSnapshot["fx"] = {
    id: "fx1",
    usdToCadMicro: "1400000",
    effectiveAt: "2026-10-29T00:00:00.000Z",
  },
): CatalogSnapshot => ({ schema: 1, fx, providers, models });

const noKey = { secretExists: () => false };

describe("garde de publication : modèle en aperçu", () => {
  it("un modèle appelable exige la clé du fournisseur", () => {
    expect(guardSnapshot(snapshot([model()]), noKey)).toEqual([
      { code: "secret_missing", model: "nexora/essai", provider: "deepinfra" },
    ]);
  });

  it("un modèle en aperçu n'exige pas la clé du fournisseur", () => {
    expect(
      guardSnapshot(snapshot([model({ availability: "preview" })]), noKey),
    ).toEqual([]);
  });

  it("un modèle en aperçu n'exige pas non plus la clé des routes de secours", () => {
    const routes = [
      {
        id: "r1",
        providerId: "p2",
        upstreamId: "x",
        position: 1,
        upstream: null,
      },
    ];
    const snap = snapshot(
      [model({ availability: "preview", routes })],
      [
        provider(),
        provider({ id: "p2", code: "autre", secretRef: "llm.autre" }),
      ],
    );
    expect(guardSnapshot(snap, noKey)).toEqual([]);
    // la même route, pour un modèle appelable, est refusée
    const live = snapshot(
      [model({ routes })],
      [
        provider(),
        provider({ id: "p2", code: "autre", secretRef: "llm.autre" }),
      ],
    );
    expect(
      guardSnapshot(live, { secretExists: (r) => r === "llm.deepinfra" }),
    ).toEqual([
      { code: "route_secret_missing", model: "nexora/essai", route: 1 },
    ]);
  });

  it("un fournisseur désactivé bloque aussi un modèle en aperçu", () => {
    const snap = snapshot(
      [model({ availability: "preview" })],
      [provider({ enabled: false })],
    );
    expect(guardSnapshot(snap, noKey)).toEqual([
      { code: "provider_disabled", model: "nexora/essai" },
    ]);
  });

  it("un modèle en aperçu exige le taux de change approuvé et un prix valide", () => {
    expect(
      guardSnapshot(
        snapshot([model({ availability: "preview" })], [provider()], null),
        noKey,
      ),
    ).toEqual([{ code: "fx_missing" }]);
    expect(
      guardSnapshot(
        snapshot([model({ availability: "preview", price: null })]),
        noKey,
      ),
    ).toEqual([{ code: "price_missing", model: "nexora/essai" }]);
    const bad = model({ availability: "preview" });
    if (bad.price) bad.price.sellInputCadMicro = "0";
    expect(guardSnapshot(snapshot([bad]), noKey).map((i) => i.code)).toContain(
      "price_zero",
    );
  });

  it("passer de l'aperçu au service apparaît dans les différences", () => {
    const before = snapshot([model({ availability: "preview" })]);
    const after = snapshot([model()]);
    expect(diffSnapshots(before, after)).toEqual([
      {
        kind: "model_changed",
        model: "nexora/essai",
        changes: [
          { field: "availability", before: "preview", after: undefined },
        ],
      },
    ]);
  });
});
