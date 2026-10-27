import { randomBytes } from "node:crypto";
import { eq, vaultSecrets } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type Keyring, loadKeyring, VaultError } from "./crypto";
import {
  handleList,
  handlePost,
  handleRevoke,
  type VaultDeps,
} from "./handlers";
import { getSecret } from "./index";
import { readSecret, rotateMasterKey } from "./store";

const TOKEN = "t".repeat(48);
const key = () => randomBytes(32).toString("base64");

let t: TestDatabase;
let keyring: Keyring;
let deps: VaultDeps;

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(vaultSecrets);
  keyring = loadKeyring({ NEXORA_VAULT_MASTER_KEY: key() });
  deps = {
    db: () => t.db,
    adminToken: TOKEN,
    keyring: () => keyring,
    log: createLogger({ name: "test", sink: () => {} }),
  };
});

const auth = { authorization: `Bearer ${TOKEN}` };
const post = (body: unknown, headers: Record<string, string> = auth) =>
  new Request("http://localhost/api/admin/vault", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const list = (headers: Record<string, string> = auth) =>
  new Request("http://localhost/api/admin/vault", { headers });
const del = (headers: Record<string, string> = auth) =>
  new Request("http://localhost/api/admin/vault/x", {
    method: "DELETE",
    headers,
  });

const VALUE = "sk-or-v1-SENTINELVALUE-9f8e7d6c5b4a";

describe("POST /api/admin/vault", () => {
  it("enregistre le secret et ne renvoie jamais la valeur (contrat figé)", async () => {
    const res = await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      deps,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(VALUE);
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual([
      "kind",
      "last4",
      "ref",
      "updatedAt",
    ]);
    expect(body).toMatchObject({
      ref: "openrouter.main",
      last4: "5b4a",
      kind: "llm_provider",
    });
    expect(Number.isNaN(Date.parse(body.updatedAt))).toBe(false);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("ne stocke aucune trace de la valeur en clair dans la base", async () => {
    await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      deps,
    );
    const rows = await t.sql`SELECT * FROM vault_secrets`;
    expect(JSON.stringify(rows)).not.toContain(VALUE);
    expect(JSON.stringify(rows)).not.toContain(
      Buffer.from(VALUE).toString("base64"),
    );
    expect(await readSecret(t.db, keyring, "openrouter.main")).toBe(VALUE);
  });

  it("remplace la valeur d'une référence existante (nouvelle clé de données) et la ré-active", async () => {
    await handlePost(
      post({ ref: "stripe.test", value: "valeur-un-0001", kind: "payment" }),
      deps,
    );
    const [first] = await t.db
      .select()
      .from(vaultSecrets)
      .where(eq(vaultSecrets.ref, "stripe.test"));
    await handleRevoke(del(), "stripe.test", deps);
    const res = await handlePost(
      post({ ref: "stripe.test", value: "valeur-deux-0002", kind: "payment" }),
      deps,
    );
    expect(res.status).toBe(200);
    const rows = await t.db.select().from(vaultSecrets);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.revokedAt).toBeNull();
    expect(rows[0]?.dataKeyEncrypted).not.toBe(first?.dataKeyEncrypted);
    expect(rows[0]?.createdAt.getTime()).toBe(first?.createdAt.getTime());
    expect(await readSecret(t.db, keyring, "stripe.test")).toBe(
      "valeur-deux-0002",
    );
  });

  it.each([
    ["sans en-tête", {}],
    ["mauvais jeton", { authorization: `Bearer ${"x".repeat(48)}` }],
    ["mauvais schéma", { authorization: `Basic ${TOKEN}` }],
    ["jeton tronqué", { authorization: `Bearer ${TOKEN.slice(0, 10)}` }],
  ])("refuse avec 401 : %s", async (_name, headers) => {
    const res = await handlePost(
      post({ ref: "abc", value: VALUE, kind: "other" }, headers),
      deps,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(VALUE);
    expect(await t.db.select().from(vaultSecrets)).toHaveLength(0);
  });

  it.each([
    [
      "référence en majuscules",
      { ref: "ABC.def", value: VALUE, kind: "other" },
    ],
    ["référence trop courte", { ref: "ab", value: VALUE, kind: "other" }],
    [
      "référence trop longue",
      { ref: "a".repeat(65), value: VALUE, kind: "other" },
    ],
    ["référence avec espace", { ref: "ab cd", value: VALUE, kind: "other" }],
    ["valeur vide", { ref: "abc", value: "", kind: "other" }],
    [
      "valeur trop longue",
      { ref: "abc", value: "v".repeat(4097), kind: "other" },
    ],
    ["valeur non textuelle", { ref: "abc", value: 12345, kind: "other" }],
    ["genre inconnu", { ref: "abc", value: VALUE, kind: "autre" }],
    ["genre absent", { ref: "abc", value: VALUE }],
    ["champ en trop", { ref: "abc", value: VALUE, kind: "other", extra: 1 }],
  ])("refuse avec 422 : %s", async (_name, body) => {
    const res = await handlePost(post(body), deps);
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain(VALUE);
  });

  it("accepte les bornes (valeur de 4096 caractères, référence de 64)", async () => {
    const res = await handlePost(
      post({ ref: "a".repeat(64), value: "v".repeat(4096), kind: "other" }),
      deps,
    );
    expect(res.status).toBe(200);
  });

  it("refuse avec 422 un corps qui n'est pas du JSON, sans le recopier", async () => {
    const res = await handlePost(post(`{"value":"${VALUE}"`), deps);
    expect(res.status).toBe(422);
    expect(await res.text()).not.toContain(VALUE);
  });

  it("échoue fermé (503) si le jeton d'administration n'est pas configuré", async () => {
    const res = await handlePost(
      post({ ref: "abc", value: VALUE, kind: "other" }),
      { ...deps, adminToken: undefined },
    );
    expect(res.status).toBe(503);
  });

  it("répond 503 si la clé maîtresse est absente, sans rien stocker", async () => {
    const res = await handlePost(
      post({ ref: "abc", value: VALUE, kind: "other" }),
      {
        ...deps,
        keyring: () => loadKeyring({}),
      },
    );
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain(VALUE);
  });
});

describe("GET /api/admin/vault", () => {
  it("liste références, genres, 4 derniers caractères et dates, jamais de valeur ni de matériel chiffré", async () => {
    await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      deps,
    );
    await handlePost(
      post({
        ref: "proxmox.pve1",
        value: "jeton-proxmox-abcdef1234",
        kind: "proxmox",
      }),
      deps,
    );
    await handleRevoke(del(), "proxmox.pve1", deps);
    const res = await handleList(list(), deps);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(VALUE);
    expect(text).not.toMatch(/ciphertext|authTag|dataKey|iv"/i);
    const { secrets } = JSON.parse(text);
    expect(secrets.map((s: { ref: string }) => s.ref)).toEqual([
      "openrouter.main",
      "proxmox.pve1",
    ]);
    expect(Object.keys(secrets[0]).sort()).toEqual([
      "createdAt",
      "kind",
      "last4",
      "ref",
      "revokedAt",
      "updatedAt",
    ]);
    expect(secrets[0].revokedAt).toBeNull();
    expect(secrets[1].revokedAt).not.toBeNull();
  });

  it("exige le jeton", async () => {
    expect((await handleList(list({}), deps)).status).toBe(401);
  });
});

describe("DELETE /api/admin/vault/[ref]", () => {
  it("révoque : la valeur n'est plus lisible et plus aucun matériel chiffré n'est conservé", async () => {
    await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      deps,
    );
    const res = await handleRevoke(del(), "openrouter.main", deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ref: "openrouter.main" });
    await expect(
      readSecret(t.db, keyring, "openrouter.main"),
    ).rejects.toMatchObject({ code: "revoked" });
    const [row] = await t.db.select().from(vaultSecrets);
    expect(row).toMatchObject({
      ciphertext: "",
      dataKeyEncrypted: "",
      iv: "",
      authTag: "",
    });
    // idempotent
    expect((await handleRevoke(del(), "openrouter.main", deps)).status).toBe(
      200,
    );
  });

  it("répond 404 pour une référence inconnue, 422 pour une référence invalide, 401 sans jeton", async () => {
    expect((await handleRevoke(del(), "inconnue.ref", deps)).status).toBe(404);
    expect((await handleRevoke(del(), "BAD REF", deps)).status).toBe(422);
    expect((await handleRevoke(del({}), "inconnue.ref", deps)).status).toBe(
      401,
    );
  });
});

describe("getSecret", () => {
  it("restitue la valeur aux modules serveur, refuse l'inconnu et le révoqué", async () => {
    await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      deps,
    );
    const d = { db: () => t.db, keyring: () => keyring };
    expect(await getSecret("openrouter.main", d)).toBe(VALUE);
    await expect(getSecret("absente.ref", d)).rejects.toMatchObject({
      code: "not_found",
    });
    await handleRevoke(del(), "openrouter.main", deps);
    await expect(getSecret("openrouter.main", d)).rejects.toBeInstanceOf(
      VaultError,
    );
  });
});

describe("rotation de la clé maîtresse (base réelle)", () => {
  it("réencapsule tous les secrets actifs, sans toucher au texte chiffré, et retire l'ancienne clé", async () => {
    const oldKey = key();
    const newKey = key();
    const v1 = loadKeyring({ NEXORA_VAULT_MASTER_KEY: oldKey });
    const v1deps = { ...deps, keyring: () => v1 };
    await handlePost(
      post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
      v1deps,
    );
    await handlePost(
      post({ ref: "autre.cle", value: "autre-valeur-0000", kind: "other" }),
      v1deps,
    );
    await handlePost(
      post({ ref: "revoquee.cle", value: "valeur-a-revoquer", kind: "other" }),
      v1deps,
    );
    await handleRevoke(del(), "revoquee.cle", v1deps);
    const before = await t.db.select().from(vaultSecrets);

    const rotating = loadKeyring({
      NEXORA_VAULT_MASTER_KEY: newKey,
      NEXORA_VAULT_MASTER_KEY_VERSION: "2",
      NEXORA_VAULT_MASTER_KEY_PREVIOUS: oldKey,
      NEXORA_VAULT_MASTER_KEY_PREVIOUS_VERSION: "1",
    });
    expect(await rotateMasterKey(t.db, rotating)).toEqual({
      rewrapped: 2,
      alreadyCurrent: 0,
    });
    expect(await rotateMasterKey(t.db, rotating)).toEqual({
      rewrapped: 0,
      alreadyCurrent: 2,
    });

    const after = await t.db.select().from(vaultSecrets);
    for (const row of after.filter((r) => r.revokedAt === null)) {
      const old = before.find((b) => b.ref === row.ref);
      expect(row.masterKeyVersion).toBe(2);
      expect(row.ciphertext).toBe(old?.ciphertext);
      expect(row.dataKeyEncrypted).not.toBe(old?.dataKeyEncrypted);
    }

    const retired = loadKeyring({
      NEXORA_VAULT_MASTER_KEY: newKey,
      NEXORA_VAULT_MASTER_KEY_VERSION: "2",
    });
    expect(await readSecret(t.db, retired, "openrouter.main")).toBe(VALUE);
    expect(await readSecret(t.db, retired, "autre.cle")).toBe(
      "autre-valeur-0000",
    );
    // L'ancienne clé seule ne lit plus rien.
    await expect(
      readSecret(t.db, v1, "openrouter.main"),
    ).rejects.toBeInstanceOf(VaultError);
  });
});

describe("aucune fuite dans les journaux ni les messages d'erreur", () => {
  const captured: string[] = [];
  const spies: Array<{ mockRestore(): void }> = [];

  beforeEach(() => {
    captured.length = 0;
    const grab = (chunk: unknown) => {
      captured.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    };
    spies.push(
      vi.spyOn(process.stdout, "write").mockImplementation(grab as never),
    );
    spies.push(
      vi.spyOn(process.stderr, "write").mockImplementation(grab as never),
    );
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      spies.push(
        vi
          .spyOn(console, m)
          .mockImplementation(
            (...args: unknown[]) =>
              void captured.push(args.map(String).join(" ")),
          ),
      );
    }
  });
  afterEach(() => {
    for (const s of spies.splice(0)) s.mockRestore();
  });

  it("n'écrit jamais la valeur, même sur les chemins d'erreur (corps invalide, base en panne, clé absente)", async () => {
    const real = {
      ...deps,
      log: createLogger({ name: "web", level: "debug" }),
    };
    const responses: Response[] = [];
    responses.push(
      await handlePost(
        post({ ref: "openrouter.main", value: VALUE, kind: "llm_provider" }),
        real,
      ),
    );
    responses.push(
      await handlePost(
        post({ ref: "MAUVAISE", value: VALUE, kind: "llm_provider" }),
        real,
      ),
    );
    responses.push(await handlePost(post(`{"value":"${VALUE}"`), real));
    responses.push(
      await handlePost(
        post({ ref: "abc", value: VALUE, kind: "other" }, {}),
        real,
      ),
    );
    responses.push(
      await handlePost(post({ ref: "abc", value: VALUE, kind: "other" }), {
        ...real,
        db: () => {
          throw new Error(
            `connexion refusée (valeur ${VALUE}, Authorization: Bearer ${TOKEN})`,
          );
        },
      }),
    );
    responses.push(
      await handlePost(post({ ref: "abc", value: VALUE, kind: "other" }), {
        ...real,
        keyring: () => loadKeyring({}),
      }),
    );
    responses.push(await handleList(list(), real));
    responses.push(await handleRevoke(del(), "openrouter.main", real));

    const bodies = await Promise.all(responses.map((r) => r.text()));
    const everything = [...captured, ...bodies].join("\n");
    expect(everything).not.toContain(VALUE);
    expect(everything).not.toContain("SENTINELVALUE");
    expect(everything).not.toContain(TOKEN);
    expect(responses.map((r) => r.status)).toEqual([
      200, 422, 422, 401, 500, 503, 200, 200,
    ]);
    // Des journaux existent bel et bien (le test ne passe pas parce que rien n'est écrit).
    expect(captured.some((l) => l.includes("vault"))).toBe(true);
  });
});
