import {
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";
import {
  eq,
  oauthAccessTokens,
  oauthClients,
  sessions,
  staffAccounts,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type NexoraAuth } from "./index";
import { createMemoryMailer, type MemoryMailer } from "./mailer";
import {
  ALL_SCOPES,
  createOidcHarness,
  PASSWORD,
  type TokenResponse,
} from "./oidc-test-support";
import {
  hashClientSecret,
  resolveWorkstudioOidc,
  WORKSTUDIO_SCOPES,
} from "./workstudio-oidc";

/**
 * Parcours complet d'un client OpenID Connect simulé (WorkStudio) contre le vrai gestionnaire HTTP de Better Auth
 * et une base d'essai : découverte, autorisation avec PKCE, échange du code, jeton d'identité vérifié avec les clés
 * publiées, userinfo ; puis les refus (secret, adresse de retour, rejeu, PKCE, portées) et la garde du personnel.
 */

const ORIGIN = "http://localhost:3500";
const WORKSTUDIO = "https://studio.nexora.example";
const CALLBACK = `${WORKSTUDIO}/api/auth/oauth2/callback/nexora-oidc`;
const CLIENT_ID = "workstudio-test-client";
const CLIENT_SECRET = "k".repeat(24) + "S3cr3t".repeat(5);
const ISSUER = `${ORIGIN}/api/auth`;

const oidcEnv = {
  WORKSTUDIO_OIDC_CLIENT_ID: CLIENT_ID,
  WORKSTUDIO_OIDC_CLIENT_SECRET: CLIENT_SECRET,
  WORKSTUDIO_PUBLIC_URL: WORKSTUDIO,
};
const config = resolveWorkstudioOidc(oidcEnv).config;

let t: TestDatabase;
let mailer: MemoryMailer;
let auth: NexoraAuth;
let inactive: NexoraAuth;

const secret = randomBytes(32).toString("hex");

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
  inactive = createAuth({
    db: t.db,
    secret,
    baseURL: ORIGIN,
    mailer,
    rateLimit: { enabled: false },
  });
});
afterAll(async () => {
  await t.drop();
});

const {
  request,
  call,
  cookiesOf,
  newVerifiedUser,
  pkce,
  authorize,
  redirectOf,
  obtainCode,
  exchange,
  fullLogin,
  userinfo,
} = createOidcHarness({
  auth: () => auth,
  mailer: () => mailer,
  db: () => t,
  origin: ORIGIN,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  callback: CALLBACK,
});

describe("découverte et clés publiques", () => {
  it("annonce un émetteur « SITE_URL/api/auth », PKCE S256 et le seul flux « code »", async () => {
    const res = await call("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, unknown>;
    expect(doc.issuer).toBe(ISSUER);
    expect(doc.authorization_endpoint).toBe(`${ISSUER}/oauth2/authorize`);
    expect(doc.token_endpoint).toBe(`${ISSUER}/oauth2/token`);
    expect(doc.userinfo_endpoint).toBe(`${ISSUER}/oauth2/userinfo`);
    expect(doc.jwks_uri).toBe(`${ISSUER}/jwks`);
    expect(doc.response_types_supported).toEqual(["code"]);
    expect(doc.grant_types_supported).toEqual(["authorization_code"]);
    expect(doc.code_challenge_methods_supported).toEqual(["S256"]);
    expect(doc.scopes_supported).toEqual([...WORKSTUDIO_SCOPES]);
    // Aucune inscription dynamique de client.
    expect(doc.registration_endpoint).toBeUndefined();
  });

  it("publie les clés de signature (RS256), sans la partie privée", async () => {
    const res = await call("/jwks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Record<string, unknown>[] };
    expect(body.keys.length).toBeGreaterThan(0);
    for (const key of body.keys) {
      expect(key.kty).toBe("RSA");
      expect(key.alg).toBe("RS256");
      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
    }
  });
});

describe("parcours complet : autorisation, jeton, userinfo", () => {
  it("rend un jeton d'identité vérifiable, un jeton d'accès court sans jeton de rafraîchissement, et le profil de l'utilisateur", async () => {
    const user = await newVerifiedUser("Camille Tremblay");
    const { code, verifier, state } = await obtainCode(user.cookie, {
      nonce: "nonce-abc",
      state: "etat-xyz",
    });
    expect(state).toBe("etat-xyz");
    // Consentement sauté : on arrive directement au code, sans page de consentement.
    const res = await exchange(code, verifier);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const tokens = (await res.json()) as TokenResponse;
    expect(tokens.token_type.toLowerCase()).toBe("bearer");
    expect(tokens.refresh_token).toBeUndefined();
    expect(tokens.expires_in).toBeLessThanOrEqual(900);
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.scope.split(" ").sort()).toEqual(
      [...WORKSTUDIO_SCOPES].sort(),
    );

    // Jeton d'identité : signature vérifiée avec les clés publiées, émetteur, public visé, nonce, sujet.
    const jwks = (await (await call("/jwks")).json()) as {
      keys: Array<Record<string, string>>;
    };
    const [h, p, sig] = tokens.id_token.split(".") as [string, string, string];
    const header = JSON.parse(Buffer.from(h, "base64url").toString());
    const jwk = jwks.keys.find((k) => k.kid === header.kid);
    expect(jwk, "clé publiée pour ce jeton").toBeDefined();
    expect(header.alg).toBe("RS256");
    const key = createPublicKey({ key: jwk as never, format: "jwk" });
    expect(
      verifySignature(
        "RSA-SHA256",
        Buffer.from(`${h}.${p}`),
        key,
        Buffer.from(sig, "base64url"),
      ),
    ).toBe(true);
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims.iss).toBe(ISSUER);
    expect(claims.aud).toBe(CLIENT_ID);
    expect(claims.nonce).toBe("nonce-abc");
    expect(claims.sub).toBe(user.userId);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(900);

    // userinfo : identifiant, nom, courriel vérifié, organisation.
    const info = await userinfo(tokens.access_token);
    expect(info.status).toBe(200);
    const body = (await info.json()) as Record<string, unknown>;
    const [member] = await t.sql`
      SELECT organization_id FROM members WHERE user_id = ${user.userId}`;
    expect(body).toEqual({
      sub: user.userId,
      name: "Camille Tremblay",
      email: user.email,
      email_verified: true,
      organization_id: member?.organization_id,
      given_name: expect.any(String),
      family_name: expect.any(String),
    });
  });

  it("ne range jamais le secret du client ni les jetons en clair", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    const [client] = await t.db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, CLIENT_ID));
    expect(client?.clientSecret).toBe(hashClientSecret(CLIENT_SECRET));
    expect(client?.clientSecret).not.toContain(CLIENT_SECRET);
    expect(client).toMatchObject({
      skipConsent: true,
      requirePKCE: true,
      disabled: false,
      redirectUris: [CALLBACK],
      grantTypes: ["authorization_code"],
      tokenEndpointAuthMethod: "client_secret_post",
    });
    const rows = await t.db.select().from(oauthAccessTokens);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.token).not.toBe(tokens.access_token);
    const dump = JSON.stringify(
      await t.sql`SELECT * FROM oauth_access_tokens UNION ALL SELECT NULL`.catch(
        () => [],
      ),
    );
    expect(dump).not.toContain(tokens.access_token);
  });

  it("sans session : renvoie vers la page de connexion avec une requête signée, puis reprend l'autorisation après la connexion", async () => {
    const user = await newVerifiedUser("Jean Gagnon");
    const { verifier, challenge } = pkce();
    const first = await authorize({ challenge, nonce: "n1" });
    const login = redirectOf(first);
    expect(`${login.origin}${login.pathname}`).toBe(
      `${ORIGIN}/compte/connexion`,
    );
    expect(login.searchParams.get("sig")).toBeTruthy();
    expect(login.searchParams.get("code")).toBeNull();

    // Le navigateur se connecte en renvoyant la requête signée (c'est ce que fait le plugin client).
    const signIn = await call("/sign-in/email", {
      origin: ORIGIN,
      json: {
        email: user.email,
        password: PASSWORD,
        oauth_query: login.search.slice(1),
      },
    });
    expect(signIn.status).toBe(200);
    const resumed = (await signIn.json()) as {
      redirect?: boolean;
      url?: string;
    };
    expect(resumed.redirect).toBe(true);
    const back = new URL(resumed.url as string);
    expect(`${back.origin}${back.pathname}`).toBe(CALLBACK);
    const code = back.searchParams.get("code") as string;
    expect(code).toBeTruthy();
    const tokens = await exchange(code, verifier);
    expect(tokens.status).toBe(200);
    const info = (await (
      await userinfo(((await tokens.json()) as TokenResponse).access_token)
    ).json()) as { sub: string };
    expect(info.sub).toBe(user.userId);
  });

  it("une requête signée falsifiée n'est pas acceptée", async () => {
    const user = await newVerifiedUser();
    const { challenge } = pkce();
    const login = redirectOf(await authorize({ challenge }));
    const tampered = login.search
      .slice(1)
      .replace(/scope=[^&]*/, "scope=openid");
    const signIn = await call("/sign-in/email", {
      origin: ORIGIN,
      json: { email: user.email, password: PASSWORD, oauth_query: tampered },
    });
    expect(signIn.status).toBe(400);
  });
});

describe("refus", () => {
  it("un mauvais secret de client est refusé et ne consomme pas le code", async () => {
    const user = await newVerifiedUser();
    const { code, verifier } = await obtainCode(user.cookie);
    const bad = await exchange(code, verifier, {
      client_secret: `${CLIENT_SECRET}x`,
    });
    expect([400, 401]).toContain(bad.status);
    expect(((await bad.json()) as { error: string }).error).toBe(
      "invalid_client",
    );
    const none = await exchange(code, verifier, { client_secret: "" });
    expect([400, 401]).toContain(none.status);
    const basic = await call("/oauth2/token", {
      form: {
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK,
        client_id: CLIENT_ID,
        code_verifier: verifier,
      },
    });
    expect(basic.status).toBeGreaterThanOrEqual(400);
    // Le bon secret réussit ensuite : le code n'a pas été brûlé par un client non authentifié.
    expect((await exchange(code, verifier)).status).toBe(200);
  });

  it("une mauvaise adresse de retour est refusée à l'autorisation (aucune redirection vers elle) et à l'échange", async () => {
    const user = await newVerifiedUser();
    for (const redirectUri of [
      "https://pirate.example/callback",
      `${CALLBACK}/../autre`,
      `${CALLBACK}?x=1`,
      `${WORKSTUDIO}:8443/api/auth/oauth2/callback/nexora-oidc`,
      "http://studio.nexora.example/api/auth/oauth2/callback/nexora-oidc",
    ]) {
      const { challenge } = pkce();
      const res = await authorize({
        cookie: user.cookie,
        challenge,
        redirectUri,
      });
      const location = res.headers.get("location") ?? "";
      expect(location, redirectUri).not.toContain("pirate.example");
      expect(location, redirectUri).not.toContain("code=");
      expect(location.startsWith(CALLBACK), redirectUri).toBe(false);
    }
    const { code, verifier } = await obtainCode(user.cookie);
    const bad = await exchange(code, verifier, {
      redirect_uri: "https://pirate.example/callback",
    });
    expect(bad.status).toBe(400);
  });

  it("un code rejoué est refusé", async () => {
    const user = await newVerifiedUser();
    const { code, verifier } = await obtainCode(user.cookie);
    const first = await exchange(code, verifier);
    expect(first.status).toBe(200);
    const replay = await exchange(code, verifier);
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as { error: string }).error).toBe(
      "invalid_grant",
    );
  });

  it("PKCE est obligatoire : sans défi à l'autorisation, ou avec un mauvais vérificateur à l'échange", async () => {
    const user = await newVerifiedUser();
    const noChallenge = await authorize({
      cookie: user.cookie,
      challenge: null,
    });
    const loc = redirectOf(noChallenge);
    expect(loc.searchParams.get("code")).toBeNull();
    expect(loc.searchParams.get("error")).toBe("invalid_request");

    // « plain » n'existe pas : S256 seulement.
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: CALLBACK,
      scope: ALL_SCOPES,
      code_challenge: "abc",
      code_challenge_method: "plain",
    });
    const plain = redirectOf(
      await call(`/oauth2/authorize?${params}`, { cookie: user.cookie }),
    );
    expect(plain.searchParams.get("code")).toBeNull();

    const { code } = await obtainCode(user.cookie);
    const wrong = await exchange(code, randomBytes(32).toString("base64url"));
    expect(wrong.status).toBe(400);
    const missing = await exchange(code, null);
    expect(missing.status).toBe(400);
  });

  it("refuse une portée inconnue, un client inconnu et l'accès hors-ligne", async () => {
    const user = await newVerifiedUser();
    for (const scope of [
      "openid offline_access",
      "openid admin",
      "openid workstudio:admin",
    ]) {
      const { challenge } = pkce();
      const loc = redirectOf(
        await authorize({ cookie: user.cookie, challenge, scope }),
      );
      expect(loc.searchParams.get("code"), scope).toBeNull();
      expect(loc.searchParams.get("error"), scope).toBe("invalid_scope");
    }
    const { challenge } = pkce();
    const unknown = await authorize({
      cookie: user.cookie,
      challenge,
      clientId: "client-inconnu-123",
    });
    expect(unknown.headers.get("location") ?? "").not.toContain("code=");
    const form = await call("/oauth2/token", {
      form: {
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
    });
    expect(form.status).toBe(400);
    const refresh = await call("/oauth2/token", {
      form: {
        grant_type: "refresh_token",
        refresh_token: "x",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
    });
    expect(refresh.status).toBe(400);
  });

  it("le jeton d'accès cesse de servir quand il expire, quand la session du site est fermée ou supprimée", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    expect((await userinfo(tokens.access_token)).status).toBe(200);
    await t.db
      .update(oauthAccessTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthAccessTokens.userId, user.userId));
    expect((await userinfo(tokens.access_token)).status).toBe(401);

    // Fermeture normale de la session.
    const second = await fullLogin(user.cookie);
    expect((await userinfo(second.access_token)).status).toBe(200);
    const out = await call("/sign-out", {
      method: "POST",
      json: {},
      cookie: user.cookie,
      origin: ORIGIN,
    });
    expect(out.status).toBe(200);
    expect((await userinfo(second.access_token)).status).toBe(401);

    // Session supprimée par un autre chemin (nettoyage, base) : les jetons partent avec elle.
    const again = await call("/sign-in/email", {
      origin: ORIGIN,
      json: { email: user.email, password: PASSWORD },
    });
    const third = await fullLogin(cookiesOf(again));
    expect((await userinfo(third.access_token)).status).toBe(200);
    await t.db.delete(sessions).where(eq(sessions.userId, user.userId));
    expect((await userinfo(third.access_token)).status).toBe(401);
  });

  it("userinfo refuse un jeton inventé ou absent", async () => {
    expect((await userinfo("jeton-invente")).status).toBe(401);
    expect((await call("/oauth2/userinfo")).status).toBe(401);
  });
});

describe("surface réduite : un seul client, aucune gestion publique", () => {
  it("un client connecté ne peut ni créer, ni lister, ni modifier de client OAuth, ni demander un JWT de session", async () => {
    const user = await newVerifiedUser();
    const before = await t.db.select().from(oauthClients);
    for (const [method, path, json] of [
      [
        "POST",
        "/oauth2/register",
        { redirect_uris: ["https://pirate.example/cb"] },
      ],
      [
        "POST",
        "/oauth2/create-client",
        { redirect_uris: ["https://pirate.example/cb"] },
      ],
      ["GET", "/oauth2/get-clients", undefined],
      ["GET", `/oauth2/get-client?client_id=${CLIENT_ID}`, undefined],
      ["POST", "/oauth2/update-client", { client_id: CLIENT_ID, update: {} }],
      ["POST", "/oauth2/delete-client", { client_id: CLIENT_ID }],
      ["POST", "/oauth2/client/rotate-secret", { client_id: CLIENT_ID }],
      ["GET", "/oauth2/get-consents", undefined],
      ["POST", "/oauth2/consent", { accept: true }],
      [
        "POST",
        "/admin/oauth2/create-client",
        { redirect_uris: ["https://pirate.example/cb"] },
      ],
      ["GET", "/token", undefined],
    ] as const) {
      const res = await call(path, {
        method,
        json,
        cookie: user.cookie,
        origin: ORIGIN,
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const after = await t.db.select().from(oauthClients);
    expect(after.map((c) => c.clientId).sort()).toEqual(
      before.map((c) => c.clientId).sort(),
    );
  });
});

describe("rotation du client (base à part : elle désactive l'ancien client)", () => {
  it("changer l'identifiant du client désactive l'ancien ; les jetons de l'ancien cessent de servir", async () => {
    const t2 = await createTestDatabase();
    try {
      const mk = (workstudio: typeof config) =>
        createAuth({
          db: t2.db,
          secret,
          baseURL: ORIGIN,
          mailer,
          rateLimit: { enabled: false },
          workstudio,
        });
      const first = mk(config);
      const rotated = resolveWorkstudioOidc({
        ...oidcEnv,
        WORKSTUDIO_OIDC_CLIENT_ID: "workstudio-rotation-2",
        WORKSTUDIO_OIDC_CLIENT_SECRET: "n".repeat(48),
      }).config;
      const second = mk(rotated);

      // Un utilisateur de cette base.
      const email = `rot${Date.now()}@example.com`;
      await request(first, "/sign-up/email", {
        origin: ORIGIN,
        json: { email, password: PASSWORD, name: "Rotation Test" },
      });
      await t2.sql`UPDATE users SET email_verified = true WHERE email = ${email}`;
      const signIn = await request(first, "/sign-in/email", {
        origin: ORIGIN,
        json: { email, password: PASSWORD },
      });
      const cookie = cookiesOf(signIn);

      const params = (clientId: string) =>
        new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: CALLBACK,
          scope: ALL_SCOPES,
          code_challenge: pkce().challenge,
          code_challenge_method: "S256",
        });

      const a = await request(first, `/oauth2/authorize?${params(CLIENT_ID)}`, {
        cookie,
      });
      const codeA = redirectOf(a).searchParams.get("code") as string;
      expect(codeA).toBeTruthy();
      const tokenA = await request(first, "/oauth2/token", {
        form: {
          grant_type: "authorization_code",
          code: codeA,
          redirect_uri: CALLBACK,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code_verifier: "x".repeat(43),
        },
      });
      // (mauvais vérificateur : seul compte ici l'état de la base ; le parcours complet est testé plus haut)
      expect(tokenA.status).toBe(400);

      // Le premier appel OAuth de la nouvelle instance enregistre le nouveau client et désactive l'ancien.
      const b = await request(
        second,
        `/oauth2/authorize?${params("workstudio-rotation-2")}`,
        { cookie },
      );
      expect(redirectOf(b).searchParams.get("code")).toBeTruthy();
      const rows = await t2.db.select().from(oauthClients);
      expect(rows.find((c) => c.clientId === CLIENT_ID)?.disabled).toBe(true);
      expect(
        rows.find((c) => c.clientId === "workstudio-rotation-2")?.disabled,
      ).toBe(false);

      // L'ancien client n'obtient plus de code, même sur l'ancienne instance, et son secret ne sert plus.
      const old = await request(
        first,
        `/oauth2/authorize?${params(CLIENT_ID)}`,
        { cookie },
      );
      expect(old.headers.get("location") ?? "").not.toContain("code=");
      const oldToken = await request(second, "/oauth2/token", {
        form: {
          grant_type: "authorization_code",
          code: "x",
          redirect_uri: CALLBACK,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code_verifier: "x".repeat(43),
        },
      });
      expect(oldToken.status).toBeGreaterThanOrEqual(400);
      // Le secret en base est celui du nouveau client (empreinte), jamais en clair.
      expect(
        rows.find((c) => c.clientId === "workstudio-rotation-2")?.clientSecret,
      ).toBe(hashClientSecret("n".repeat(48)));
    } finally {
      await t2.drop();
    }
  });
});

describe("compte du personnel : double authentification obligatoire", () => {
  it("sans double authentification, aucun code n'est délivré : renvoi vers la page de sécurité", async () => {
    const staff = await newVerifiedUser();
    await t.db
      .insert(staffAccounts)
      .values({ userId: staff.userId, grantedBy: "test" });
    const { challenge } = pkce();
    const loc = redirectOf(
      await authorize({ cookie: staff.cookie, challenge }),
    );
    expect(`${loc.origin}${loc.pathname}`).toBe(`${ORIGIN}/compte/securite`);
    expect(loc.searchParams.get("code")).toBeNull();
  });

  it("avec la double authentification activée, le personnel passe comme tout le monde ; un drapeau révoqué aussi", async () => {
    const staff = await newVerifiedUser();
    await t.db
      .insert(staffAccounts)
      .values({ userId: staff.userId, grantedBy: "test" });
    await t.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, staff.userId));
    const ok = await obtainCode(staff.cookie);
    expect(ok.code).toBeTruthy();

    const former = await newVerifiedUser();
    await t.db.insert(staffAccounts).values({
      userId: former.userId,
      grantedBy: "test",
      revokedAt: new Date(),
    });
    expect((await obtainCode(former.cookie)).code).toBeTruthy();
  });
});

describe("fournisseur inactif : échec fermé", () => {
  it("sans configuration, aucune route OAuth, ni découverte, ni clés", async () => {
    const user = await newVerifiedUser();
    for (const path of [
      "/.well-known/openid-configuration",
      "/jwks",
      "/oauth2/authorize?client_id=x&response_type=code",
      "/oauth2/userinfo",
    ]) {
      const res = await request(inactive, path, { cookie: user.cookie });
      expect(res.status, path).toBe(404);
    }
    const token = await request(inactive, "/oauth2/token", {
      form: {
        grant_type: "authorization_code",
        code: "x",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
    });
    expect(token.status).toBe(404);
  });

  it("un jeton émis par l'instance active ne sert à rien auprès de l'instance inactive", async () => {
    const user = await newVerifiedUser();
    const tokens = await fullLogin(user.cookie);
    expect((await userinfo(tokens.access_token, inactive)).status).toBe(404);
  });
});

describe("limitation de débit", () => {
  it("les routes OAuth sont limitées par adresse (Better Auth, stockage en base)", async () => {
    const limited = createAuth({
      db: t.db,
      secret,
      baseURL: ORIGIN,
      mailer,
      workstudio: config,
    });
    const { challenge } = pkce();
    let last = 0;
    for (let i = 0; i < 61; i++) {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK,
        scope: ALL_SCOPES,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      const res = await request(limited, `/oauth2/authorize?${params}`, {
        ip: "198.51.100.77",
      });
      last = res.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
