import { describe, expect, test } from "bun:test";
import { createRelayHandler, isAllowed } from "../admin-relay/relay";
import { PAYMENTS_RELAY, relayToPayments } from "./contract";
import { type PublishPlanDeps, publishPlanFlow } from "./publish-plan";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500/",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};

describe("liste fermée des appels (paiements)", () => {
  test("accepte les routes du module", () => {
    for (const [m, p] of [
      ["GET", ""],
      ["POST", "stripe/connect"],
      ["GET", "settings"],
      ["PATCH", "settings"],
      ["GET", "promos"],
      ["POST", "promos"],
      ["POST", "promos/batch"],
      ["POST", "promos/sync"],
      ["PATCH", `promos/${ID}`],
      ["POST", `promos/${ID}/sync`],
      ["GET", "staff"],
      ["POST", "staff"],
      ["GET", "gifts"],
      ["POST", `gifts/${ID}/revoke`],
      ["GET", "audit"],
    ] as const)
      expect(isAllowed(PAYMENTS_RELAY, m, p)).toBe(true);
  });

  test("refuse le Coffre, la publication d'offre (traitée par l'endpoint), la traversée et les méthodes inattendues", () => {
    for (const [m, p] of [
      ["GET", "../vault"],
      ["POST", "plans/publish"],
      ["DELETE", `promos/${ID}`],
      ["PUT", "settings"],
      ["POST", "settings"],
      ["GET", "promos/pas-un-uuid"],
      ["PATCH", "promos/batch"],
      ["POST", `promos/${ID}/delete`],
      ["POST", `gifts/${ID}`],
      ["GET", `gifts/${ID}/revoke`],
      ["GET", "stripe/connect"],
      ["GET", "stripe/secret"],
    ] as const)
      expect(isAllowed(PAYMENTS_RELAY, m, p)).toBe(false);
  });
});

describe("relais (paiements)", () => {
  test("transmet méthode, chemin, paramètres permis et corps avec le jeton", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return Response.json({ items: [] });
    }) as unknown as typeof fetch;
    const r = await relayToPayments(
      {
        method: "GET",
        path: "/promos/",
        query: { q: "ete", status: "active", intrus: "x" },
      },
      { env, fetchFn },
    );
    expect(r.status).toBe(200);
    expect(seen.url).toBe(
      "http://app.interne:3500/api/admin/payments/promos?q=ete&status=active",
    );
    expect(
      ((seen.init?.headers ?? {}) as Record<string, string>).authorization,
    ).toBe("Bearer jeton-admin-app");
  });

  test("route inconnue : 404 sans appel réseau ; jeton refusé : 502 sans fuite", async () => {
    let called = 0;
    const fetchFn = (async () => {
      called++;
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;
    const nope = await relayToPayments(
      { method: "GET", path: "vault" },
      { env, fetchFn },
    );
    expect(nope.status).toBe(404);
    expect(called).toBe(0);
    const denied = await relayToPayments(
      { method: "GET", path: "" },
      { env, fetchFn },
    );
    expect(denied.status).toBe(502);
    expect(JSON.stringify(denied.body)).not.toContain("jeton-admin-app");
  });

  test("réservé aux administrateurs Directus", async () => {
    const handler = createRelayHandler("nexora-payments", PAYMENTS_RELAY, env, {
      info() {},
    });
    const res = (status = 0) => {
      const out: { status: number; body?: unknown } = { status };
      return {
        out,
        set() {},
        status(code: number) {
          out.status = code;
          return { json: (b: unknown) => (out.body = b) };
        },
      };
    };
    const anon = res();
    await handler(
      { method: "GET", path: "/", accountability: null },
      anon as never,
    );
    expect(anon.out.status).toBe(401);
    const editor = res();
    await handler(
      { method: "GET", path: "/", accountability: { user: "u", admin: false } },
      editor as never,
    );
    expect(editor.out.status).toBe(403);
  });
});

describe("« Publier vers Stripe » pour une offre", () => {
  const plan = {
    code: "workstudio-equipe",
    status: "published",
    price_cents: 12900,
  };
  function deps(
    over: Partial<PublishPlanDeps> & {
      plan?: Record<string, unknown> | null;
    } = {},
  ) {
    const written: Array<[string, Record<string, unknown>]> = [];
    const calls: string[] = [];
    const d: PublishPlanDeps = {
      items: {
        readOne: async () => (over.plan === undefined ? plan : over.plan),
        updateOne: async (id, data) => {
          written.push([id, data]);
        },
      },
      publishToApp: async (code) => {
        calls.push(code);
        return {
          status: 200,
          body: {
            code,
            stripeProductId: "prod_1",
            stripePriceId: "price_1",
            appliedAt: "2026-11-01T00:00:00.000Z",
            priceCreated: true,
          },
        };
      },
      revalidate: async () => true,
      ...over,
    };
    return { d, written, calls };
  }

  test("pousse l'offre publiée vers Stripe puis écrit les identifiants dans la fiche", async () => {
    const { d, written, calls } = deps();
    const r = await publishPlanFlow(d, ID);
    expect(r.status).toBe(200);
    expect(calls).toEqual(["workstudio-equipe"]);
    expect(written).toEqual([
      [
        ID,
        {
          stripe_product_id: "prod_1",
          stripe_price_id: "price_1",
          stripe_synced_at: "2026-11-01T00:00:00.000Z",
        },
      ],
    ]);
    expect(r.body).toMatchObject({
      written: true,
      revalidated: true,
      stripePriceId: "price_1",
    });
  });

  test("refuse une offre non publiée, sans prix ou inconnue, sans appeler l'app", async () => {
    for (const [p, code] of [
      [{ ...plan, status: "draft" }, "PAIEMENTS_OFFRE_NON_PUBLIEE"],
      [{ ...plan, price_cents: null }, "PAIEMENTS_PRIX_ABSENT"],
      [{ ...plan, price_cents: 0 }, "PAIEMENTS_PRIX_ABSENT"],
      [null, "PAIEMENTS_OFFRE_INCONNUE"],
    ] as const) {
      const { d, calls, written } = deps({ plan: p as never });
      const r = await publishPlanFlow(d, ID);
      expect(
        (r.body as { errors: { extensions: { code: string } }[] }).errors[0]
          ?.extensions.code,
      ).toBe(code);
      expect(calls).toEqual([]);
      expect(written).toEqual([]);
    }
    expect((await publishPlanFlow(deps().d, "pas-un-uuid")).status).toBe(422);
  });

  test("une erreur de l'app est rendue telle quelle et rien n'est écrit", async () => {
    const { d, written } = deps({
      publishToApp: async () => ({
        status: 503,
        body: {
          error: "stripe_unavailable",
          message: "Stripe n'est pas branché",
        },
      }),
    });
    const r = await publishPlanFlow(d, ID);
    expect(r.status).toBe(503);
    expect(written).toEqual([]);
  });

  test("écriture de la fiche impossible : 502 qui rend les identifiants (non secrets) pour dépannage", async () => {
    const { d } = deps({
      items: {
        readOne: async () => plan,
        updateOne: async () => {
          throw new Error("FORBIDDEN");
        },
      },
    });
    const r = await publishPlanFlow(d, ID);
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ stripePriceId: "price_1" });
  });

  test("un échec de revalidation ne fait pas échouer la publication", async () => {
    const { d } = deps({
      revalidate: async () => {
        throw new Error("réseau");
      },
    });
    const r = await publishPlanFlow(d, ID);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ revalidated: false });
  });
});
