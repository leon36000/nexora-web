import { randomBytes } from "node:crypto";
import { eq, paymentAudit, paymentSettings, vaultSecrets } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { HANDLED_EVENT_TYPES } from "../billing/webhook";
import { loadKeyring } from "../vault/crypto";
import {
  type ConnectDeps,
  connectStripe,
  readStripeStatus,
  WEBHOOK_EVENTS,
} from "./connect";
import { getSettings, updateSettings } from "./settings";
import { dbVault } from "./vault";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const log = { debug() {}, info() {}, warn() {}, error: vi.fn() } as never;

interface FakeOptions {
  existing?: Array<Record<string, unknown>>;
  taxStatus?: "active" | "pending" | "denied";
  country?: string;
  failAccount?: boolean;
}

function fakeStripe(opts: FakeOptions = {}) {
  const endpoints = [...(opts.existing ?? [])];
  const calls: string[] = [];
  const api = {
    accounts: {
      retrieve: vi.fn(async () => {
        calls.push("accounts.retrieve");
        if (opts.failAccount)
          throw Object.assign(
            new Error("Invalid API Key provided: sk_test_***"),
            {
              type: "StripeAuthenticationError",
            },
          );
        return {
          id: "acct_123",
          country: opts.country ?? "CA",
          business_profile: { name: "Nexora AI inc." },
          settings: { dashboard: { display_name: "Nexora" } },
        };
      }),
    },
    tax: {
      settings: {
        retrieve: vi.fn(async () => {
          calls.push("tax.settings.retrieve");
          if (opts.taxStatus === "denied")
            throw Object.assign(new Error("permission"), {
              type: "StripePermissionError",
            });
          return { status: opts.taxStatus ?? "active" };
        }),
      },
    },
    webhookEndpoints: {
      list: vi.fn(() => ({
        autoPagingToArray: async () => endpoints.map((e) => ({ ...e })),
      })),
      create: vi.fn(async (params: Record<string, unknown>) => {
        calls.push("webhookEndpoints.create");
        const created = {
          id: `we_${endpoints.length + 1}`,
          secret: `whsec_secret_${endpoints.length + 1}`,
          ...params,
        };
        endpoints.push(created);
        return created;
      }),
      update: vi.fn(async (id: string, params: Record<string, unknown>) => {
        calls.push("webhookEndpoints.update");
        const found = endpoints.find((e) => e.id === id);
        Object.assign(found as object, params);
        return found;
      }),
      del: vi.fn(async (id: string) => {
        calls.push("webhookEndpoints.del");
        const i = endpoints.findIndex((e) => e.id === id);
        endpoints.splice(i, 1);
        return { id, deleted: true };
      }),
    },
  };
  return { api, endpoints, calls };
}

function deps(
  fake: ReturnType<typeof fakeStripe>,
  over: Partial<ConnectDeps> = {},
): ConnectDeps {
  return {
    db: t.db,
    vault: dbVault(t.db, keyring),
    siteUrl: "https://nexora.example",
    createClient: () => fake.api as never,
    allowLocalUrl: false,
    log,
    now: () => new Date("2026-10-27T12:00:00Z"),
    ...over,
  };
}

beforeEach(async () => {
  await t.db.delete(paymentSettings);
  await t.db.delete(vaultSecrets);
});

const putKey = (value: string) =>
  dbVault(t.db, keyring).put("stripe.secret_key", value, "payment");

describe("événements du webhook", () => {
  it("sont exactement les 12 événements gérés par le serveur", () => {
    expect([...WEBHOOK_EVENTS].sort()).toEqual([...HANDLED_EVENT_TYPES].sort());
    expect(WEBHOOK_EVENTS).toHaveLength(12);
  });
});

describe("brancher Stripe en un geste", () => {
  it("sans clé au Coffre : erreur claire avec l'action à faire, rien n'est appelé", async () => {
    const fake = fakeStripe();
    const out = await connectStripe(deps(fake));
    expect(out).toMatchObject({ ok: false, code: "key_missing" });
    expect(out.ok === false && out.action).toMatch(/Coffre/);
    expect(fake.calls).toEqual([]);
  });

  it("vérifie la clé de test, crée le point de webhook avec les 12 événements et range le secret au Coffre", async () => {
    await putKey("sk_test_abc");
    const fake = fakeStripe();
    const out = await connectStripe(deps(fake));
    expect(out).toMatchObject({
      ok: true,
      mode: "test",
      account: { id: "acct_123", country: "CA", countryOk: true },
      taxActive: true,
      webhook: { created: true, updated: false },
    });
    const created = fake.api.webhookEndpoints.create.mock
      .calls[0]?.[0] as Record<string, unknown>;
    expect(created.url).toBe("https://nexora.example/api/stripe/webhook");
    expect([...(created.enabled_events as string[])].sort()).toEqual(
      [...HANDLED_EVENT_TYPES].sort(),
    );
    // le secret whsec_ est au Coffre, jamais dans la réponse ni dans les réglages
    expect(await dbVault(t.db, keyring).get("stripe.webhook_secret")).toBe(
      "whsec_secret_1",
    );
    expect(JSON.stringify(out)).not.toContain("whsec_secret_1");
    const settings = await getSettings(t.db);
    expect(JSON.stringify(settings)).not.toContain("whsec_");
    expect(settings).toMatchObject({
      stripeMode: "test",
      stripeAccountId: "acct_123",
      stripeAccountCountry: "CA",
      stripeTaxActive: true,
      webhookEndpointId: "we_1",
      webhookStatus: "connected",
      stripeLastError: null,
    });
    const audit = await t.db.select().from(paymentAudit);
    expect(audit.some((a) => a.action === "stripe.connect")).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("whsec_");
    expect(JSON.stringify(audit)).not.toContain("sk_test");
  });

  it("est idempotent : un second clic met le point à jour sans en créer un autre et garde le secret", async () => {
    await putKey("sk_test_abc");
    const fake = fakeStripe();
    await connectStripe(deps(fake));
    const again = await connectStripe(deps(fake));
    expect(again).toMatchObject({
      ok: true,
      webhook: { created: false, updated: true },
    });
    expect(fake.endpoints).toHaveLength(1);
    expect(await dbVault(t.db, keyring).get("stripe.webhook_secret")).toBe(
      "whsec_secret_1",
    );
  });

  it("corrige les événements d'un point que nous possédons déjà", async () => {
    await putKey("sk_test_abc");
    const fake = fakeStripe();
    await connectStripe(deps(fake));
    (fake.endpoints[0] as Record<string, unknown>).enabled_events = [
      "invoice.paid",
    ];
    await connectStripe(deps(fake));
    expect(
      [
        ...((fake.endpoints[0] as Record<string, unknown>)
          .enabled_events as string[]),
      ].sort(),
    ).toEqual([...HANDLED_EVENT_TYPES].sort());
  });

  it("un point existant à la même adresse dont nous n'avons pas le secret est remplacé (le secret d'un point n'est lisible qu'à sa création)", async () => {
    await putKey("sk_test_abc");
    const fake = fakeStripe({
      existing: [
        {
          id: "we_old",
          url: "https://nexora.example/api/stripe/webhook",
          enabled_events: ["*"],
          status: "enabled",
        },
        {
          id: "we_other",
          url: "https://autre.example/hook",
          enabled_events: ["*"],
          status: "enabled",
        },
      ],
    });
    const out = await connectStripe(deps(fake));
    expect(out).toMatchObject({
      ok: true,
      webhook: { created: true, replaced: true },
    });
    expect(fake.api.webhookEndpoints.del).toHaveBeenCalledWith("we_old");
    // l'autre point (autre adresse) n'est jamais touché
    expect(fake.endpoints.map((e) => e.id)).toContain("we_other");
    expect(await dbVault(t.db, keyring).get("stripe.webhook_secret")).toMatch(
      /^whsec_secret_/,
    );
  });

  it("clé invalide : état « erreur » avec le type d'erreur, sans citer la clé", async () => {
    await putKey("sk_test_abc");
    const out = await connectStripe(deps(fakeStripe({ failAccount: true })));
    expect(out).toMatchObject({ ok: false, code: "key_rejected" });
    expect(JSON.stringify(out)).not.toContain("sk_test");
    const settings = await getSettings(t.db);
    expect(settings.webhookStatus).toBe("error");
    expect(settings.stripeLastError).toMatch(/clé/i);
  });

  it("valeur du Coffre qui n'est pas une clé Stripe : refus clair", async () => {
    await putKey("pas-une-cle");
    const out = await connectStripe(deps(fakeStripe()));
    expect(out).toMatchObject({ ok: false, code: "key_invalid" });
  });

  it("clé de production refusée tant que le fondateur n'a pas autorisé les paiements réels", async () => {
    await putKey("sk_live_abc");
    const fake = fakeStripe();
    const out = await connectStripe(deps(fake));
    expect(out).toMatchObject({ ok: false, code: "live_not_allowed" });
    expect(fake.calls).toEqual([]);
    await updateSettings(t.db, { liveModeAllowed: true }, "admin");
    const ok = await connectStripe(deps(fake));
    expect(ok).toMatchObject({ ok: true, mode: "live" });
  });

  it("signale un pays autre que le Canada et Stripe Tax inactif sans bloquer le branchement", async () => {
    await putKey("sk_test_abc");
    const out = await connectStripe(
      deps(fakeStripe({ country: "US", taxStatus: "pending" })),
    );
    expect(out).toMatchObject({
      ok: true,
      account: { country: "US", countryOk: false },
      taxActive: false,
    });
    expect(out.ok && out.warnings.join(" ")).toMatch(/pays/i);
    expect(out.ok && out.warnings.join(" ")).toMatch(/Stripe Tax/);
  });

  it("clé restreinte sans droit sur Stripe Tax : « inconnu » plutôt qu'« inactif »", async () => {
    await putKey("rk_test_abc");
    const out = await connectStripe(deps(fakeStripe({ taxStatus: "denied" })));
    expect(out).toMatchObject({ ok: true, taxActive: null });
  });

  it("refuse une adresse de site locale (Stripe ne peut pas l'atteindre) et le dit", async () => {
    await putKey("sk_test_abc");
    const fake = fakeStripe();
    const out = await connectStripe(
      deps(fake, { siteUrl: "http://localhost:3500" }),
    );
    expect(out).toMatchObject({ ok: false, code: "site_url_not_public" });
    expect(fake.api.webhookEndpoints.create).not.toHaveBeenCalled();
    const local = await connectStripe(
      deps(fake, { siteUrl: "http://localhost:3500", allowLocalUrl: true }),
    );
    expect(local.ok).toBe(true);
  });
});

describe("changement de compte ou de mode Stripe", () => {
  it("passer à un autre compte (ou du test à la production) oublie les objets Stripe de l'ancien et le dit", async () => {
    await putKey("sk_test_abc");
    await connectStripe(deps(fakeStripe()));
    await t.db.update(paymentSettings).set({
      creditsProductFrId: "prod_old_fr",
      creditsProductEnId: "prod_old_en",
    });
    const { promoCodes } = await import("@nexora/db");
    await t.db.insert(promoCodes).values({
      code: "ANCIEN-1",
      kind: "percent",
      percentOff: 10,
      scopes: ["vps"],
      stripeCouponId: "co_old",
      stripePromotionCodeId: "promo_old",
      stripeFingerprint: "fp",
      stripeSyncedAt: new Date(),
    });
    // même compte : rien n'est oublié
    const same = await connectStripe(deps(fakeStripe()));
    expect(same).toMatchObject({ ok: true, accountChanged: false });
    expect((await getSettings(t.db)).creditsProductFrId).toBe("prod_old_fr");
    // autre compte
    const other = fakeStripe();
    other.api.accounts.retrieve = vi.fn(async () => ({
      id: "acct_999",
      country: "CA",
      business_profile: { name: "Autre" },
      settings: {},
    })) as never;
    const out = await connectStripe(deps(other));
    expect(out).toMatchObject({ ok: true, accountChanged: true });
    expect(out.ok && out.warnings.join(" ")).toMatch(/Publier vers Stripe/);
    const s = await getSettings(t.db);
    expect([s.creditsProductFrId, s.creditsProductEnId]).toEqual([null, null]);
    const [row] = await t.db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.code, "ANCIEN-1"));
    expect(row).toMatchObject({
      stripeCouponId: null,
      stripePromotionCodeId: null,
      stripeFingerprint: null,
    });
  });
});

describe("état affiché dans l'admin", () => {
  it("sans clé : « manquant » avec l'action", async () => {
    const s = await readStripeStatus({
      db: t.db,
      vault: dbVault(t.db, keyring),
      siteUrl: "https://nexora.example",
    });
    expect(s).toMatchObject({
      state: "no_key",
      keyPresent: false,
      webhookSecretPresent: false,
    });
    expect(s.action).toMatch(/Coffre/);
  });

  it("clé collée mais pas encore vérifiée", async () => {
    await putKey("sk_test_abc");
    const s = await readStripeStatus({
      db: t.db,
      vault: dbVault(t.db, keyring),
      siteUrl: "https://nexora.example",
    });
    expect(s).toMatchObject({
      state: "key_unverified",
      keyPresent: true,
      keyLast4: "****",
    });
    expect(s.action).toMatch(/Vérifier et brancher/);
  });

  it("branché, puis « erreur » si le secret du webhook disparaît du Coffre", async () => {
    await putKey("sk_test_abc");
    await connectStripe(deps(fakeStripe()));
    const ok = await readStripeStatus({
      db: t.db,
      vault: dbVault(t.db, keyring),
      siteUrl: "https://nexora.example",
    });
    expect(ok).toMatchObject({
      state: "connected",
      mode: "test",
      webhookSecretPresent: true,
    });
    await t.db
      .delete(vaultSecrets)
      .where(eq(vaultSecrets.ref, "stripe.webhook_secret"));
    const broken = await readStripeStatus({
      db: t.db,
      vault: dbVault(t.db, keyring),
      siteUrl: "https://nexora.example",
    });
    expect(broken.state).toBe("error");
    expect(broken.action).toMatch(/Vérifier et brancher/);
  });

  it("l'adresse du site change : le point doit être recréé (état « erreur » avec l'action)", async () => {
    await putKey("sk_test_abc");
    await connectStripe(deps(fakeStripe()));
    const s = await readStripeStatus({
      db: t.db,
      vault: dbVault(t.db, keyring),
      siteUrl: "https://autre.example",
    });
    expect(s.state).toBe("error");
  });
});
