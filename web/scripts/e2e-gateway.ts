#!/usr/bin/env bun
// Preuve de bout en bout de la passerelle de modèles (S5, D1) :
//   catalogue publié et synchronisé -> organisation de test créditée au grand livre -> clé créée ->
//   appels réels (non diffusé puis diffusé) avec le SDK officiel `openai` -> débit exact du grand livre
//   et événements d'usage cohérents -> clé révoquée -> 401.
//
//   bun web/scripts/e2e-gateway.ts        (site sur http://localhost:3500, LiteLLM sur :4400)
//
// Prérequis : pile de développement (PostgreSQL, LiteLLM avec `dev/cloud-glm-5-3`), migrations appliquées,
// `scripts/init-dev-env.sh` exécuté, site lancé (build + start) sur le port 3500.
// Variables : BASE_URL (défaut http://localhost:3500), NEXORA_ENV_FILE (défaut deploy/.env du dépôt principal).
// DÉVELOPPEMENT SEULEMENT : prix FICTIFS, crédit de TEST du grand livre (aucun paiement). Aucun secret affiché.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  apiKeys,
  createDb,
  deriveBalance,
  eq,
  getAccount,
  organizations,
  usageEvents,
} from "@nexora/db";
import OpenAI from "openai";
import { grantTestCredit } from "../src/server/gateway/dev-credit";
import { createApiKey, revokeApiKey } from "../src/server/gateway/keys";
import { requestCost } from "../src/server/gateway/pricing";

// ─── Environnement ──────────────────────────────────────────────────────────────

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1] as string] = (m[2] as string).replace(/^["']|["']$/g, "");
  }
  return out;
}
const local = readEnvFile(
  fileURLToPath(new URL("../.env.local", import.meta.url)),
);
const stack = readEnvFile(
  process.env.NEXORA_ENV_FILE ?? "/home/pc6/Desktop/NexoraSite/deploy/.env",
);
const val = (k: string) => process.env[k] ?? local[k] ?? stack[k] ?? "";

const BASE = (process.env.BASE_URL ?? "http://localhost:3500").replace(
  /\/+$/,
  "",
);
const LITELLM = (val("LITELLM_BASE_URL") || "http://127.0.0.1:4400").replace(
  /\/+$/,
  "",
);
const ADMIN = val("NEXORA_APP_ADMIN_TOKEN");
const MASTER = val("LITELLM_MASTER_KEY");
const DATABASE_URL = val("DATABASE_URL");
for (const [k, v] of Object.entries({
  NEXORA_APP_ADMIN_TOKEN: ADMIN,
  LITELLM_MASTER_KEY: MASTER,
  DATABASE_URL,
})) {
  if (!v) {
    console.error(`Variable manquante : ${k} (voir scripts/init-dev-env.sh)`);
    process.exit(1);
  }
}

// ─── Aides ──────────────────────────────────────────────────────────────────────

let failures = 0;
const lines: string[] = [];
function check(ok: boolean, label: string, detail = ""): void {
  lines.push(
    `${ok ? "OK " : "ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  console.log(lines.at(-1));
  if (!ok) failures += 1;
}

async function admin(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/admin/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { status: res.status, json };
}

async function litellm(method: string, path: string, body?: unknown) {
  const res = await fetch(`${LITELLM}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${MASTER}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, any>,
  };
}

const UPSTREAM_MODEL = "dev/cloud-glm-5-3";
const PUBLIC_ID = "nexora/glm-5-3";
const PROVIDER_CODE = "dev-litellm";
const SECRET_REF = "litellm.dev-upstream";
const M = 1_000_000n;

// ─── 1. Clé amont de développement (clé virtuelle LiteLLM limitée au modèle de développement) ─────

await litellm("POST", "/key/delete", { key_aliases: ["nexora-e2e-upstream"] });
const vk = await litellm("POST", "/key/generate", {
  models: [UPSTREAM_MODEL],
  key_alias: "nexora-e2e-upstream",
});
check(
  vk.status === 200 && typeof vk.json.key === "string",
  "clé virtuelle amont créée dans LiteLLM (limitée à dev/cloud-glm-5-3)",
);
const vault = await admin("POST", "vault", {
  ref: SECRET_REF,
  value: vk.json.key,
  kind: "llm_provider",
});
check(
  vault.status === 200 && !JSON.stringify(vault.json).includes(vk.json.key),
  "clé amont déposée dans le Coffre (ni relue ni renvoyée)",
  `se termine par ${vault.json.last4}`,
);

// ─── 2. Catalogue : fournisseur, modèle, prix de DÉVELOPPEMENT, taux, publication, synchronisation ─────

const existing = await admin("GET", "catalog/providers");
let provider = (existing.json.providers as any[] | undefined)?.find(
  (p) => p.code === PROVIDER_CODE,
);
if (!provider) {
  const created = await admin("POST", "catalog/providers", {
    code: PROVIDER_CODE,
    name: "LiteLLM de développement (pc1)",
    type: "litellm_upstream",
    baseUrl: LITELLM,
    // Dans le conteneur LiteLLM, l'adresse de ce même serveur est le port interne 4000.
    litellmBaseUrl: "http://127.0.0.1:4000",
    secretRef: SECRET_REF,
    region: "autre",
    dataPolicyFr:
      "Fournisseur de développement : aucune garantie de conservation ni d’hébergement. Ne pas utiliser de données réelles.",
    dataPolicyEn:
      "Development provider: no guarantee about retention or hosting. Do not use real data.",
  });
  check(
    created.status === 201,
    "fournisseur litellm_upstream créé",
    created.json.error ?? "",
  );
  provider = created.json;
}
const test = await admin("POST", `catalog/providers/${provider.id}/test`);
check(
  test.status === 200 && test.json.ok === true,
  "« Tester le fournisseur » : appel minimal réussi",
  String(test.json.detail ?? ""),
);

const fx = await admin("POST", "catalog/fx-rates", {
  usdToCadMicro: "1400000",
  note: "taux de DÉVELOPPEMENT (essai de bout en bout)",
});
await admin("POST", `catalog/fx-rates/${fx.json.id}/approve`);

const models = await admin("GET", "catalog/models");
let model = (models.json.models as any[] | undefined)?.find(
  (m) => m.publicId === PUBLIC_ID,
);
if (!model) {
  const created = await admin("POST", "catalog/models", {
    publicId: PUBLIC_ID,
    name: "GLM 5.3 (développement)",
    descriptionFr:
      "Modèle de démonstration relayé par le LiteLLM de développement. Prix fictifs : ne pas utiliser en production.",
    descriptionEn:
      "Demonstration model relayed by the development LiteLLM. Fictitious prices: do not use in production.",
    providerId: provider.id,
    upstreamId: UPSTREAM_MODEL,
    contextMax: 128_000,
    maxOutputTokens: 4096,
    capabilities: { streaming: true, reasoning: true },
  });
  check(
    created.status === 201,
    "modèle nexora/glm-5-3 créé",
    created.json.error ?? "",
  );
  model = created.json;
}
const history = await admin("GET", `catalog/models/${model.id}/prices`);
const latest = (history.json.prices as any[] | undefined)?.[0];
const same =
  latest?.upstreamInputUsdMicro === "500000" &&
  latest?.upstreamOutputUsdMicro === "1000000" &&
  latest?.marginFloorBps === 3000;
const price = same
  ? { status: 201, json: latest }
  : await admin("POST", `catalog/models/${model.id}/prices`, {
      upstreamInputUsdMicro: "500000",
      upstreamOutputUsdMicro: "1000000",
      marginBps: 3000,
      marginFloorBps: 3000,
      note: "PRIX FICTIFS DE DÉVELOPPEMENT",
    });
check(
  price.status === 201,
  "prix de développement en place (0,50 $ US / 1,00 $ US par million, marge 30 %, plancher 30 %)",
  same ? "déjà présents, historique inchangé" : "ligne ajoutée",
);
const sellIn = BigInt(price.json.sellInputCadMicro);
const sellOut = BigInt(price.json.sellOutputCadMicro);
for (const status of ["approved", "published"]) {
  const r = await admin("PATCH", `catalog/models/${model.id}`, { status });
  if (r.status !== 200)
    check(
      false,
      `modèle -> ${status}`,
      JSON.stringify(r.json.issues ?? r.json.error),
    );
}
const draft = await admin("POST", "catalog/versions");
check(
  [200, 201].includes(draft.status) && (draft.json.issues ?? []).length === 0,
  "version de catalogue (brouillon) sans problème",
  `diff : ${(draft.json.diff ?? []).length} changement(s)`,
);
const versionId = draft.json.version.id as string;
if (draft.json.version.status === "draft") {
  check(
    (await admin("POST", `catalog/versions/${versionId}/approve`)).status ===
      200,
    "version approuvée",
  );
  const pub = await admin("POST", `catalog/versions/${versionId}/publish`);
  check(
    pub.status === 200 && pub.json.version.status === "published",
    "version publiée (hash figé)",
    pub.json.version?.short ?? "",
  );
} else {
  check(
    draft.json.version.status === "published",
    "catalogue déjà publié (aucun changement)",
  );
}
const sync = await admin("POST", "catalog/sync-litellm");
check(
  sync.status === 200 && sync.json.status === "applied",
  "synchronisation vers LiteLLM appliquée",
  `${sync.json.version} · créés ${sync.json.summary?.models?.created?.length ?? "?"}, mis à jour ${sync.json.summary?.models?.updated?.length ?? "?"}`,
);
const cat = await admin("GET", "catalog");
check(
  cat.json.published?.appliedStatus === "applied" &&
    Boolean(cat.json.published?.appliedAt),
  "état « appliqué » et date écrits en retour",
  String(cat.json.published?.appliedAt),
);
const catalogVersion = String(cat.json.published?.short);

// ─── 3. Organisation de test, crédit de test, clé ───────────────────────────────

const handle = createDb(DATABASE_URL, { max: 2 });
const db = handle.db;
const ORG = "org_e2e_gateway";
await db
  .insert(organizations)
  .values({ id: ORG, name: "Organisation d'essai (passerelle)", slug: ORG })
  .onConflictDoNothing();
await grantTestCredit(db, {
  organizationId: ORG,
  amountMicro: 5n * M,
  label: `e2e-${Date.now()}`,
});
const start = await getAccount(db, ORG);
check(
  start.availableMicro >= 5n * M,
  "organisation de test créditée par le grand livre (crédit de TEST, aucun paiement)",
  `solde ${start.balanceMicro} µCAD`,
);
const { key, record } = await createApiKey(db, {
  organizationId: ORG,
  name: "essai e2e",
});
check(
  key.startsWith("nxk_"),
  "clé Nexora créée (valeur affichée une seule fois)",
  `préfixe ${record.prefix}`,
);

const openai = new OpenAI({
  baseURL: `${BASE}/v1`,
  apiKey: key,
  maxRetries: 0,
});
const priceBook = { input: sellIn, output: sellOut, cache: null };

// ─── 4. Appel réel, non diffusé ─────────────────────────────────────────────────

const models1 = await openai.models.list();
check(
  models1.data.some((m) => m.id === PUBLIC_ID),
  "GET /v1/models liste le modèle publié",
);

const before1 = await getAccount(db, ORG);
const completion = await openai.chat.completions.create({
  model: PUBLIC_ID,
  messages: [
    {
      role: "user",
      content:
        "Réponds par une seule courte phrase : quelle est la capitale du Québec ?",
    },
  ],
  max_tokens: 800,
});
const u1 = completion.usage;
check(
  Boolean(completion.choices[0]?.message?.content) && Boolean(u1),
  "chat.completions (non diffusé) : réponse reçue",
  `${u1?.prompt_tokens} jetons en entrée, ${u1?.completion_tokens} en sortie`,
);
check(
  !("provider" in completion) && !JSON.stringify(completion).includes("cost"),
  "la réponse ne révèle ni l'amont ni ses coûts",
);
const cost1 = requestCost(
  {
    prompt: u1?.prompt_tokens ?? 0,
    completion: u1?.completion_tokens ?? 0,
    cached: 0,
  },
  priceBook,
);
const after1 = await getAccount(db, ORG);
check(
  before1.balanceMicro - after1.balanceMicro === cost1,
  "débit exact du grand livre (non diffusé)",
  `${cost1} µCAD = ceil((${u1?.prompt_tokens}×${sellIn} + ${u1?.completion_tokens}×${sellOut}) / 1 000 000)`,
);
check(after1.heldMicro === 0n, "aucun montant resté réservé");

// ─── 5. Appel réel, diffusé ─────────────────────────────────────────────────────

const before2 = await getAccount(db, ORG);
const stream = await openai.chat.completions.create({
  model: PUBLIC_ID,
  messages: [{ role: "user", content: "Dis bonjour en cinq mots au plus." }],
  max_tokens: 800,
  stream: true,
  stream_options: { include_usage: true },
});
let text = "";
let u2: { prompt_tokens: number; completion_tokens: number } | null = null;
let chunks = 0;
for await (const chunk of stream) {
  chunks += 1;
  text += chunk.choices[0]?.delta?.content ?? "";
  if (chunk.usage) u2 = chunk.usage;
}
check(
  chunks > 2 && Boolean(u2),
  "chat.completions (diffusé) : flux SSE complet avec usage",
  `${chunks} fragments, ${u2?.prompt_tokens} jetons en entrée, ${u2?.completion_tokens} en sortie`,
);
const cost2 = requestCost(
  {
    prompt: u2?.prompt_tokens ?? 0,
    completion: u2?.completion_tokens ?? 0,
    cached: 0,
  },
  priceBook,
);
const after2 = await getAccount(db, ORG);
check(
  before2.balanceMicro - after2.balanceMicro === cost2,
  "débit exact du grand livre (diffusé)",
  `${cost2} µCAD`,
);
check(after2.heldMicro === 0n, "aucun montant resté réservé");

// ─── 6. Événements d'usage et cohérence du grand livre ──────────────────────────

const events = await db
  .select()
  .from(usageEvents)
  .where(eq(usageEvents.apiKeyId, record.id))
  .orderBy(usageEvents.createdAt);
check(events.length === 2, "deux événements d'usage (métadonnées seulement)");
const [e1, e2] = events;
check(
  e1?.costMicro === cost1 &&
    e1?.promptTokens === u1?.prompt_tokens &&
    e1?.completionTokens === u1?.completion_tokens &&
    e1?.stream === false &&
    e1?.status === "ok",
  "événement 1 cohérent avec la réponse et le débit",
  `coût ${e1?.costMicro} µCAD, ${e1?.latencyMs} ms`,
);
check(
  e2?.costMicro === cost2 &&
    e2?.promptTokens === u2?.prompt_tokens &&
    e2?.completionTokens === u2?.completion_tokens &&
    e2?.stream === true &&
    e2?.status === "ok",
  "événement 2 (flux) cohérent avec la réponse et le débit",
  `coût ${e2?.costMicro} µCAD, ${e2?.latencyMs} ms`,
);
check(
  events.every((e) => e.configVersion === catalogVersion),
  "les événements portent la version de catalogue publiée",
  catalogVersion,
);
const derived = await deriveBalance(db, ORG);
const final = await getAccount(db, ORG);
check(
  derived.balanceMicro === final.balanceMicro && derived.heldMicro === 0n,
  "solde du grand livre = solde recalculé depuis les écritures",
);
const [keyRow] = await db
  .select()
  .from(apiKeys)
  .where(eq(apiKeys.id, record.id));
check(
  keyRow?.spentMicro === cost1 + cost2,
  "dépense cumulée de la clé = somme des coûts",
);

// ─── 7. Révocation ──────────────────────────────────────────────────────────────

await revokeApiKey(db, ORG, record.id);
let status = 0;
try {
  await openai.chat.completions.create({
    model: PUBLIC_ID,
    messages: [{ role: "user", content: "x" }],
    max_tokens: 5,
  });
} catch (error) {
  status = (error as { status?: number }).status ?? 0;
}
check(status === 401, "clé révoquée : l'appel est refusé en 401");
const afterRevoke = await getAccount(db, ORG);
check(
  afterRevoke.balanceMicro === final.balanceMicro,
  "l'appel refusé ne débite rien",
);

// ─── Fin ────────────────────────────────────────────────────────────────────────

await handle.close();
console.log(
  failures === 0 ? "\nTOUT EST VERT" : `\n${failures} vérification(s) en échec`,
);
console.log(
  text ? `(extrait du flux : ${JSON.stringify(text.slice(0, 60))})` : "",
);
process.exit(failures === 0 ? 0 : 1);
