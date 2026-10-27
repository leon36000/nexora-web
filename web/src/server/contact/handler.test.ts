import { jobs, leads } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issueChallenge } from "./altcha";
import {
  type ContactDeps,
  handleChallenge,
  handleContactSubmit,
} from "./handler";
import { createRateLimiter } from "./rate-limit";

const SECRET = "s".repeat(48);
const fast = { cost: 10, counterMin: 1, counterMax: 20 };

let t: TestDatabase;
let deps: ContactDeps;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
  await t.db.delete(leads);
  deps = {
    db: () => t.db,
    altchaSecret: SECRET,
    limiter: createRateLimiter({ windowMs: 600_000, max: 5 }),
    challengeTuning: fast,
    log: createLogger({ name: "test", sink: () => {} }),
  };
});

async function proof(): Promise<string> {
  const challenge = await issueChallenge(SECRET, fast);
  const solution = await solveChallenge({ challenge, deriveKey });
  return btoa(JSON.stringify({ challenge, solution }));
}
const form = (over: Record<string, unknown> = {}) => ({
  need: "diagnostic",
  sector: "services-professionnels",
  deployment: "indecis",
  name: "Julie Roy",
  email: "julie@exemple.ca",
  company: "Clinique Roy",
  message: "",
  marketingConsent: false,
  website: "",
  lang: "fr",
  ...over,
});
const post = async (
  body: unknown,
  headers: Record<string, string> = {},
  raw?: string,
) =>
  handleContactSubmit(
    new Request("http://localhost:3500/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.5",
        ...headers,
      },
      body: raw ?? JSON.stringify(body),
    }),
    deps,
  );
const count = async () => (await t.db.select().from(leads)).length;

describe("POST /api/contact : validation, anti-abus, enregistrement unique", () => {
  it("enregistre une demande valide : 200 « recorded », une ligne, une tâche de notification", async () => {
    const res = await post(form({ altcha: await proof() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await count()).toBe(1);
    expect(await t.db.select().from(jobs)).toHaveLength(1);
  });

  it("renvoie 422 avec un code par champ et n'enregistre rien ; la preuve n'est pas consommée", async () => {
    const p = await proof();
    const bad = await post(form({ altcha: p, email: "nope", name: "" }));
    expect(bad.status).toBe(422);
    const body = (await bad.json()) as { errors: Record<string, string> };
    expect(body.errors).toMatchObject({
      email: "invalid_email",
      name: "required",
    });
    expect(await count()).toBe(0);
    // la même preuve sert à la correction du formulaire
    const ok = await post(form({ altcha: p }));
    expect(ok.status).toBe(200);
  });

  it("refuse sans preuve Altcha (403) et ne crée rien", async () => {
    const res = await post(form());
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("altcha");
    expect(await count()).toBe(0);
  });

  it("refuse une preuve falsifiée ou rejouée (403)", async () => {
    const p = await proof();
    const forged = await post(form({ altcha: `${p.slice(0, -4)}AAAA` }));
    expect(forged.status).toBe(403);
    expect((await post(form({ altcha: p }))).status).toBe(200);
    const replay = await post(form({ altcha: p, email: "autre@exemple.ca" }));
    expect(replay.status).toBe(403);
    expect(await count()).toBe(1);
  });

  it("le champ piège (honeypot) rempli : réponse identique, rien d'enregistré", async () => {
    const res = await post(
      form({ altcha: await proof(), website: "https://spam.example" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded" });
    expect(await count()).toBe(0);
    expect(await t.db.select().from(jobs)).toHaveLength(0);
  });

  it("limite le débit par client : 429 avec Retry-After après 5 envois", async () => {
    for (let i = 0; i < 5; i++)
      await post(form({ altcha: "x", email: `a${i}@exemple.ca` }));
    const res = await post(form({ altcha: "x" }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // un autre client n'est pas touché
    const other = await post(form({ altcha: await proof() }), {
      "x-forwarded-for": "198.51.100.7",
    });
    expect(other.status).toBe(200);
  });

  it("un doublon dans les 24 h répond « already_recorded » sans rien ajouter", async () => {
    expect((await post(form({ altcha: await proof() }))).status).toBe(200);
    const again = await post(form({ altcha: await proof() }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ status: "already_recorded" });
    expect(await count()).toBe(1);
    expect(await t.db.select().from(jobs)).toHaveLength(1);
  });

  it("la langue de la demande est conservée ; une langue inconnue devient le français", async () => {
    await post(
      form({ altcha: await proof(), lang: "en", email: "a@exemple.ca" }),
    );
    await post(
      form({ altcha: await proof(), lang: "de", email: "b@exemple.ca" }),
    );
    const rows = await t.db.select().from(leads);
    expect(rows.map((r) => r.lang).sort()).toEqual(["en", "fr"]);
  });

  it("refuse un autre type de contenu (415), un JSON illisible (400) et un corps énorme (413)", async () => {
    expect((await post(form(), { "content-type": "text/plain" })).status).toBe(
      415,
    );
    expect((await post(null, {}, "{pas du json")).status).toBe(400);
    expect(
      (await post(null, {}, `{"message":"${"x".repeat(40_000)}"}`)).status,
    ).toBe(413);
  });

  it("le type de contenu doit être application/json : « text/plain;application/json » (requête CORS simple, sans prévol) est refusé", async () => {
    for (const type of [
      "text/plain;application/json",
      "text/plain; charset=utf-8, application/json",
      "multipart/form-data; boundary=application/json",
      "application/jsonp",
    ])
      expect((await post(form(), { "content-type": type })).status, type).toBe(
        415,
      );
    expect(
      (
        await post(form({ altcha: await proof() }), {
          "content-type": "Application/JSON; charset=UTF-8",
        })
      ).status,
    ).toBe(200);
  });

  it("refuse sans la lire un corps annoncé trop gros par Content-Length (413)", async () => {
    let read = false;
    const request = new Request("http://localhost:3500/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "9000000",
      },
      body: "{}",
    });
    const text = request.text.bind(request);
    request.text = async () => {
      read = true;
      return text();
    };
    const res = await handleContactSubmit(request, deps);
    expect(res.status).toBe(413);
    expect(read).toBe(false);
  });

  it("une panne de la base : 500 sans détail, la demande n'est pas perdue en silence (le visiteur peut réessayer)", async () => {
    const broken = {
      ...deps,
      db: () => {
        throw new Error("postgres://nexora:motdepasse@127.0.0.1/app refusé");
      },
    };
    const res = await handleContactSubmit(
      new Request("http://x/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form({ altcha: await proof() })),
      }),
      broken,
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("motdepasse");
    expect(JSON.parse(text)).toEqual({ error: "storage" });
  });

  it("503 si le secret Altcha n'est pas configuré (fermé, jamais ouvert)", async () => {
    deps.altchaSecret = undefined;
    const res = await post(form({ altcha: "x" }));
    expect(res.status).toBe(503);
  });
});

describe("GET /api/contact/challenge", () => {
  const get = (h: Record<string, string> = {}) =>
    handleChallenge(
      new Request("http://x/api/contact/challenge", {
        headers: { "x-forwarded-for": "203.0.113.9", ...h },
      }),
      deps,
    );

  it("émet un défi signé, jamais mis en cache", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const c = (await res.json()) as {
      parameters: { cost: number };
      signature: string;
    };
    expect(c.signature).toMatch(/^[0-9a-f]+$/);
    expect(c.parameters.cost).toBe(10);
  });

  it("503 sans secret ; 429 au-delà de la limite de défis", async () => {
    deps.altchaSecret = undefined;
    expect((await get()).status).toBe(503);
    deps.altchaSecret = SECRET;
    deps.challengeLimiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    await get();
    await get();
    expect((await get()).status).toBe(429);
  });
});
