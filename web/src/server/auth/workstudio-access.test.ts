import { randomBytes } from "node:crypto";
import {
  apiKeys,
  eq,
  members,
  oauthAccessTokens,
  oauthClients,
  staffAccounts,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import type { Logger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashApiKey, revokeApiKey } from "../gateway/keys";
import { loadKeyring } from "../vault/crypto";
import { readSecret } from "../vault/store";
import { createAuth, type NexoraAuth } from "./index";
import { createMemoryMailer, type MemoryMailer } from "./mailer";
import {
  ALL_SCOPES,
  createOidcHarness,
  type TokenResponse,
} from "./oidc-test-support";
import {
  handleWorkstudioAccess,
  type WorkstudioAccessDeps,
} from "./workstudio-access";
import {
  createWorkstudioIntrospector,
  hashClientSecret,
  resolveWorkstudioOidc,
} from "./workstudio-oidc";

/**
 * `GET /api/oauth/workstudio-access` : WorkStudio présente le jeton d'accès OIDC de l'utilisateur et reçoit
 * `{ url, model, key }` de SON organisation. Parcours réel (autorisation, jeton) contre une base d'essai ; seul
 * le trousseau du coffre et la passerelle sont des valeurs d'essai.
 */

const ORIGIN = "http://localhost:3500";
const WORKSTUDIO = "https://studio.nexora.example";
const CALLBACK = `${WORKSTUDIO}/api/auth/oauth2/callback/nexora-oidc`;
const CLIENT_ID = "workstudio-access-test";
const CLIENT_SECRET = "a".repeat(20) + "Zz9".repeat(8);
const GATEWAY = "https://gateway.example.test/v1";
const MODEL = "nexora/deepseek-v4.1-flash-1017";
const URL_ACCESS = `${ORIGIN}/api/oauth/workstudio-access`;

const config = resolveWorkstudioOidc({
  WORKSTUDIO_OIDC_CLIENT_ID: CLIENT_ID,
  WORKSTUDIO_OIDC_CLIENT_SECRET: CLIENT_SECRET,
  WORKSTUDIO_PUBLIC_URL: WORKSTUDIO,
}).config;

let t: TestDatabase;
let mailer: MemoryMailer;
let auth: NexoraAuth;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
const secret = randomBytes(32).toString("hex");

const {
  call,
  cookiesOf,
  newVerifiedUser,
  fullLogin,
  pkce,
  authorize,
  redirectOf,
  exchange,
} = createOidcHarness({
  auth: () => auth,
  mailer: () => mailer,
  db: () => t,
  origin: ORIGIN,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  callback: CALLBACK,
});

/** Journal espion : garde tout ce qui lui est passé, avant la moindre rédaction. */
function spyLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const push = (level: string) => (msg: string, fields?: unknown) => {
    lines.push(`${level} ${msg} ${JSON.stringify(fields ?? {})}`);
  };
  const logger = {
    lines,
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    child: () => logger,
  };
  return logger as Logger & { lines: string[] };
}

let log: ReturnType<typeof spyLogger>;
const clock = new Date();
const allowedNow = () => clock;

function makeDeps(
  over: Partial<WorkstudioAccessDeps> = {},
): WorkstudioAccessDeps {
  return {
    db: () => t.db,
    keyring: () => keyring,
    introspect: createWorkstudioIntrospector(
      auth,
      config as NonNullable<typeof config>,
      ORIGIN,
    ),
    clientId: CLIENT_ID,
    gateway: () => ({ url: GATEWAY, model: MODEL }),
    allowLoopback: false,
    requireSubscription: false,
    entitled: async () => true,
    log,
    now: allowedNow,
    ...over,
  };
}

function access(
  token: string | null,
  deps: WorkstudioAccessDeps = makeDeps(),
  init: RequestInit & { ip?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  headers.set("x-forwarded-for", init.ip ?? "203.0.113.50");
  return handleWorkstudioAccess(
    new Request(URL_ACCESS, { method: "GET", ...init, headers }),
    deps,
  );
}

interface Access {
  url: string;
  model: string;
  key: string;
}

async function loginAndAccess(name?: string) {
  const user = await newVerifiedUser(name);
  const tokens = await fullLogin(user.cookie);
  const res = await access(tokens.access_token);
  const [member] = await t.db
    .select()
    .from(members)
    .where(eq(members.userId, user.userId));
  return {
    user,
    tokens,
    res,
    organizationId: member?.organizationId as string,
  };
}

beforeAll(async () => {
  t = await createTestDatabase();
  mailer = createMemoryMailer();
  auth = createAuth({
    db: t.db,
    secret,
    baseURL: ORIGIN,
    mailer,
    rateLimit: { enabled: false },
    workstudio: config,
  });
  log = spyLogger();
});
afterAll(async () => {
  await t.drop();
});

describe("accès modèle par utilisateur (côté tiré)", () => {
  it("rend { url, model, key } de l'organisation de l'utilisateur, jamais mis en cache", async () => {
    const { res, organizationId } = await loginAndAccess();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const body = (await res.json()) as Access;
    expect(Object.keys(body).sort()).toEqual(["key", "model", "url"]);
    expect(body.url).toBe(GATEWAY);
    expect(body.model).toBe(MODEL);
    expect(body.key).toMatch(/^nxk_/);
    // La clé appartient à l'organisation de l'utilisateur : ses jetons lui seront facturés.
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(body.key)));
    expect(row?.organizationId).toBe(organizationId);
    expect(row?.name).toBe("WorkStudio (automatique)");
    expect(
      await readSecret(t.db, keyring, `workstudio-key.${organizationId}`),
    ).toBe(body.key);
  });

  it("deux appels rendent la même clé (une seule clé par organisation)", async () => {
    const { tokens, res, organizationId } = await loginAndAccess();
    const first = (await res.json()) as Access;
    const second = (await (await access(tokens.access_token)).json()) as Access;
    expect(second.key).toBe(first.key);
    const rows = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId));
    expect(rows).toHaveLength(1);
  });

  it("isole les organisations : chaque utilisateur reçoit la clé de la sienne, jamais celle d'une autre", async () => {
    const a = await loginAndAccess("Alice Roy");
    const b = await loginAndAccess("Bob Côté");
    const ka = ((await a.res.json()) as Access).key;
    const kb = ((await b.res.json()) as Access).key;
    expect(ka).not.toBe(kb);
    expect(a.organizationId).not.toBe(b.organizationId);
    const owner = async (key: string) =>
      (
        await t.db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.keyHash, hashApiKey(key)))
      )[0]?.organizationId;
    expect(await owner(ka)).toBe(a.organizationId);
    expect(await owner(kb)).toBe(b.organizationId);
    // Le jeton de B ne ramène jamais la clé de A, même en répétant.
    const again = (await (
      await access(b.tokens.access_token)
    ).json()) as Access;
    expect(again.key).toBe(kb);
  });

  it("clé révoquée : l'appel suivant en crée une nouvelle", async () => {
    const { tokens, res, organizationId } = await loginAndAccess();
    const first = ((await res.json()) as Access).key;
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId));
    await revokeApiKey(t.db, organizationId, row?.id as string);
    const next = (await (await access(tokens.access_token)).json()) as Access;
    expect(next.key).not.toBe(first);
    expect(next.key).toMatch(/^nxk_/);
    const rows = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId));
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
  });

  it("appels simultanés : une seule clé", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        access(tokens.access_token, makeDeps(), { ip: "203.0.113.99" }),
      ),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBeGreaterThan(0);
    const keys = await Promise.all(
      ok.map(async (r) => ((await r.json()) as Access).key),
    );
    expect(new Set(keys).size).toBe(1);
  });
});

describe("abonnement WorkStudio exigé (clients ordinaires)", () => {
  it("sans abonnement : 403 subscription_required, et aucune clé n'est créée", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const [member] = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, user.userId));
    const organizationId = member?.organizationId as string;
    const deps = makeDeps({
      requireSubscription: true,
      entitled: async () => false,
    });
    const res = await access(tokens.access_token, deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "subscription_required" });
    const keys = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, organizationId));
    expect(keys).toHaveLength(0);
  });

  it("avec un abonnement (ou l'organisation maison) : 200 et la clé de l'organisation", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const seen: string[] = [];
    const deps = makeDeps({
      requireSubscription: true,
      entitled: async (_db, organizationId) => {
        seen.push(organizationId);
        return true;
      },
    });
    const res = await access(tokens.access_token, deps);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(((await res.json()) as Access).key).toMatch(/^nxk_/);
  });

  it("l'exigence se coupe pour un essai (requireSubscription: false) : la décision d'abonnement n'est même pas lue", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const deps = makeDeps({
      requireSubscription: false,
      entitled: async () => {
        throw new Error("ne doit pas être appelée");
      },
    });
    expect((await access(tokens.access_token, deps)).status).toBe(200);
  });
});

describe("protection par le jeton d'accès OIDC de WorkStudio", () => {
  it("sans jeton, avec un jeton mal formé ou inventé : 401 et un défi Bearer", async () => {
    for (const token of [null, "", "inventé", "x".repeat(2000), "a b"]) {
      const res = await access(token);
      expect(res.status, String(token)).toBe(401);
      expect(res.headers.get("www-authenticate") ?? "").toMatch(/^Bearer/);
      expect(res.headers.get("cache-control")).toMatch(/no-store/);
    }
    // Autre schéma d'autorisation.
    const basic = await handleWorkstudioAccess(
      new Request(URL_ACCESS, { headers: { authorization: "Basic abc" } }),
      makeDeps(),
    );
    expect(basic.status).toBe(401);
  });

  it("le jeton d'un AUTRE client est refusé, même valide et muni de la bonne portée", async () => {
    const user = await newVerifiedUser();
    // Premier appel OAuth : enregistre WorkStudio ; ensuite seulement on ajoute un second client.
    await fullLogin(user.cookie);
    const otherSecret = "o".repeat(40);
    await t.db.insert(oauthClients).values({
      id: "autre-client-id",
      clientId: "autre-client-0001",
      clientSecret: hashClientSecret(otherSecret),
      name: "Autre client",
      redirectUris: ["https://autre.example/cb"],
      scopes: ["openid", "profile", "email", "workstudio:model"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "client_secret_post",
      skipConsent: true,
      requirePKCE: true,
      disabled: false,
    });
    const { verifier, challenge } = pkce();
    const code = redirectOf(
      await authorize({
        cookie: user.cookie,
        clientId: "autre-client-0001",
        redirectUri: "https://autre.example/cb",
        challenge,
      }),
    ).searchParams.get("code");
    expect(code, "le second client obtient un code").toBeTruthy();
    const tokenRes = await exchange(code as string, verifier, {
      client_id: "autre-client-0001",
      client_secret: otherSecret,
      redirect_uri: "https://autre.example/cb",
    });
    expect(tokenRes.status).toBe(200);
    const foreign = (await tokenRes.json()) as TokenResponse;
    expect(foreign.scope.split(" ")).toContain("workstudio:model");

    const res = await access(foreign.access_token);
    expect(res.status).toBe(401);
    // Seconde ligne de défense : même si l'introspection répondait « actif » pour un autre client, la route refuse.
    const lying = makeDeps({
      introspect: async () => ({
        active: true,
        clientId: "autre-client-0001",
        userId: user.userId,
        scopes: ["openid", "workstudio:model"],
      }),
    });
    expect((await access("quelconque", lying)).status).toBe(401);
  });

  it("sans la portée workstudio:model : 403 insufficient_scope", async () => {
    const user = await newVerifiedUser();
    const { code, verifier } = await (async () => {
      const { verifier, challenge } = pkce();
      const code = redirectOf(
        await authorize({
          cookie: user.cookie,
          challenge,
          scope: "openid profile email",
        }),
      ).searchParams.get("code") as string;
      return { code, verifier };
    })();
    const tokens = (await (
      await exchange(code, verifier)
    ).json()) as TokenResponse;
    expect(tokens.scope.split(" ")).not.toContain("workstudio:model");
    const res = await access(tokens.access_token);
    expect(res.status).toBe(403);
    expect(res.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(((await res.json()) as { error: string }).error).toBe(
      "insufficient_scope",
    );
    // Aucune clé n'a été créée pour cet utilisateur.
    const [member] = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, user.userId));
    expect(
      await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, member?.organizationId as string)),
    ).toHaveLength(0);
  });

  it("jeton expiré ou session du site fermée : 401, plus aucune clé", async () => {
    const { user, tokens } = await loginAndAccess();
    await t.db
      .update(oauthAccessTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAccessTokens.userId, user.userId));
    expect((await access(tokens.access_token)).status).toBe(401);

    const second = await fullLogin(user.cookie);
    expect((await access(second.access_token)).status).toBe(200);
    const out = await call("/sign-out", {
      method: "POST",
      json: {},
      cookie: user.cookie,
      origin: ORIGIN,
    });
    expect(out.status).toBe(200);
    expect((await access(second.access_token)).status).toBe(401);
  });

  it("un compte du personnel sans double authentification est refusé, même avec un jeton déjà émis", async () => {
    const { user, tokens } = await loginAndAccess();
    await t.db
      .insert(staffAccounts)
      .values({ userId: user.userId, grantedBy: "test" });
    const res = await access(tokens.access_token);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "two_factor_required",
    );
    await t.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, user.userId));
    expect((await access(tokens.access_token)).status).toBe(200);
  });

  it("courriel non vérifié : refusé", async () => {
    const { user, tokens } = await loginAndAccess();
    await t.db
      .update(users)
      .set({ emailVerified: false })
      .where(eq(users.id, user.userId));
    const res = await access(tokens.access_token);
    expect(res.status).toBe(403);
  });

  it("limitation de débit par utilisateur et par adresse : 429 avec Retry-After", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    let last: Response | null = null;
    for (let i = 0; i < 40; i++) {
      last = await access(tokens.access_token, makeDeps(), {
        ip: "198.51.100.10",
      });
      if (last.status === 429) break;
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get("retry-after"))).toBeGreaterThan(0);
    // Une autre adresse ne partage pas le compteur de la première, mais cet utilisateur reste limité.
    const other = await access(tokens.access_token, makeDeps(), {
      ip: "198.51.100.11",
    });
    expect(other.status).toBe(429);
  });
});

describe("état de la configuration", () => {
  it("fournisseur inactif (pas de client WorkStudio) : 404", async () => {
    const res = await access(
      "x",
      makeDeps({ clientId: null, introspect: null }),
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("passerelle non configurée ou mal formée : 503, sans créer de clé", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const none = await access(
      tokens.access_token,
      makeDeps({ gateway: () => null }),
    );
    expect(none.status).toBe(503);
    const bad = await access(
      tokens.access_token,
      makeDeps({
        gateway: () => ({
          url: "http://gateway.example.test/v1",
          model: MODEL,
        }),
      }),
    );
    expect(bad.status).toBe(503);
    const [member] = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, user.userId));
    expect(
      await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, member?.organizationId as string)),
    ).toHaveLength(0);
  });

  it("seule la méthode GET est admise", async () => {
    const res = await handleWorkstudioAccess(
      new Request(URL_ACCESS, {
        method: "POST",
        headers: { authorization: "Bearer x" },
      }),
      makeDeps(),
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });
});

describe("authentification du client « basic » (WORKSTUDIO_OIDC_TOKEN_AUTH=basic)", () => {
  it("l'échange du code et l'introspection passent par l'en-tête Basic ; le secret dans le corps est refusé", async () => {
    const t2 = await createTestDatabase();
    try {
      const basicConfig = resolveWorkstudioOidc({
        WORKSTUDIO_OIDC_CLIENT_ID: "workstudio-basic-test",
        WORKSTUDIO_OIDC_CLIENT_SECRET: "b".repeat(20) + "Qq7".repeat(8),
        WORKSTUDIO_PUBLIC_URL: WORKSTUDIO,
        WORKSTUDIO_OIDC_TOKEN_AUTH: "basic",
      }).config as NonNullable<typeof config>;
      const mailer2 = createMemoryMailer();
      const auth2 = createAuth({
        db: t2.db,
        secret,
        baseURL: ORIGIN,
        mailer: mailer2,
        rateLimit: { enabled: false },
        workstudio: basicConfig,
      });
      const h = createOidcHarness({
        auth: () => auth2,
        mailer: () => mailer2,
        db: () => t2,
        origin: ORIGIN,
        clientId: basicConfig.clientId,
        clientSecret: basicConfig.clientSecret,
        callback: CALLBACK,
      });
      const user = await h.newVerifiedUser();
      const { verifier, challenge } = h.pkce();
      const code = h
        .redirectOf(await h.authorize({ cookie: user.cookie, challenge }))
        .searchParams.get("code") as string;
      const form = {
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK,
        code_verifier: verifier,
      };
      const inBody = await h.call("/oauth2/token", {
        form: {
          ...form,
          client_id: basicConfig.clientId,
          client_secret: basicConfig.clientSecret,
        },
      });
      expect(inBody.status).toBeGreaterThanOrEqual(400);
      const ok = await h.call("/oauth2/token", {
        form,
        basic: { id: basicConfig.clientId, secret: basicConfig.clientSecret },
      });
      expect(ok.status, JSON.stringify(await ok.clone().json())).toBe(200);
      const tokens = (await ok.json()) as TokenResponse;

      const deps = makeDeps({
        db: () => t2.db,
        introspect: createWorkstudioIntrospector(auth2, basicConfig, ORIGIN),
        clientId: basicConfig.clientId,
      });
      const res = await access(tokens.access_token, deps);
      expect(res.status).toBe(200);
      expect(((await res.json()) as Access).key).toMatch(/^nxk_/);
    } finally {
      await t2.drop();
    }
  });
});

describe("journal", () => {
  it("ne contient ni la clé de la passerelle, ni le jeton d'accès, ni le secret du client", async () => {
    const before = log.lines.length;
    const { tokens, res } = await loginAndAccess();
    const { key } = (await res.json()) as Access;
    // Cas d'erreur aussi : jeton faux, portée manquante, passerelle absente.
    await access("jeton-invente-123456789");
    await access(tokens.access_token, makeDeps({ gateway: () => null }));
    const written = log.lines.slice(before).join("\n");
    expect(written.length).toBeGreaterThan(0);
    expect(written).not.toContain(key);
    expect(written).not.toContain(tokens.access_token);
    expect(written).not.toContain(tokens.id_token);
    expect(written).not.toContain(CLIENT_SECRET);
    expect(written).not.toMatch(/nxk_/);
    expect(written).not.toContain("jeton-invente-123456789");
  });
});

// Sert à éviter un avertissement « import inutilisé » si la portée par défaut change.
void ALL_SCOPES;
void cookiesOf;
