import { privacyEvents, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  AccountContext,
  AccountKeysDeps,
} from "../gateway/account-handlers";
import { newOrganization } from "../gateway/test-support";
import {
  handlePrivacyGet,
  handlePrivacyPut,
  handlePrivacyReport,
  type PrivacyAccountDeps,
} from "./account-handlers";
import { loadCurrentPolicy } from "./store";

let t: TestDatabase;
let orgA: string;
let orgB: string;
let invalidated: string[] = [];
const SITE = "http://localhost:3500";
const NOW = new Date("2026-10-29T12:00:00Z");

beforeAll(async () => {
  t = await createTestDatabase();
  orgA = await newOrganization(t.db);
  orgB = await newOrganization(t.db);
});
afterAll(async () => {
  await t.drop();
});

const deps = (ctx: AccountContext | null): PrivacyAccountDeps => ({
  db: () => t.db,
  siteUrl: SITE,
  getContext: async () => ctx,
  log: createLogger({ name: "test", sink: () => {} }),
  now: () => NOW,
  onPolicyChanged: (org) => invalidated.push(org),
});
const asOwner = (org: string): AccountContext => ({
  userId: `u-${org}`,
  organizationId: org,
  role: "owner",
});
/** L'auteur d'une version de politique est un vrai utilisateur (clé étrangère). */
async function ownerOf(org: string): Promise<AccountContext> {
  await t.db
    .insert(users)
    .values({ id: `u-${org}`, name: "Admin", email: `${org}@exemple.ca` })
    .onConflictDoNothing();
  return asOwner(org);
}
const asMember = (org: string): AccountContext => ({
  userId: `m-${org}`,
  organizationId: org,
  role: "member",
});
const req = (
  method: string,
  body?: unknown,
  origin: string | null = SITE,
  path = "/api/account/privacy",
) =>
  new Request(`${SITE}${path}`, {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("GET /api/account/privacy", () => {
  it("sans politique enregistrée : la politique par défaut « standard », version 0", async () => {
    const res = await handlePrivacyGet(req("GET"), deps(asOwner(orgA)));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = await res.json();
    expect(json).toMatchObject({
      level: "standard",
      version: 0,
      isDefault: true,
      config: {
        denyCategories: [],
        allowedHosts: [],
        blockedHosts: [],
        allowedModels: [],
        blockAttachments: false,
      },
      recent: { days: 30, counts: { allow: 0, mask: 0, deny: 0 } },
      versions: [],
    });
    expect([...json.config.maskCategories].sort()).toEqual(
      ["credit_card", "email", "iban", "phone", "secret", "sin"].sort(),
    );
  });

  it("compte les décisions des 30 derniers jours de l'organisation seulement", async () => {
    await t.db.insert(privacyEvents).values([
      {
        organizationId: orgB,
        product: "gateway",
        operation: "chat",
        decision: "mask",
        createdAt: new Date("2026-10-20T00:00:00Z"),
      },
      {
        organizationId: orgB,
        product: "gateway",
        operation: "chat",
        decision: "deny",
        createdAt: new Date("2026-10-21T00:00:00Z"),
      },
      {
        organizationId: orgB,
        product: "gateway",
        operation: "chat",
        decision: "allow",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
      {
        organizationId: orgA,
        product: "gateway",
        operation: "chat",
        decision: "allow",
        createdAt: new Date("2026-10-22T00:00:00Z"),
      },
    ]);
    const res = await handlePrivacyGet(req("GET"), deps(asOwner(orgB)));
    expect((await res.json()).recent.counts).toEqual({
      allow: 0,
      mask: 1,
      deny: 1,
    });
  });

  it("refuse : sans session (401), origine étrangère (403), membre simple (403)", async () => {
    expect((await handlePrivacyGet(req("GET"), deps(null))).status).toBe(401);
    expect(
      (
        await handlePrivacyGet(
          req("GET", undefined, "https://evil.example"),
          deps(asOwner(orgA)),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handlePrivacyGet(req("GET"), deps(asMember(orgA)))).status,
    ).toBe(403);
  });
});

describe("PUT /api/account/privacy", () => {
  it("enregistre une nouvelle version, invalide le cache et la relit", async () => {
    invalidated = [];
    const res = await handlePrivacyPut(
      req("PUT", {
        level: "renforce",
        config: {
          allowedModels: ["mistral-*"],
          blockedHosts: ["Pirate.Example"],
          denyCategories: ["credit_card"],
        },
      }),
      deps(await ownerOf(orgA)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      version: 1,
      changed: true,
      level: "renforce",
      config: {
        allowedModels: ["mistral-*"],
        blockedHosts: ["pirate.example"],
        denyCategories: ["credit_card"],
        blockAttachments: true,
      },
    });
    expect(invalidated).toEqual([orgA]);
    expect(await loadCurrentPolicy(t.db, orgA)).toMatchObject({
      version: 1,
      level: "renforce",
    });
    const read = await (
      await handlePrivacyGet(req("GET"), deps(asOwner(orgA)))
    ).json();
    expect(read).toMatchObject({
      level: "renforce",
      version: 1,
      isDefault: false,
    });
    expect(read.versions).toHaveLength(1);
  });

  it("un enregistrement identique ne crée pas de version ni d'invalidation inutile", async () => {
    const org = await newOrganization(t.db);
    const body = { level: "standard", config: { blockedHosts: ["x.example"] } };
    const admin = await ownerOf(org);
    await handlePrivacyPut(req("PUT", body), deps(admin));
    invalidated = [];
    const again = await handlePrivacyPut(req("PUT", body), deps(admin));
    expect(await again.json()).toMatchObject({ version: 1, changed: false });
    expect(invalidated).toEqual([]);
  });

  it("l'organisation vient de la session ; un champ inconnu, un niveau ou un hôte invalide donne 422", async () => {
    for (const body of [
      { level: "renforce", organizationId: orgB },
      { level: "laxiste" },
      { level: "standard", config: { allowedHosts: ["https://x.ca/a"] } },
      { level: "standard", config: { autre: 1 } },
      { config: {} },
      "texte",
    ]) {
      const res = await handlePrivacyPut(req("PUT", body), deps(asOwner(orgA)));
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect((await res.json()).error).toBe("invalid_request");
    }
    expect(await loadCurrentPolicy(t.db, orgB)).toBeNull();
  });

  it("JSON illisible : 422 invalid_json", async () => {
    const bad = new Request(`${SITE}/api/account/privacy`, {
      method: "PUT",
      headers: { origin: SITE, "content-type": "application/json" },
      body: "{pas du json",
    });
    const res = await handlePrivacyPut(bad, deps(asOwner(orgA)));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("refuse : sans session, origine étrangère ou absente, membre simple", async () => {
    const body = { level: "souverain", config: {} };
    expect((await handlePrivacyPut(req("PUT", body), deps(null))).status).toBe(
      401,
    );
    for (const origin of ["https://evil.example"]) {
      expect(
        (await handlePrivacyPut(req("PUT", body, origin), deps(asOwner(orgA))))
          .status,
      ).toBe(403);
    }
    expect(
      (await handlePrivacyPut(req("PUT", body, null), deps(asOwner(orgA))))
        .status,
    ).toBe(403);
    expect(
      (await handlePrivacyPut(req("PUT", body), deps(asMember(orgA)))).status,
    ).toBe(403);
    expect(await loadCurrentPolicy(t.db, orgA)).toMatchObject({
      level: "renforce",
    });
  });
});

describe("GET /api/account/privacy/report", () => {
  it("exporte le mois en CSV (BOM, CRLF, colonnes stables), sans contenu", async () => {
    const org = await newOrganization(t.db);
    await t.db.insert(privacyEvents).values([
      {
        organizationId: org,
        product: "gateway",
        operation: "chat",
        decision: "mask",
        ruleIds: ["mask.email"],
        maskedCount: 2,
        destination: "=cmd|calc",
        destinationKind: "model",
        createdAt: new Date("2026-10-05T10:00:00Z"),
      },
      {
        organizationId: org,
        product: "gateway",
        operation: "chat",
        decision: "allow",
        createdAt: new Date("2026-09-05T10:00:00Z"),
      },
    ]);
    const res = await handlePrivacyReport(
      req("GET", undefined, SITE, "/api/account/privacy/report?month=2026-10"),
      deps(asOwner(org)),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      "nexora-confidentialite-2026-10.csv",
    );
    const bytes = new Uint8Array(await res.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await res.text();
    expect(
      text.startsWith(
        "day,product,operation,decision,destination,rules,count,masked_items\r\n",
      ),
    ).toBe(true);
    // Cellule de texte protégée contre l'injection de formules.
    expect(text).toContain(
      "2026-10-05,gateway,chat,mask,'=cmd|calc,mask.email,1,2\r\n",
    );
    expect(text).not.toContain("2026-09");
  });

  it("mois par défaut = mois courant ; mois invalide = 422 ; accès réservé au propriétaire", async () => {
    const ok = await handlePrivacyReport(
      req("GET", undefined, SITE, "/api/account/privacy/report"),
      deps(asOwner(orgA)),
    );
    expect(ok.headers.get("content-disposition")).toContain("2026-10");
    for (const month of ["2026-13", "abc", "2026-1", "1999-01"]) {
      const res = await handlePrivacyReport(
        req(
          "GET",
          undefined,
          SITE,
          `/api/account/privacy/report?month=${month}`,
        ),
        deps(asOwner(orgA)),
      );
      expect(res.status, month).toBe(422);
    }
    expect(
      (
        await handlePrivacyReport(
          req("GET", undefined, SITE, "/api/account/privacy/report"),
          deps(asMember(orgA)),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handlePrivacyReport(
          req("GET", undefined, SITE, "/api/account/privacy/report"),
          deps(null),
        )
      ).status,
    ).toBe(401);
  });
});

// Garde de typage : les dépendances sont celles des clés d'API plus un rappel d'invalidation.
const _check: AccountKeysDeps = deps(null);
void _check;
