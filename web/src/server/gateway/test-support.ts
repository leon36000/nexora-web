import { randomBytes } from "node:crypto";
import { type Database, organizations } from "@nexora/db";
import { createLogger, type Logger } from "@nexora/log";
import { createPrivacyJournal } from "../privacy/events";
import {
  createPrivacyRouter,
  type ManagedPrivacyRouter,
} from "../privacy/router";
import { loadKeyring } from "../vault/crypto";
import { putSecret } from "../vault/store";
import {
  addFxRate,
  addPrice,
  addRoute,
  approveFxRate,
  approveVersion,
  createDraftVersion,
  createModel,
  createProvider,
  type PriceWindowInput,
  publishVersion,
  updateModel,
} from "./catalog";

/** Outils de test : organisation, catalogue publié (fournisseur, modèles, prix, taux). */
export async function newOrganization(db: Database): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

export interface TestModelSpec {
  publicId: string;
  kind?: "chat" | "embedding" | "rerank";
  visibility?: "public" | "unlisted" | "private";
  /** `preview` : visible au catalogue, pas encore appelable. */
  availability?: "live" | "preview";
  sellInput?: bigint;
  sellOutput?: bigint;
  sellCache?: bigint | null;
  /** Tarif de vente de l'écriture du cache (le coût amont d'essai est de 0,05 USD). */
  sellCacheWrite?: bigint;
  windows?: PriceWindowInput[];
  /** Routes de secours (même fournisseur), avec leur prix amont en micro-USD par million. */
  routes?: { input: bigint; output: bigint }[];
  maxOutputTokens?: number;
  contextMax?: number;
}

export async function publishTestCatalog(db: Database, specs: TestModelSpec[]) {
  const keyring = loadKeyring({
    NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
  });
  const code = `tp-${randomBytes(3).toString("hex")}`;
  await putSecret(db, keyring, {
    ref: `llm.${code}`,
    value: "sk-upstream-secret-value-123456",
    kind: "llm_provider",
  });
  const provider = await createProvider(db, {
    code,
    name: "Fournisseur d'essai",
    type: "litellm_upstream",
    baseUrl: "http://127.0.0.1:4400",
    secretRef: `llm.${code}`,
    region: "quebec",
    dataPolicyFr: "Aucune conservation des requêtes.",
    dataPolicyEn: "No request retention.",
  });
  const fx = await addFxRate(db, {
    usdToCadMicro: 1_400_000n,
    effectiveAt: new Date(Date.now() - 10_000),
  });
  await approveFxRate(db, fx.id, "test");
  for (const spec of specs) {
    const model = await createModel(db, {
      publicId: spec.publicId,
      name: spec.publicId,
      kind: spec.kind ?? "chat",
      providerId: provider.id,
      upstreamId: "up-model",
      contextMax: spec.contextMax ?? 32_000,
      maxOutputTokens: spec.maxOutputTokens ?? 1000,
      visibility: spec.visibility ?? "public",
      availability: spec.availability ?? "live",
      capabilities: { streaming: true },
    });
    await addPrice(db, model.id, {
      upstreamInputUsdMicro: 100_000n,
      upstreamOutputUsdMicro: 200_000n,
      upstreamCacheUsdMicro: spec.sellCache === undefined ? null : 50_000n,
      sellInputCadMicro: spec.sellInput ?? 1_000_000n,
      sellOutputCadMicro: spec.sellOutput ?? 3_000_000n,
      sellCacheCadMicro: spec.sellCache ?? null,
      ...(spec.sellCacheWrite === undefined
        ? {}
        : {
            upstreamCacheWriteUsdMicro: 50_000n,
            sellCacheWriteCadMicro: spec.sellCacheWrite,
          }),
      windows: spec.windows,
      effectiveAt: new Date(Date.now() - 5_000),
      note: "PRIX FICTIFS DE DÉVELOPPEMENT",
    });
    for (const r of spec.routes ?? [])
      await addRoute(db, model.id, {
        providerId: provider.id,
        upstreamId: "route-up",
        upstreamInputUsdMicro: r.input,
        upstreamOutputUsdMicro: r.output,
      });
    await updateModel(db, model.id, { status: "approved" });
    await updateModel(db, model.id, { status: "published" });
  }
  const { version } = await createDraftVersion(db);
  await approveVersion(db, version.id);
  return publishVersion(db, version.id);
}

/**
 * Privacy Router réel branché sur la base d'essai (politique par défaut « standard » pour toute organisation qui
 * n'en a pas enregistré), sans cache : une politique enregistrée par un essai s'applique tout de suite.
 */
export function testPrivacyRouter(
  db: Database,
  log: Logger = createLogger({ name: "privacy-test", sink: () => undefined }),
): ManagedPrivacyRouter {
  return createPrivacyRouter({
    db: () => db,
    journal: createPrivacyJournal({ db: () => db, log }),
    log,
    now: () => new Date(),
    cacheTtlMs: 0,
  });
}
