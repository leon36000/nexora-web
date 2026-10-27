import { apiKeys, eq } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type AccountContext,
  type AccountKeysDeps,
  handleCreateKey,
  handleRevokeKey,
} from "./account-handlers";
import {
  authenticateApiKey,
  createApiKey,
  hashApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
} from "./keys";
import { newOrganization } from "./test-support";

let t: TestDatabase;
let orgA: string;
let orgB: string;
const SITE = "http://localhost:3500";

beforeAll(async () => {
  t = await createTestDatabase();
  orgA = await newOrganization(t.db);
  orgB = await newOrganization(t.db);
});
afterAll(async () => {
  await t.drop();
});

const deps = (ctx: AccountContext | null): AccountKeysDeps => ({
  db: () => t.db,
  siteUrl: SITE,
  getContext: async () => ctx,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => new Date(),
});
const owner = (org: string): AccountContext => ({
  userId: `u-${org}`,
  organizationId: org,
  role: "owner",
});
const req = (method: string, body?: unknown, origin = SITE) =>
  new Request(`${SITE}/api/account/api-keys`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("création de clé", () => {
  it("renvoie la valeur une seule fois ; seule l'empreinte est en base", async () => {
    const res = await handleCreateKey(
      req("POST", { name: "Prod", spendCapCad: "25,50", expiresInDays: 30 }),
      deps(owner(orgA)),
    );
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j.key).toMatch(/^nxk_/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const [row] = await t.db.select().from(apiKeys).where(eq(apiKeys.id, j.id));
    expect(row?.keyHash).toBe(hashApiKey(j.key));
    expect(row?.spendCapMicro).toBe(25_500_000n);
    expect(row?.organizationId).toBe(orgA);
    expect((await authenticateApiKey(t.db, `Bearer ${j.key}`)).ok).toBe(true);
  });

  it("l'organisation vient de la session, pas du corps", async () => {
    const res = await handleCreateKey(
      req("POST", { name: "x", organizationId: orgB }),
      deps(owner(orgA)),
    );
    expect(res.status).toBe(422); // champ inconnu refusé (strict)
  });

  it("refuse : origine étrangère, sans session, membre simple", async () => {
    expect(
      (
        await handleCreateKey(
          req("POST", { name: "x" }, "https://evil.example"),
          deps(owner(orgA)),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handleCreateKey(req("POST", { name: "x" }), deps(null))).status,
    ).toBe(401);
    expect(
      (
        await handleCreateKey(
          req("POST", { name: "x" }),
          deps({ ...owner(orgA), role: "member" }),
        )
      ).status,
    ).toBe(403);
  });

  it("valide le nom et le plafond", async () => {
    expect(
      (await handleCreateKey(req("POST", { name: "" }), deps(owner(orgA))))
        .status,
    ).toBe(422);
    expect(
      (
        await handleCreateKey(
          req("POST", { name: "x", spendCapCad: "abc" }),
          deps(owner(orgA)),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await handleCreateKey(
          req("POST", { name: "x", spendCapCad: "0" }),
          deps(owner(orgA)),
        )
      ).status,
    ).toBe(422);
  });
});

describe("plafond de clés actives", () => {
  it("refuse en 409 key_limit au-delà de 25 clés actives par organisation", async () => {
    const org = await newOrganization(t.db);
    for (let i = 0; i < MAX_ACTIVE_KEYS_PER_ORGANIZATION; i++)
      await createApiKey(t.db, { organizationId: org, name: `k${i}` });
    const res = await handleCreateKey(
      req("POST", { name: "de trop" }),
      deps(owner(org)),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "key_limit" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    // L'autre organisation n'est pas touchée.
    const other = await handleCreateKey(
      req("POST", { name: "ok" }),
      deps(owner(orgB)),
    );
    expect(other.status).toBe(201);
  });
});

describe("révocation", () => {
  it("révoque une clé de l'organisation, et seulement la sienne", async () => {
    const created = await (
      await handleCreateKey(
        req("POST", { name: "à révoquer" }),
        deps(owner(orgA)),
      )
    ).json();
    const other = await handleRevokeKey(
      req("DELETE"),
      created.id,
      deps(owner(orgB)),
    );
    expect(other.status).toBe(404);
    expect((await authenticateApiKey(t.db, `Bearer ${created.key}`)).ok).toBe(
      true,
    );
    const done = await handleRevokeKey(
      req("DELETE"),
      created.id,
      deps(owner(orgA)),
    );
    expect(done.status).toBe(200);
    expect(await authenticateApiKey(t.db, `Bearer ${created.key}`)).toEqual({
      ok: false,
      code: "api_key_revoked",
    });
    expect(
      (await handleRevokeKey(req("DELETE"), "pas-un-uuid", deps(owner(orgA))))
        .status,
    ).toBe(404);
  });

  it("une seconde révocation renvoie la date de la première, pas une date inventée", async () => {
    const created = await (
      await handleCreateKey(
        req("POST", { name: "deux fois" }),
        deps(owner(orgA)),
      )
    ).json();
    const first = await (
      await handleRevokeKey(req("DELETE"), created.id, deps(owner(orgA)))
    ).json();
    await new Promise((r) => setTimeout(r, 15));
    const secondRes = await handleRevokeKey(
      req("DELETE"),
      created.id,
      deps(owner(orgA)),
    );
    expect(secondRes.status).toBe(200);
    expect((await secondRes.json()).revokedAt).toBe(first.revokedAt);
  });
});
