import { describe, expect, it, vi } from "vitest";
import {
  assertTestModeKey,
  createStripeClient,
  resolveStripeConfig,
  resolveWebhookSecret,
  StripeModeError,
} from "./client";

describe("mode test seulement", () => {
  it("accepte les clés de test", () => {
    expect(() => assertTestModeKey("sk_test_abc")).not.toThrow();
    expect(() => assertTestModeKey("rk_test_abc")).not.toThrow();
  });
  it("refuse toute clé de production (aucun paiement réel)", () => {
    expect(() => assertTestModeKey("sk_live_abc")).toThrow(StripeModeError);
    expect(() => assertTestModeKey("rk_live_abc")).toThrow(StripeModeError);
  });
  it("refuse une valeur qui n'est pas une clé Stripe, sans la citer", () => {
    try {
      assertTestModeKey("mot-de-passe-secret");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(StripeModeError);
      expect((e as Error).message).not.toContain("mot-de-passe-secret");
    }
  });
});

describe("createStripeClient", () => {
  it("refuse de créer un client avec une clé de production", () => {
    expect(() => createStripeClient({ secretKey: "sk_live_x" })).toThrow(
      StripeModeError,
    );
  });
  it("accepte un simulateur sur la boucle locale seulement", () => {
    expect(() =>
      createStripeClient({
        secretKey: "sk_test_x",
        mockUrl: "http://127.0.0.1:12111",
      }),
    ).not.toThrow();
    expect(() =>
      createStripeClient({
        secretKey: "sk_test_x",
        mockUrl: "http://example.com:12111",
      }),
    ).toThrow(StripeModeError);
  });
});

describe("résolution des secrets", () => {
  const vault = (map: Record<string, string>) =>
    vi.fn(async (ref: string) => {
      const v = map[ref];
      if (!v) throw new Error("not_found");
      return v;
    });

  it("en développement, la variable d'environnement a priorité sur le coffre", async () => {
    const getSecret = vault({ "stripe.secret_key": "sk_test_vault" });
    const env = {
      NODE_ENV: "development",
      STRIPE_SECRET_KEY: "sk_test_env",
      STRIPE_WEBHOOK_SECRET: "whsec_env",
      STRIPE_API_BASE_URL: "http://127.0.0.1:12111",
    };
    expect(await resolveStripeConfig({ env, getSecret })).toEqual({
      secretKey: "sk_test_env",
      mockUrl: "http://127.0.0.1:12111",
    });
    expect(await resolveWebhookSecret({ env, getSecret })).toBe("whsec_env");
    expect(getSecret).not.toHaveBeenCalled();
  });

  it("sans variable, lit le coffre (stripe.secret_key, stripe.webhook_secret)", async () => {
    const deps = {
      env: { NODE_ENV: "development" },
      getSecret: vault({
        "stripe.secret_key": "sk_test_vault",
        "stripe.webhook_secret": "whsec_vault",
      }),
    };
    const cfg = await resolveStripeConfig(deps);
    expect(cfg.secretKey).toBe("sk_test_vault");
    expect(cfg.mockUrl).toBeUndefined();
    expect(await resolveWebhookSecret(deps)).toBe("whsec_vault");
  });

  it("en production, ignore les variables d'environnement et le simulateur", async () => {
    const cfg = await resolveStripeConfig({
      env: {
        NODE_ENV: "production",
        STRIPE_SECRET_KEY: "sk_test_env",
        STRIPE_API_BASE_URL: "http://127.0.0.1:12111",
      },
      getSecret: vault({ "stripe.secret_key": "sk_test_vault" }),
    });
    expect(cfg).toEqual({ secretKey: "sk_test_vault", mockUrl: undefined });
  });

  it("clé absente du coffre : erreur explicite, sans valeur", async () => {
    await expect(
      resolveStripeConfig({
        env: { NODE_ENV: "production" },
        getSecret: vault({}),
      }),
    ).rejects.toThrow(/stripe\.secret_key/);
  });

  it("la clé du coffre est aussi vérifiée en mode test", async () => {
    await expect(
      resolveStripeConfig({
        env: { NODE_ENV: "production" },
        getSecret: vault({ "stripe.secret_key": "sk_live_oups" }),
      }),
    ).rejects.toBeInstanceOf(StripeModeError);
  });
});
