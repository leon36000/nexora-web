import { randomBytes } from "node:crypto";
import { eq, seoAdapters } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { loadKeyring } from "@nexora/vault/crypto";
import { putSecret } from "@nexora/vault/store";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adapterReadiness, adapterState, checkAdapter } from "./adapters.ts";

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(seoAdapters);
});

const counting = (status = 200, body: unknown = {}) => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
};

describe("état honnête des adaptateurs", () => {
  it("adapterState : clé + vérification réussie = lecture ; + autorisation humaine = écriture", () => {
    expect(
      adapterState({
        secretPresent: false,
        lastCheckStatus: "ok",
        writeEnabled: true,
      }),
    ).toBe("not_connected");
    expect(
      adapterState({
        secretPresent: true,
        lastCheckStatus: "never",
        writeEnabled: true,
      }),
    ).toBe("not_connected");
    expect(
      adapterState({
        secretPresent: true,
        lastCheckStatus: "error",
        writeEnabled: false,
      }),
    ).toBe("not_connected");
    expect(
      adapterState({
        secretPresent: true,
        lastCheckStatus: "ok",
        writeEnabled: false,
      }),
    ).toBe("read");
    expect(
      adapterState({
        secretPresent: true,
        lastCheckStatus: "ok",
        writeEnabled: true,
      }),
    ).toBe("write");
  });

  it("sans clé du fondateur : AUCUN appel externe, état « non connecté »", async () => {
    for (const key of [
      "bing",
      "searchconsole",
      "dataforseo",
      "postiz",
    ] as const) {
      const { calls, fetchImpl } = counting();
      const r = await checkAdapter(
        {
          db: t.db,
          readSecret: async () => {
            throw new Error("pas de clé");
          },
          fetchImpl,
          env: {},
        },
        key,
      );
      expect(r.status).toBe("skipped");
      expect(calls).toEqual([]);
      expect((await adapterReadiness(t.db, key)).state).toBe("not_connected");
    }
  });

  it("clé présente + lecture réussie : « lecture » ; l'écriture exige l'autorisation humaine", async () => {
    await putSecret(t.db, keyring, {
      ref: "seo.bing.api_key",
      value: "cle-bing-factice-0123456789",
      kind: "other",
    });
    const { calls, fetchImpl } = counting(200, { d: { DailyQuota: 100 } });
    const r = await checkAdapter(
      {
        db: t.db,
        readSecret: async () => "cle-bing-factice-0123456789",
        fetchImpl,
        env: { SITE_URL: "https://nexora.test" },
      },
      "bing",
    );
    expect(r.status).toBe("ok");
    expect(calls[0]).toContain("GetUrlSubmissionQuota");
    expect((await adapterReadiness(t.db, "bing")).state).toBe("read");
    await t.db
      .update(seoAdapters)
      .set({ writeEnabled: true })
      .where(eq(seoAdapters.key, "bing"));
    expect((await adapterReadiness(t.db, "bing")).state).toBe("write");
    // jamais la valeur de la clé dans le détail enregistré
    const [row] = await t.db
      .select()
      .from(seoAdapters)
      .where(eq(seoAdapters.key, "bing"));
    expect(JSON.stringify(row)).not.toContain("cle-bing-factice");
  });

  it("une vérification en échec ramène l'état à « non connecté » avec la raison, sans secret", async () => {
    await putSecret(t.db, keyring, {
      ref: "seo.dataforseo.credentials",
      value: "login:motdepasse-factice",
      kind: "other",
    });
    const { fetchImpl } = counting(401);
    const r = await checkAdapter(
      {
        db: t.db,
        readSecret: async () => "login:motdepasse-factice",
        fetchImpl,
        env: {},
      },
      "dataforseo",
    );
    expect(r.status).toBe("error");
    expect((await adapterReadiness(t.db, "dataforseo")).state).toBe(
      "not_connected",
    );
    const [row] = await t.db
      .select()
      .from(seoAdapters)
      .where(eq(seoAdapters.key, "dataforseo"));
    expect(row?.lastCheckDetail).toMatch(/401/);
    expect(JSON.stringify(row)).not.toContain("motdepasse-factice");
  });

  it("IndexNow : génère la clé et vérifie que le site la sert", async () => {
    let served = "";
    const fetchImpl = (async (url: string | URL | Request) => {
      const key = new URL(String(url)).pathname.replace(/^\/|\.txt$/g, "");
      served = key;
      return new Response(key);
    }) as typeof fetch;
    const r = await checkAdapter(
      {
        db: t.db,
        readSecret: async () => "",
        fetchImpl,
        env: { SEO_AUDIT_BASE_URL: "http://app" },
      },
      "indexnow",
    );
    expect(r.status).toBe("ok");
    expect(served).toMatch(/^[a-f0-9]{32}$/);
    const bad = (async () =>
      new Response("autre chose", { status: 200 })) as typeof fetch;
    expect(
      (
        await checkAdapter(
          {
            db: t.db,
            readSecret: async () => "",
            fetchImpl: bad,
            env: { SEO_AUDIT_BASE_URL: "http://app" },
          },
          "indexnow",
        )
      ).status,
    ).toBe("error");
  });
});
