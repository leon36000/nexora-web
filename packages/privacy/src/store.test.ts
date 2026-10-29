import { privacyEvents, privacyPolicies } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  decisionCounts,
  listPolicyVersions,
  loadCurrentPolicy,
  monthlyReportRows,
  savePolicy,
} from "./store.ts";
import { newOrganization } from "./test-support.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

describe("savePolicy", () => {
  it("crée la version 1, puis une nouvelle version courante à chaque changement", async () => {
    const org = await newOrganization(t.db);
    expect(await loadCurrentPolicy(t.db, org)).toBeNull();
    const v1 = await savePolicy(t.db, {
      organizationId: org,
      level: "renforce",
      config: { allowedModels: ["a"] },
      createdBy: null,
    });
    expect(v1).toMatchObject({ version: 1, changed: true });
    const v2 = await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: { allowedModels: ["a"] },
      createdBy: null,
    });
    expect(v2).toMatchObject({ version: 2, changed: true });
    expect(await loadCurrentPolicy(t.db, org)).toMatchObject({
      version: 2,
      level: "souverain",
    });
    const versions = await listPolicyVersions(t.db, org, 10);
    expect(versions.map((v) => [v.version, v.current])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("n'ajoute pas de version quand rien ne change", async () => {
    const org = await newOrganization(t.db);
    const input = {
      organizationId: org,
      level: "standard" as const,
      config: { blockedHosts: ["x.example"] },
      createdBy: null,
    };
    await savePolicy(t.db, input);
    const again = await savePolicy(t.db, input);
    expect(again).toMatchObject({ version: 1, changed: false });
    expect(await t.db.select().from(privacyPolicies)).toBeTruthy();
  });

  it("des enregistrements simultanés donnent des versions distinctes, une seule courante", async () => {
    const org = await newOrganization(t.db);
    await Promise.all(
      ["a", "b", "c", "d"].map((m) =>
        savePolicy(t.db, {
          organizationId: org,
          level: "renforce",
          config: { allowedModels: [m] },
          createdBy: null,
        }),
      ),
    );
    const versions = await listPolicyVersions(t.db, org, 10);
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2, 3, 4]);
    expect(versions.filter((v) => v.current)).toHaveLength(1);
  });
});

describe("rapports", () => {
  it("compte les décisions récentes et agrège le mois sans contenu", async () => {
    const org = await newOrganization(t.db);
    const other = await newOrganization(t.db);
    const base = { product: "gateway", operation: "chat" };
    await t.db.insert(privacyEvents).values([
      {
        organizationId: org,
        ...base,
        decision: "allow",
        createdAt: new Date("2026-10-05T10:00:00Z"),
      },
      {
        organizationId: org,
        ...base,
        decision: "mask",
        ruleIds: ["mask.email"],
        maskedCount: 2,
        destination: "m1",
        destinationKind: "model",
        createdAt: new Date("2026-10-05T11:00:00Z"),
      },
      {
        organizationId: org,
        ...base,
        decision: "mask",
        ruleIds: ["mask.email"],
        maskedCount: 1,
        destination: "m1",
        destinationKind: "model",
        createdAt: new Date("2026-10-05T12:00:00Z"),
      },
      {
        organizationId: org,
        ...base,
        decision: "deny",
        ruleIds: ["model.not_allowed"],
        destination: "m2",
        destinationKind: "model",
        createdAt: new Date("2026-10-20T12:00:00Z"),
      },
      {
        organizationId: org,
        ...base,
        decision: "allow",
        createdAt: new Date("2026-09-30T12:00:00Z"),
      },
      {
        organizationId: other,
        ...base,
        decision: "deny",
        createdAt: new Date("2026-10-05T12:00:00Z"),
      },
    ]);
    expect(
      await decisionCounts(
        t.db,
        org,
        new Date("2026-10-01T00:00:00Z"),
        new Date("2026-11-01T00:00:00Z"),
      ),
    ).toEqual({ allow: 1, mask: 2, deny: 1 });
    const rows = await monthlyReportRows(t.db, org, 2026, 10);
    expect(rows).toEqual([
      {
        day: "2026-10-05",
        product: "gateway",
        operation: "chat",
        decision: "allow",
        destination: "",
        rules: "",
        count: 1,
        maskedItems: 0,
      },
      {
        day: "2026-10-05",
        product: "gateway",
        operation: "chat",
        decision: "mask",
        destination: "m1",
        rules: "mask.email",
        count: 2,
        maskedItems: 3,
      },
      {
        day: "2026-10-20",
        product: "gateway",
        operation: "chat",
        decision: "deny",
        destination: "m2",
        rules: "model.not_allowed",
        count: 1,
        maskedItems: 0,
      },
    ]);
  });
});
