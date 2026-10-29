import { randomBytes } from "node:crypto";
import { sql, vpsInstances } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createOrder } from "@nexora/vps";
import {
  CUSTOMER_KEY,
  type Fixture,
  newOrg,
  seedFixture,
} from "@nexora/vps/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadOverview } from "./activity-overview";
import { setBillingMode } from "./house";
import { createApiKey, revokeApiKey } from "./keys";
import { newOrganization } from "./test-support";

const NOW = new Date("2026-10-29T15:00:00.000Z");

let t: TestDatabase;
let fx: Fixture;
let seq = 0;
beforeAll(async () => {
  t = await createTestDatabase();
  fx = await seedFixture(t.db, { simPort: 8006, withPorts: true });
});
afterAll(async () => {
  await t.drop();
});

async function event(
  org: string,
  keyId: string,
  o: { at: string; model?: string; status?: string; cost?: number },
) {
  seq += 1;
  await t.db.execute(sql`
    INSERT INTO usage_events (
      request_id, organization_id, api_key_id, model_public_id, endpoint, config_version,
      status, http_status, prompt_tokens, completion_tokens, cost_micro, value_micro, latency_ms, created_at
    ) VALUES (
      ${`req_ov_${seq}`}, ${org}, ${keyId}, ${o.model ?? "nexora/test"}, 'chat.completions', 'cat_x',
      ${o.status ?? "ok"}, ${o.status === "error" ? 502 : 200}, 10, 5, ${o.cost ?? 100}, ${o.cost ?? 100}, 40, ${o.at}::timestamptz
    )
  `);
}

async function vps(
  organizationId: string,
  status: (typeof vpsInstances.$inferInsert)["status"],
) {
  const { order } = await createOrder(t.db, {
    organizationId,
    idempotencyKey: `ov-${randomBytes(4).toString("hex")}`,
    planCode: fx.planCode,
    appCode: fx.appCode,
    term: "month",
    sshPublicKey: CUSTOMER_KEY,
    maxPerOrganization: 99,
  });
  await t.db.insert(vpsInstances).values({
    orderId: order.id,
    organizationId,
    vcpu: 2,
    ramMb: 4096,
    diskGb: 40,
    planCode: fx.planCode,
    appCode: fx.appCode,
    appVersion: "1.2.3",
    catalogVersionId: fx.catalogVersionId,
    vmName: `nx-${order.id.slice(0, 8)}`,
    status,
    step: "done",
  });
}

describe("aperçu du panneau", () => {
  it("une organisation neuve : rien de fait, mode standard, synthèse vide", async () => {
    const org = await newOrganization(t.db);
    expect(await loadOverview(t.db, org, NOW)).toEqual({
      billingMode: "standard",
      hasApiKey: false,
      hasModelRequest: false,
      hasVps: false,
      last30: {
        requests: 0,
        errors: 0,
        promptTokens: 0,
        completionTokens: 0,
        cachedTokens: 0,
        costMicro: 0n,
        valueMicro: 0n,
        avgLatencyMs: null,
      },
    });
  });

  it("une clé créée compte, même révoquée depuis (l'étape « créer une clé » est faite)", async () => {
    const org = await newOrganization(t.db);
    const { record } = await createApiKey(t.db, {
      organizationId: org,
      name: "k",
    });
    expect((await loadOverview(t.db, org, NOW)).hasApiKey).toBe(true);
    await revokeApiKey(t.db, org, record.id, NOW);
    expect((await loadOverview(t.db, org, NOW)).hasApiKey).toBe(true);
    // Mais pas celle d'une autre organisation.
    const other = await newOrganization(t.db);
    expect((await loadOverview(t.db, other, NOW)).hasApiKey).toBe(false);
  });

  it("« essayer un modèle » : une requête réussie vers un modèle ; ni une erreur, ni un agent, ni une autre organisation", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const ka = (await createApiKey(t.db, { organizationId: a, name: "k" }))
      .record.id;
    const kb = (await createApiKey(t.db, { organizationId: b, name: "k" }))
      .record.id;
    await event(a, ka, {
      at: "2026-10-28T12:00:00Z",
      status: "error",
    });
    await event(a, ka, {
      at: "2026-10-28T12:00:00Z",
      model: "agent/facturation",
    });
    await event(b, kb, { at: "2026-10-28T12:00:00Z" });
    expect((await loadOverview(t.db, a, NOW)).hasModelRequest).toBe(false);
    await event(a, ka, { at: "2026-01-02T12:00:00Z" }); // ancienne mais réussie
    expect((await loadOverview(t.db, a, NOW)).hasModelRequest).toBe(true);
  });

  it("le résumé couvre les 30 derniers jours de l'organisation", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const ka = (await createApiKey(t.db, { organizationId: a, name: "k" }))
      .record.id;
    const kb = (await createApiKey(t.db, { organizationId: b, name: "k" }))
      .record.id;
    await event(a, ka, { at: "2026-10-20T12:00:00Z", cost: 300 });
    await event(a, ka, { at: "2026-10-28T12:00:00Z", cost: 200 });
    await event(a, ka, { at: "2026-09-01T12:00:00Z", cost: 99_999 }); // hors période
    await event(b, kb, { at: "2026-10-28T12:00:00Z", cost: 7_777 });
    const o = await loadOverview(t.db, a, NOW);
    expect(o.last30).toMatchObject({ requests: 2, costMicro: 500n });
  });

  it("le mode « maison » est lu de la table de facturation", async () => {
    const org = await newOrganization(t.db);
    await setBillingMode(t.db, org, "house");
    expect((await loadOverview(t.db, org, NOW)).billingMode).toBe("house");
  });

  it("« installer un VPS » : un VPS en service compte ; un VPS en échec, supprimé ou d'un autre non", async () => {
    const a = await newOrg(t.db);
    const b = await newOrg(t.db);
    await vps(b, "active");
    expect((await loadOverview(t.db, a, NOW)).hasVps).toBe(false);
    await vps(a, "failed");
    await vps(a, "canceled");
    await vps(a, "provisioning");
    expect((await loadOverview(t.db, a, NOW)).hasVps).toBe(false);
    await vps(a, "active");
    expect((await loadOverview(t.db, a, NOW)).hasVps).toBe(true);
  });
});
