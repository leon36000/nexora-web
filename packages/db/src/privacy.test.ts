import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organizations, privacyEvents, privacyPolicies } from "./schema.ts";
import { createTestDatabase, type TestDatabase } from "./testing.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function org(id: string) {
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

describe("migration 0022 : tables du Privacy Router", () => {
  it("privacy_events n'a aucune colonne de contenu (journal de métadonnées)", async () => {
    const rows = await t.sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'privacy_events'`;
    expect(rows.map((r) => r.column_name).sort()).toEqual(
      [
        "api_key_id",
        "created_at",
        "data_kinds",
        "decision",
        "deny_reason",
        "destination",
        "destination_kind",
        "detected",
        "id",
        "masked_count",
        "operation",
        "organization_id",
        "policy_version",
        "product",
        "rule_ids",
      ].sort(),
    );
  });

  it("une seule politique courante par organisation, plusieurs versions historiques", async () => {
    const id = await org("org_priv_a");
    await t.db.insert(privacyPolicies).values({
      organizationId: id,
      version: 1,
      level: "standard",
      current: false,
    });
    await t.db.insert(privacyPolicies).values({
      organizationId: id,
      version: 2,
      level: "renforce",
      current: true,
    });
    await expect(
      t.db.insert(privacyPolicies).values({
        organizationId: id,
        version: 3,
        level: "souverain",
        current: true,
      }),
    ).rejects.toThrow();
    // Une version n'existe qu'une fois par organisation.
    await expect(
      t.db.insert(privacyPolicies).values({
        organizationId: id,
        version: 2,
        level: "standard",
        current: false,
      }),
    ).rejects.toThrow();
  });

  it("refuse un niveau, une version et une décision invalides", async () => {
    const id = await org("org_priv_b");
    await expect(
      t.db.insert(privacyPolicies).values({
        organizationId: id,
        version: 1,
        level: "laxiste" as never,
      }),
    ).rejects.toThrow();
    await expect(
      t.db
        .insert(privacyPolicies)
        .values({ organizationId: id, version: 0, level: "standard" }),
    ).rejects.toThrow();
    await expect(
      t.db.insert(privacyEvents).values({
        organizationId: id,
        product: "gateway",
        operation: "chat",
        decision: "peut-etre" as never,
      }),
    ).rejects.toThrow();
  });

  it("enregistre un événement avec ses valeurs par défaut", async () => {
    const id = await org("org_priv_c");
    const [row] = await t.db
      .insert(privacyEvents)
      .values({
        organizationId: id,
        product: "gateway",
        operation: "chat",
        decision: "mask",
        ruleIds: ["mask.email"],
        destination: "mistral-small",
        destinationKind: "model",
        dataKinds: ["prompt"],
        detected: ["email"],
        maskedCount: 2,
      })
      .returning();
    expect(row?.policyVersion).toBe(0);
    expect(row?.apiKeyId).toBeNull();
    expect(row?.ruleIds).toEqual(["mask.email"]);
  });
});
