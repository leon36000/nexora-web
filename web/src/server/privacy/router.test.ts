import { type Database, eq, privacyEvents, privacyPolicies } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newOrganization } from "../gateway/test-support";
import { createPrivacyJournal } from "./events";
import { createPrivacyRouter } from "./router";
import { savePolicy } from "./store";
import { type OutboundIntent, PrivacyRouterUnavailableError } from "./types";

let t: TestDatabase;
let lines: string[];
let clock = new Date("2026-10-29T12:00:00Z");

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const EMAIL = "jean.tremblay@exemple.qc.ca";

function setup(overrides: { db?: () => Database; ttlMs?: number } = {}) {
  lines = [];
  const log = createLogger({ name: "test", sink: (l) => lines.push(l) });
  const db = overrides.db ?? (() => t.db);
  const journal = createPrivacyJournal({ db: () => t.db, log });
  const router = createPrivacyRouter({
    db,
    journal,
    log,
    now: () => clock,
    cacheTtlMs: overrides.ttlMs ?? 5000,
  });
  return { router, journal, log };
}

const chat = (
  organizationId: string,
  patch: Partial<OutboundIntent> = {},
): OutboundIntent => ({
  organizationId,
  apiKeyId: null,
  product: "gateway",
  operation: "chat",
  destination: { model: "mistral-small" },
  kinds: ["prompt"],
  content: `Écris à ${EMAIL} svp`,
  ...patch,
});

const events = (organizationId: string) =>
  t.db
    .select()
    .from(privacyEvents)
    .where(eq(privacyEvents.organizationId, organizationId));

describe("politique par défaut (organisation sans politique)", () => {
  it("masque les renseignements évidents et journalise sans contenu", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup();
    const decision = await router.evaluate(chat(org));
    expect(decision).toEqual({
      decision: "mask",
      policyVersion: "0",
      content: "Écris à [COURRIEL] svp",
      ruleIds: ["mask.email"],
    });
    const rows = await events(org);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      decision: "mask",
      product: "gateway",
      operation: "chat",
      destination: "mistral-small",
      destinationKind: "model",
      dataKinds: ["prompt"],
      detected: ["email"],
      maskedCount: 1,
      ruleIds: ["mask.email"],
      policyVersion: 0,
    });
    expect(JSON.stringify(rows)).not.toContain("tremblay");
    expect(lines.join("\n")).not.toContain("tremblay");
  });

  it("autorise ce qui ne contient rien d'évident, et le journalise aussi", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup();
    const decision = await router.evaluate(
      chat(org, { content: "Bonjour, résume ce texte." }),
    );
    expect(decision).toEqual({ decision: "allow", policyVersion: "0" });
    expect((await events(org))[0]?.decision).toBe("allow");
  });

  it("autorise sans contenu à inspecter (aucun masquage possible)", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup();
    const decision = await router.evaluate(chat(org, { content: undefined }));
    expect(decision.decision).toBe("allow");
  });

  it("ne garde que l'hôte d'une destination, jamais le chemin", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup();
    await router.evaluate(
      chat(org, {
        product: "webpilot",
        operation: "scrape",
        destination: { host: "Exemple.CA", path: "/dossier/jean?x=1" },
        kinds: ["url"],
        content: undefined,
      }),
    );
    const [row] = await events(org);
    expect(row).toMatchObject({
      destination: "exemple.ca",
      destinationKind: "host",
    });
    expect(JSON.stringify(row)).not.toContain("dossier");
  });
});

describe("niveaux et règles", () => {
  it("refuse un hôte interdit, même en standard", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "standard",
      config: { blockedHosts: ["*.pirate.example"] },
      createdBy: null,
    });
    const { router } = setup();
    const decision = await router.evaluate(
      chat(org, {
        destination: { host: "x.pirate.example" },
        kinds: ["url"],
        content: undefined,
      }),
    );
    expect(decision).toMatchObject({
      decision: "deny",
      ruleId: "host.blocked",
      reason: "host_blocked",
      policyVersion: "1",
    });
    expect((await events(org))[0]).toMatchObject({
      decision: "deny",
      denyReason: "host_blocked",
      ruleIds: ["host.blocked"],
    });
  });

  it("renforcé : modèles permis, liste blanche d'hôtes et pièces jointes", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "renforce",
      config: { allowedModels: ["mistral-*"], allowedHosts: ["ok.exemple.ca"] },
      createdBy: null,
    });
    const { router } = setup();
    expect(
      await router.evaluate(
        chat(org, { destination: { model: "gpt-x" }, content: "salut" }),
      ),
    ).toMatchObject({ decision: "deny", reason: "model_not_allowed" });
    expect(
      await router.evaluate(chat(org, { content: "salut" })),
    ).toMatchObject({ decision: "allow" });
    expect(
      await router.evaluate(
        chat(org, {
          destination: { host: "autre.exemple.ca" },
          kinds: ["url"],
          content: undefined,
        }),
      ),
    ).toMatchObject({ decision: "deny", reason: "host_not_allowed" });
    expect(
      await router.evaluate(
        chat(org, { kinds: ["prompt", "attachment"], content: "salut" }),
      ),
    ).toMatchObject({
      decision: "deny",
      reason: "attachment_blocked",
      ruleId: "attachment.blocked",
    });
  });

  it("renforcé sans liste : seuls les pièces jointes et le masquage s'appliquent", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "renforce",
      config: {},
      createdBy: null,
    });
    const { router } = setup();
    expect(
      await router.evaluate(chat(org, { destination: { model: "autre" } })),
    ).toMatchObject({ decision: "mask" });
  });

  it("souverain : rien ne sort tant que rien n'est permis (échec fermé)", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: {},
      createdBy: null,
    });
    const { router } = setup();
    expect(await router.evaluate(chat(org))).toMatchObject({
      decision: "deny",
      reason: "strict_sovereignty",
      ruleId: "sovereign.closed",
    });
    expect(
      await router.evaluate(
        chat(org, {
          destination: { host: "exemple.ca" },
          kinds: ["url"],
          content: undefined,
        }),
      ),
    ).toMatchObject({ decision: "deny", reason: "strict_sovereignty" });
  });

  it("souverain : seuls les modèles et hôtes nommés sont servis, et le masquage reste actif", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: {
        allowedModels: ["mistral-small"],
        allowedHosts: ["ca.exemple.ca"],
      },
      createdBy: null,
    });
    const { router } = setup();
    expect(await router.evaluate(chat(org))).toMatchObject({
      decision: "mask",
      content: "Écris à [COURRIEL] svp",
    });
    expect(
      await router.evaluate(chat(org, { destination: { model: "autre" } })),
    ).toMatchObject({ decision: "deny", reason: "model_not_allowed" });
    expect(
      await router.evaluate(
        chat(org, {
          destination: { host: "evil.example" },
          kinds: ["url"],
          content: undefined,
        }),
      ),
    ).toMatchObject({ decision: "deny", reason: "host_not_allowed" });
  });

  it("refuse la requête quand un genre à refuser est détecté", async () => {
    const org = await newOrganization(t.db);
    await savePolicy(t.db, {
      organizationId: org,
      level: "standard",
      config: { denyCategories: ["credit_card"] },
      createdBy: null,
    });
    const { router } = setup();
    const decision = await router.evaluate(
      chat(org, { content: "Ma carte : 4111 1111 1111 1111" }),
    );
    expect(decision).toMatchObject({
      decision: "deny",
      reason: "sensitive_data",
      ruleId: "deny.credit_card",
    });
    expect(JSON.stringify(await events(org))).not.toContain("4111");
  });

  it("une politique enregistrée mais invalide refuse tout (jamais « tout permis »)", async () => {
    const org = await newOrganization(t.db);
    await t.db.insert(privacyPolicies).values({
      organizationId: org,
      version: 1,
      level: "standard",
      config: { maskCategories: ["inconnu"] },
    });
    const { router } = setup();
    expect(await router.evaluate(chat(org))).toMatchObject({
      decision: "deny",
      reason: "policy_invalid",
      ruleId: "policy.invalid",
      policyVersion: "1",
    });
  });
});

describe("échec fermé", () => {
  it("base illisible : PrivacyRouterUnavailableError, jamais allow", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup({
      db: () => {
        throw new Error(`connexion refusée ${EMAIL}`);
      },
    });
    await expect(router.evaluate(chat(org))).rejects.toBeInstanceOf(
      PrivacyRouterUnavailableError,
    );
    expect(lines.join("\n")).not.toContain("tremblay");
  });

  it("organisation absente : indisponible", async () => {
    const { router } = setup();
    await expect(router.evaluate(chat(""))).rejects.toBeInstanceOf(
      PrivacyRouterUnavailableError,
    );
  });

  it("le journal en panne ne bloque pas la requête mais compte l'erreur, sans contenu", async () => {
    const org = await newOrganization(t.db);
    lines = [];
    const log = createLogger({ name: "test", sink: (l) => lines.push(l) });
    const failing = {
      insert: () => {
        throw new Error(`panne ${EMAIL}`);
      },
    } as unknown as Database;
    const journal = createPrivacyJournal({ db: () => failing, log });
    const router = createPrivacyRouter({
      db: () => t.db,
      journal,
      log,
      now: () => clock,
      cacheTtlMs: 0,
    });
    const decision = await router.evaluate(chat(org));
    expect(decision.decision).toBe("mask");
    expect(journal.failures()).toBe(1);
    expect(lines.join("\n")).toContain("journal");
    expect(lines.join("\n")).not.toContain("tremblay");
  });
});

describe("cache de politique", () => {
  it("relit la politique après le délai, pas avant", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup({ ttlMs: 5000 });
    clock = new Date("2026-10-29T12:00:00Z");
    expect((await router.evaluate(chat(org))).policyVersion).toBe("0");
    await savePolicy(t.db, {
      organizationId: org,
      level: "renforce",
      config: {},
      createdBy: null,
    });
    clock = new Date("2026-10-29T12:00:03Z");
    expect((await router.evaluate(chat(org))).policyVersion).toBe("0");
    clock = new Date("2026-10-29T12:00:06Z");
    expect((await router.evaluate(chat(org))).policyVersion).toBe("1");
  });

  it("invalidate() applique tout de suite une nouvelle politique", async () => {
    const org = await newOrganization(t.db);
    const { router } = setup({ ttlMs: 60_000 });
    await router.evaluate(chat(org));
    await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: {},
      createdBy: null,
    });
    router.invalidate(org);
    expect(await router.evaluate(chat(org))).toMatchObject({
      decision: "deny",
      policyVersion: "1",
    });
  });
});
