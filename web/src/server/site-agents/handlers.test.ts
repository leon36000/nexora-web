import { randomBytes } from "node:crypto";
import {
  apiKeys,
  eq,
  getAccount,
  INTERNAL_AGENTS_ORG,
  jobs,
  siteAgentRuns,
  siteAgents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishTestCatalog } from "../gateway/test-support";
import { loadKeyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import {
  handleSiteAgentsAdmin,
  MAX_CREDIT_MICRO,
  type SiteAgentsAdminDeps,
} from "./handlers";

const TOKEN = "t".repeat(40);
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
let t: TestDatabase;
let deps: SiteAgentsAdminDeps;
/** Texte de toutes les réponses reçues : on y cherche les secrets. */
const seen: string[] = [];

beforeAll(async () => {
  t = await createTestDatabase();
  deps = {
    db: () => t.db,
    adminToken: TOKEN,
    keyring: () => keyring,
    log: createLogger({ name: "test", level: "error" }),
    now: () => new Date(),
  };
  await publishTestCatalog(t.db, [
    { publicId: "nexora/glm-5-3" },
    { publicId: "essai/autre" },
  ]);
});
afterAll(async () => {
  await t.drop();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` },
  override?: Partial<SiteAgentsAdminDeps>,
) {
  const request = new Request(`http://app.test/api/admin/site-agents/${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await handleSiteAgentsAdmin(
    request,
    path.split("?")[0]?.split("/").filter(Boolean) ?? [],
    { ...deps, ...override },
  );
  const text = await res.text();
  seen.push(text);
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("authentification", () => {
  it("503 sans jeton configuré, 401 sans jeton ou avec un mauvais jeton", async () => {
    expect(
      (await call("GET", "", undefined, {}, { adminToken: undefined })).status,
    ).toBe(503);
    expect((await call("GET", "", undefined, {})).status).toBe(401);
    expect(
      (await call("GET", "", undefined, { authorization: "Bearer faux" }))
        .status,
    ).toBe(401);
  });
});

describe("liste et réglages", () => {
  it("liste les cinq agents, désactivés, budget 0", async () => {
    const r = await call("GET", "");
    expect(r.status).toBe(200);
    expect(r.body.agents.map((a: { key: string }) => a.key)).toEqual(
      ["redacteur", "traducteur", "seo", "veille", "sante"].sort(),
    );
    for (const a of r.body.agents) {
      expect(a.enabled).toBe(false);
      expect(a.budgetMicro).toBe("0");
      expect(a.gatewayKey.present).toBe(false);
    }
    expect(r.body.gateway.orgName).toBe(INTERNAL_AGENTS_ORG.name);
  });

  it("refuse l'activation sans clé de passerelle, sans budget, sans jeton Directus", async () => {
    expect(
      (await call("PATCH", "redacteur", { budgetMicro: "1000000" })).status,
    ).toBe(200);
    expect(
      (await call("PATCH", "redacteur", { enabled: true })).body.error,
    ).toBe("gateway_key_missing");

    // clé générée, budget remis à 0
    expect((await call("POST", "redacteur/gateway-key")).status).toBe(201);
    await call("PATCH", "redacteur", { budgetMicro: 0 });
    expect(
      (await call("PATCH", "redacteur", { enabled: true })).body.error,
    ).toBe("budget_zero");

    await call("PATCH", "redacteur", { budgetMicro: "1000000" });
    expect(
      (await call("PATCH", "redacteur", { enabled: true })).body.error,
    ).toBe("directus_token_missing");

    await putSecret(t.db, keyring, {
      ref: "site-agent.redacteur.directus",
      value: "directus-token-factice-0123456789",
      kind: "other",
    });
    const ok = await call("PATCH", "redacteur", { enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.body.agent.state).toBe("idle");
    expect(ok.body.agent.directusToken.present).toBe(true);
  });

  it("valide le budget (plafond de 100 $), le modèle (publié) et la configuration", async () => {
    expect(
      (await call("PATCH", "seo", { budgetMicro: "100000001" })).status,
    ).toBe(422);
    expect(
      (await call("PATCH", "seo", { model: "inconnu/modele" })).body.error,
    ).toBe("model_unknown");
    expect((await call("PATCH", "seo", { model: "essai/autre" })).status).toBe(
      200,
    );
    expect(
      (await call("PATCH", "seo", { config: { a: { b: 1 } } })).status,
    ).toBe(422);
    expect((await call("PATCH", "seo", { inconnu: 1 })).status).toBe(422);
    expect((await call("PATCH", "inconnu", { enabled: true })).status).toBe(
      404,
    );
    expect(
      (await call("PATCH", "sante", { model: "nexora/glm-5-3" })).body.error,
    ).toBe("agent_without_llm");
  });

  it("l'agent Santé s'active sans clé ni budget (aucun modèle coûteux)", async () => {
    const r = await call("PATCH", "sante", { enabled: true });
    expect(r.status).toBe(200);
    expect(r.body.agent.state).toBe("idle");
  });
});

describe("clé de passerelle", () => {
  it("écrit la clé dans le Coffre, ne la renvoie jamais, révoque l'ancienne", async () => {
    const first = await call("POST", "traducteur/gateway-key");
    expect(first.status).toBe(201);
    expect(Object.keys(first.body).sort()).toEqual(["last4", "ref"]);
    const [agent1] = await t.db
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, "traducteur"));
    const secret1 = await readSecret(
      t.db,
      keyring,
      "site-agent.traducteur.gateway",
    );
    expect(secret1.startsWith("nxk_")).toBe(true);
    expect(agent1?.gatewayKeyId).toBeTruthy();

    const second = await call("POST", "traducteur/gateway-key");
    expect(second.status).toBe(201);
    const secret2 = await readSecret(
      t.db,
      keyring,
      "site-agent.traducteur.gateway",
    );
    expect(secret2).not.toBe(secret1);
    const [old] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, agent1?.gatewayKeyId as string));
    expect(old?.revokedAt).not.toBeNull();
    expect(old?.organizationId).toBe(INTERNAL_AGENTS_ORG.id);
    expect(old?.allowedModels).toEqual(["nexora/glm-5-3"]);
    // aucune réponse ne contient une valeur de clé
    for (const s of [secret1, secret2])
      for (const text of seen) expect(text).not.toContain(s);
    const list = await call("GET", "");
    const trad = list.body.agents.find(
      (a: { key: string }) => a.key === "traducteur",
    );
    expect(trad.gatewayKey.present).toBe(true);
    expect(trad.gatewayKey.last4).toBe(second.body.last4);
  });

  it("refuse pour un agent sans modèle et sans trousseau du Coffre", async () => {
    expect((await call("POST", "sante/gateway-key")).body.error).toBe(
      "agent_without_llm",
    );
    const r = await call("POST", "veille/gateway-key", undefined, undefined, {
      keyring: () => {
        throw new Error("absent");
      },
    });
    expect(r.status).toBe(503);
  });
});

describe("exécutions", () => {
  it("refuse de lancer un agent désactivé ou sans les entrées requises", async () => {
    expect(
      (
        await call("POST", "veille/run", {
          sourceUrl: "https://exemple.test/a",
        })
      ).body.error,
    ).toBe("agent_disabled");
    expect((await call("POST", "redacteur/run", {})).status).toBe(422);
    expect(
      (await call("POST", "redacteur/run", { brief: "court" })).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "redacteur/run", {
          brief: "Un brief suffisamment long",
          pageId: "x",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "redacteur/run", {
          brief: "Un brief suffisamment long",
          sourceUrl: "file:///etc/passwd",
        })
      ).status,
    ).toBe(422);
  });

  it("crée l'exécution et UNE tâche idempotente dans la même transaction", async () => {
    const r = await call("POST", "redacteur/run", {
      brief: "Rédiger une page sur la souveraineté des données",
    });
    expect(r.status).toBe(202);
    const [run] = await t.db
      .select()
      .from(siteAgentRuns)
      .where(eq(siteAgentRuns.id, r.body.runId));
    expect(run?.status).toBe("queued");
    expect(run?.trigger).toBe("manual");
    expect(run?.jobId).toBe(r.body.jobId);
    const queued = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `site-agent-run:${r.body.runId}`));
    expect(queued).toHaveLength(1);
    expect(queued[0]?.type).toBe("site-agent.run");
    expect(queued[0]?.payload).toEqual({ runId: r.body.runId });
  });

  it("refuse quand le budget du mois est dépensé", async () => {
    await t.db.insert(siteAgentRuns).values({
      agentKey: "redacteur",
      status: "succeeded",
      costMicro: 1_000_000n,
    });
    const r = await call("POST", "redacteur/run", {
      brief: "Un autre brief suffisamment long",
    });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("budget_exceeded");
    const list = await call("GET", "");
    const a = list.body.agents.find(
      (x: { key: string }) => x.key === "redacteur",
    );
    expect(a.spentMonthMicro).toBe("1000000");
  });

  it("l'arrêt désactive l'agent et arrête les exécutions en attente", async () => {
    const stop = await call("POST", "redacteur/stop");
    expect(stop.status).toBe(200);
    expect(stop.body.stoppedQueued).toBeGreaterThanOrEqual(1);
    const [agent] = await t.db
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, "redacteur"));
    expect(agent?.enabled).toBe(false);
    expect(agent?.state).toBe("disabled");
    const runs = await call("GET", "runs?agent=redacteur&limit=5");
    expect(
      runs.body.runs.some((r: { status: string }) => r.status === "stopped"),
    ).toBe(true);
    const detail = await call("GET", `runs/${runs.body.runs[0].id}`);
    expect(detail.body.run.events).toBeDefined();
    expect((await call("GET", "runs/pas-un-uuid")).status).toBe(404);
  });
});

describe("crédit alloué à l'organisation interne", () => {
  it("crédite, rejoue sans doublon, plafonne et refuse une clé réutilisée avec un autre montant", async () => {
    const body = {
      amountMicro: "2000000",
      idempotencyKey: "allocation-essai-0001",
      note: "essai",
    };
    const a = await call("POST", "credit", body);
    expect(a.status).toBe(201);
    const b = await call("POST", "credit", body);
    expect(b.status).toBe(200);
    expect(b.body.replayed).toBe(true);
    expect((await getAccount(t.db, INTERNAL_AGENTS_ORG.id)).balanceMicro).toBe(
      2_000_000n,
    );
    expect(
      (await call("POST", "credit", { ...body, amountMicro: "3000000" }))
        .status,
    ).toBe(409);
    expect(
      (
        await call("POST", "credit", {
          ...body,
          idempotencyKey: "allocation-essai-0002",
          amountMicro: (MAX_CREDIT_MICRO + 1n).toString(),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "credit", {
          ...body,
          idempotencyKey: "allocation-essai-0003",
          amountMicro: "0",
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "credit", {
          amountMicro: "1",
          idempotencyKey: "court",
        })
      ).status,
    ).toBe(422);
    const overview = await call("GET", "");
    expect(overview.body.gateway.availableMicro).toBe("2000000");
  });
});
