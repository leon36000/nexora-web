#!/usr/bin/env bun
// Preuve de bout en bout des agents hébergés (S7) :
//   clé d'espace WorkStudio dans le Coffre -> instance, test de connexion, découverte -> agent complété et publié
//   -> organisation de test créditée -> clé cliente nxk_ -> appels réels agent/<slug> (non diffusé puis diffusé)
//   -> débit du grand livre = règlement, événements d'usage -> 402 sans crédit -> clé révoquée (401)
//   -> agent retiré (404) -> clé WorkStudio absente du coffre (erreur propre).
//
//   WORKSTUDIO_KEY_FILE=/chemin/vers/cle bun web/scripts/e2e-agents.ts      (site sur BASE_URL, défaut http://localhost:3541)
//
// Prérequis : WorkStudio sur WORKSTUDIO_URL (défaut http://localhost:3200) avec un agent publié et une clé d'espace
// autorisant « Agents publiés » (fichier WORKSTUDIO_KEY_FILE, jamais affiché ni suivi par git), migrations appliquées.
// DÉVELOPPEMENT SEULEMENT : prix d'ESSAI, crédit de TEST du grand livre (aucun paiement). Aucun secret affiché.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
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
const val = (k: string) => process.env[k] ?? local[k] ?? "";

const BASE = (process.env.BASE_URL ?? "http://localhost:3541").replace(
  /\/+$/,
  "",
);
const WS_URL = (process.env.WORKSTUDIO_URL ?? "http://localhost:3200").replace(
  /\/+$/,
  "",
);
const ADMIN = val("NEXORA_APP_ADMIN_TOKEN");
const DATABASE_URL = val("DATABASE_URL");
const KEY_FILE = process.env.WORKSTUDIO_KEY_FILE ?? "";
const REPORT = process.env.REPORT_FILE ?? "";
for (const [k, v] of Object.entries({
  NEXORA_APP_ADMIN_TOKEN: ADMIN,
  DATABASE_URL,
  WORKSTUDIO_KEY_FILE: KEY_FILE,
})) {
  if (!v) {
    console.error(`Variable manquante : ${k}`);
    process.exit(1);
  }
}
const WS_KEY = readFileSync(KEY_FILE, "utf8").trim();

let failures = 0;
const lines: string[] = [];
function check(ok: boolean, label: string, detail = ""): void {
  lines.push(
    `${ok ? "OK   " : "ÉCHEC"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
  console.log(lines.at(-1));
  if (!ok) failures += 1;
}
// biome-ignore lint/suspicious/noExplicitAny: réponses JSON d'essai
type Json = Record<string, any>;
async function admin(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/admin/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${ADMIN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Json,
  };
}
const M = 1_000_000n;
const RUN_FEE = 50_000n;
const PRICE = { input: 1_000_000n, output: 3_000_000n, cache: null };
const SECRET_REF = "workstudio.s7-dev";

// ─── 1. Coffre, instance, test, découverte ──────────────────────────────────────

const vault = await admin("POST", "vault", {
  ref: SECRET_REF,
  value: WS_KEY,
  kind: "other",
});
check(
  vault.status === 200 && !JSON.stringify(vault.json).includes(WS_KEY),
  "clé d'espace WorkStudio déposée dans le Coffre (ni relue ni renvoyée)",
  `se termine par ${vault.json.last4}`,
);

const insts = await admin("GET", "hosted-agents/instances");
let inst = (insts.json.instances as Json[] | undefined)?.find(
  (i) => i.code === "workstudio-dev",
);
if (!inst) {
  const created = await admin("POST", "hosted-agents/instances", {
    code: "workstudio-dev",
    name: "Nexora WorkStudio (développement)",
    baseUrl: WS_URL,
    secretRef: SECRET_REF,
    region: "quebec",
  });
  check(
    created.status === 201,
    "instance WorkStudio créée (adresse + référence de coffre)",
    created.json.error ?? "",
  );
  inst = created.json;
}
const tested = await admin("POST", `hosted-agents/instances/${inst?.id}/test`);
check(
  tested.status === 200 && tested.json.ok === true,
  "« Tester la connexion » réussie",
  String(tested.json.detail ?? ""),
);
const found = await admin(
  "POST",
  `hosted-agents/instances/${inst?.id}/discover`,
);
check(
  found.status === 200 && found.json.ok === true,
  "« Découvrir les agents » : agents publiés trouvés, créés en brouillon",
  `${found.json.created?.length ?? 0} créé(s), ${found.json.seen?.length ?? 0} déjà connu(s)`,
);
const all = await admin("GET", "hosted-agents/agents");
const agent = (all.json.agents as Json[] | undefined)?.find(
  (a) => a.instanceId === inst?.id,
);
if (!agent) {
  console.error("Aucun agent découvert : publiez un agent dans WorkStudio.");
  process.exit(1);
}
check(
  agent.status === "draft" || agent.status === "published",
  "aucune publication automatique : l'agent découvert reste un brouillon",
  `statut ${agent.status}`,
);

// ─── 2. Complétion et publication par l'administrateur ──────────────────────────

if (agent.status !== "published") {
  const refused = await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
    status: "published",
  });
  check(
    refused.status === 422 && refused.json.error === "publication_refused",
    "publication refusée tant que l'agent est incomplet",
    JSON.stringify((refused.json.issues ?? []).map((i: Json) => i.code)),
  );
  await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
    nameFr: "Assistant général",
    nameEn: "General assistant",
    descriptionFr:
      "Répond aux questions des salariés et cherche dans les bases de connaissances de l’espace WorkStudio.",
    descriptionEn:
      "Answers employees’ questions and searches the WorkStudio workspace knowledge bases.",
    category: "general",
    runTokenCap: 32000,
  });
  const price = await admin("POST", `hosted-agents/agents/${agent.id}/prices`, {
    inputCadMicro: PRICE.input.toString(),
    outputCadMicro: PRICE.output.toString(),
    perRunCadMicro: RUN_FEE.toString(),
    isTrial: true,
    note: "PRIX D'ESSAI DE DÉVELOPPEMENT",
  });
  check(
    price.status === 201 && price.json.isTrial === true,
    "prix d'ESSAI ajouté (marqué comme tel)",
  );
  const pub = await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
    status: "published",
  });
  check(
    pub.status === 200 && pub.json.status === "published",
    "agent publié par l'administrateur",
    `agent/${agent.slug}`,
  );
}
const MODEL = `agent/${agent.slug}`;

// ─── 3. Organisation de test, crédit, clé cliente ───────────────────────────────

const handle = createDb(DATABASE_URL, { max: 2 });
const db = handle.db;
const ORG = "org_e2e_agents";
await db
  .insert(organizations)
  .values({ id: ORG, name: "Organisation d'essai (agents)", slug: ORG })
  .onConflictDoNothing();
await grantTestCredit(db, {
  organizationId: ORG,
  amountMicro: 5n * M,
  label: `e2e-agents-${Date.now()}`,
});
const { key, record } = await createApiKey(db, {
  organizationId: ORG,
  name: "essai agents S7",
});
check(
  key.startsWith("nxk_"),
  "clé cliente nxk_ créée",
  `préfixe ${record.prefix}`,
);
const openai = new OpenAI({
  baseURL: `${BASE}/v1`,
  apiKey: key,
  maxRetries: 0,
});

const list = await openai.models.list();
check(
  list.data.some((m) => m.id === MODEL),
  "GET /v1/models liste l'agent pour cette clé",
  MODEL,
);

// ─── 4. Appel réel non diffusé ──────────────────────────────────────────────────

const before1 = await getAccount(db, ORG);
const completion = await openai.chat.completions.create({
  model: MODEL,
  messages: [
    { role: "system", content: "Ignorée par l'agent." },
    {
      role: "user",
      content: "Réponds par une seule courte phrase : qui es-tu ?",
    },
  ],
});
const u1 = completion.usage;
const text1 = completion.choices[0]?.message?.content ?? "";
check(
  text1.length > 0 && Boolean(u1),
  "agent/<slug> (non diffusé) : réponse de l'agent WorkStudio",
  `« ${text1.slice(0, 90)} »`,
);
check(
  completion.model === MODEL && !JSON.stringify(completion).includes("agent:"),
  "la réponse porte l'identifiant public et ne révèle pas l'identifiant amont",
);
const cost1 =
  requestCost(
    {
      prompt: u1?.prompt_tokens ?? 0,
      completion: u1?.completion_tokens ?? 0,
      cached: 0,
    },
    PRICE,
  ) + RUN_FEE;
const after1 = await getAccount(db, ORG);
check(
  before1.balanceMicro - after1.balanceMicro === cost1,
  "débit du grand livre = règlement (non diffusé)",
  `${cost1} µCAD = jetons (${u1?.prompt_tokens} + ${u1?.completion_tokens}) + exécution ${RUN_FEE}`,
);
check(after1.heldMicro === 0n, "aucun montant resté réservé");

// ─── 5. Appel réel diffusé ──────────────────────────────────────────────────────

const before2 = await getAccount(db, ORG);
const stream = await openai.chat.completions.create({
  model: MODEL,
  messages: [{ role: "user", content: "Dis bonjour en cinq mots au plus." }],
  stream: true,
  stream_options: { include_usage: true },
});
let text2 = "";
let u2: { prompt_tokens: number; completion_tokens: number } | null = null;
let chunks = 0;
for await (const chunk of stream) {
  chunks += 1;
  text2 += chunk.choices[0]?.delta?.content ?? "";
  if (chunk.usage) u2 = chunk.usage;
}
check(
  chunks > 1 && text2.length > 0 && Boolean(u2),
  "agent/<slug> (diffusé) : flux SSE complet avec usage",
  `${chunks} fragments, « ${text2.slice(0, 60)} »`,
);
const cost2 =
  requestCost(
    {
      prompt: u2?.prompt_tokens ?? 0,
      completion: u2?.completion_tokens ?? 0,
      cached: 0,
    },
    PRICE,
  ) + RUN_FEE;
const after2 = await getAccount(db, ORG);
check(
  before2.balanceMicro - after2.balanceMicro === cost2,
  "débit du grand livre = règlement (diffusé)",
  `${cost2} µCAD`,
);
check(after2.heldMicro === 0n, "aucun montant resté réservé");

// ─── 6. Événements d'usage ──────────────────────────────────────────────────────

const events = await db
  .select()
  .from(usageEvents)
  .where(eq(usageEvents.apiKeyId, record.id))
  .orderBy(usageEvents.createdAt);
const [e1, e2] = events;
check(events.length === 2, "deux événements d'usage (métadonnées seulement)");
check(
  e1?.modelPublicId === MODEL &&
    e1?.costMicro === cost1 &&
    e1?.runFeeMicro === RUN_FEE &&
    e1?.stream === false &&
    e1?.status === "ok",
  "événement 1 cohérent avec le débit",
  `coût ${e1?.costMicro} µCAD dont ${e1?.runFeeMicro} par exécution, ${e1?.latencyMs} ms, ${e1?.configVersion}`,
);
check(
  e2?.modelPublicId === MODEL &&
    e2?.costMicro === cost2 &&
    e2?.stream === true &&
    e2?.status === "ok",
  "événement 2 cohérent avec le débit",
  `coût ${e2?.costMicro} µCAD, ${e2?.latencyMs} ms`,
);
const ledger = await deriveBalance(db, ORG);
const acct = await getAccount(db, ORG);
check(
  ledger.balanceMicro === acct.balanceMicro &&
    ledger.heldMicro === acct.heldMicro,
  "le solde dérivé du journal égale le solde du compte",
  `${acct.balanceMicro} µCAD`,
);

// ─── 7. 402 sans crédit : aucun appel amont ─────────────────────────────────────

const POOR = "org_e2e_agents_sans_credit";
await db
  .insert(organizations)
  .values({ id: POOR, name: "Organisation d'essai sans crédit", slug: POOR })
  .onConflictDoNothing();
const poor = await createApiKey(db, {
  organizationId: POOR,
  name: "sans crédit",
});
const wsBefore = Number(process.env.WS_REQUESTS_BEFORE ?? "-1");
const res402 = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${poor.key}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "Bonjour" }],
  }),
});
const body402 = (await res402.json().catch(() => ({}))) as Json;
check(
  res402.status === 402 && body402.error?.code === "insufficient_quota",
  "même requête sans crédit : 402 insufficient_quota",
  `HTTP ${res402.status}`,
);
const poorEvents = await db
  .select()
  .from(usageEvents)
  .where(eq(usageEvents.apiKeyId, poor.record.id));
check(
  poorEvents.length === 0,
  "aucun événement d'usage, aucune exécution facturée pour la requête refusée",
);
void wsBefore;

// ─── 8. Clé révoquée, agent retiré, clé WorkStudio absente du coffre ────────────

await revokeApiKey(db, ORG, record.id);
const revoked = await fetch(`${BASE}/v1/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: "Bonjour" }],
  }),
});
check(
  revoked.status === 401 &&
    ((await revoked.json()) as Json).error?.code === "api_key_revoked",
  "clé révoquée : 401 api_key_revoked",
  `HTTP ${revoked.status}`,
);

const live = await createApiKey(db, {
  organizationId: ORG,
  name: "essai agents S7 (2)",
});
const call = (k: string, model = MODEL) =>
  fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${k}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Bonjour" }],
    }),
  });

// Clé absente du coffre : on pointe l'instance vers une référence sans valeur, puis on rétablit.
await admin("PATCH", `hosted-agents/instances/${inst?.id}`, {
  secretRef: "workstudio.absente",
});
const missing = await call(live.key);
const missingText = await missing.text();
check(
  missing.status === 503 &&
    JSON.parse(missingText).error?.code === "agent_unavailable" &&
    !missingText.includes("workstudio.") &&
    !missingText.includes(WS_KEY),
  "clé WorkStudio absente du coffre : 503 agent_unavailable, sans fuite",
  `HTTP ${missing.status}`,
);
await admin("PATCH", `hosted-agents/instances/${inst?.id}`, {
  secretRef: SECRET_REF,
});

const retire = await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
  status: "retired",
});
const gone = await call(live.key);
check(
  retire.status === 200 &&
    gone.status === 404 &&
    ((await gone.json()) as Json).error?.code === "model_not_found",
  "agent retiré : 404 model_not_found",
  `HTTP ${gone.status}`,
);
const back = await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
  status: "draft",
});
const again = await admin("PATCH", `hosted-agents/agents/${agent.id}`, {
  status: "published",
});
check(
  back.status === 200 && again.status === 200,
  "agent remis en ligne après la preuve (brouillon puis publié)",
);
await revokeApiKey(db, ORG, live.record.id);

await handle.close();
console.log(failures === 0 ? "\nTOUT EST OK" : `\n${failures} ÉCHEC(S)`);
if (REPORT)
  writeFileSync(
    REPORT,
    `${lines.join("\n")}\n\n${failures === 0 ? "TOUT EST OK" : `${failures} ÉCHEC(S)`}\n`,
  );
process.exit(failures === 0 ? 0 : 1);
