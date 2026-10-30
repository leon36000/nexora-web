import { eq, organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadOrgEntitlements,
  type OrgEntitlements,
} from "../billing/entitlements";
import { createApiKey, revokeApiKey } from "../gateway/keys";
import { newOrganization } from "../gateway/test-support";
import { type CreditsDeps, handleCodeCredits } from "./credits";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const deps = (over: Partial<CreditsDeps> = {}): CreditsDeps => ({
  db: () => t.db,
  now: () => new Date(),
  log: createLogger({ name: "test", sink: () => {} }),
  entitlements: (db, orgId, now) => loadOrgEntitlements(db, orgId, now),
  ...over,
});
let n = 0;
const get = (key: string | null, ip = `10.9.0.${++n}`, method = "GET") =>
  new Request("http://localhost:3722/api/code/credits", {
    method,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      "x-forwarded-for": ip,
    },
  });

const ent = (total: number): OrgEntitlements => ({
  planCode: "nexora-base",
  interval: "month",
  credits: {
    subscription: Math.floor(total * 0.8),
    refill: total - Math.floor(total * 0.8),
    total,
  },
  storage: {
    quotaBytes: 1e9,
    extraBytes: 0,
    usedBytes: 0,
    byProduct: { workstudio: 0, code: 0, rag: 0, creative: 0, bot: 0 },
  },
  canUseModels: total > 0,
});

describe("GET /api/code/credits", () => {
  it("rend le solde de l'organisation de la clé, au format du contrat", async () => {
    const org = await newOrganization(t.db);
    await t.db
      .update(organizations)
      .set({ name: "Atelier Test" })
      .where(eq(organizations.id, org));
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "Nexora Code (x)",
    });
    const res = await handleCodeCredits(
      get(key),
      deps({ entitlements: async () => ent(1000) }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      credits: { subscription: 800, refill: 200, total: 1000 },
      can_use_models: true,
      plan_code: "nexora-base",
      organization_name: "Atelier Test",
    });
  });

  it("une organisation sans crédit : total 0 et can_use_models faux (vrai calcul sur la base)", async () => {
    const org = await newOrganization(t.db);
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    const body = await (await handleCodeCredits(get(key), deps())).json();
    expect(body.credits.total).toBe(0);
    expect(body.can_use_models).toBe(false);
    expect(body.plan_code).toBeNull();
  });

  it("401 sans clé, avec une clé inconnue, révoquée ou mal formée (même réponse)", async () => {
    const org = await newOrganization(t.db);
    const { key, record } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    await revokeApiKey(t.db, org, record.id);
    const answers = [];
    for (const k of [null, `nxk_${"a".repeat(43)}`, key, "pas-une-cle"]) {
      const res = await handleCodeCredits(get(k), deps());
      answers.push({ status: res.status, body: await res.json() });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]?.status).toBe(401);
    expect(answers[0]?.body.error.code).toBe("invalid_api_key");
  });

  it("autre méthode : 405 ; trop d'appels : 429", async () => {
    const org = await newOrganization(t.db);
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    expect(
      (await handleCodeCredits(get(key, "10.8.0.1", "POST"), deps())).status,
    ).toBe(405);
    const d = deps({ limits: { perKey: { limit: 3, windowSeconds: 60 } } });
    const statuses = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await handleCodeCredits(get(key), d)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("une erreur de lecture des droits répond 503, sans détail", async () => {
    const org = await newOrganization(t.db);
    const { key } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    const res = await handleCodeCredits(
      get(key),
      deps({
        entitlements: async () => {
          throw new Error("secret interne");
        },
      }),
    );
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("secret interne");
  });
});
