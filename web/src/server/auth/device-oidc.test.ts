/**
 * Flux OIDC Authorization Code + PKCE S256 des clients natifs de bureau : découverte, autorisation,
 * échange du code (form-urlencoded et JSON), usage unique strict des codes, empreintes seules en base.
 * Tests d'intégration réels sur PostgreSQL jetable ; ignorés sans base de test configurée.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  deviceOidcCodes,
  deviceOidcTokens,
  eq,
  staffAccounts,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";
import {
  ALLOWED_NATIVE_CLIENTS,
  authenticateDeviceOidcToken,
  type DeviceOidcDeps,
  type DeviceOidcSessionUser,
  handleDeviceOidcAuthorize,
  handleDeviceOidcDiscovery,
  handleDeviceOidcToken,
  isValidLoopbackRedirectUri,
} from "./device-oidc";

const BASE = "https://nexora.test";
const SECRET = "s".repeat(48);
const REDIRECT = "http://127.0.0.1:47381/callback";
const dbAvailable = Boolean(
  process.env.NEXORA_TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
if (!dbAvailable)
  console.warn(
    "device-oidc : tests d'intégration ignorés (NEXORA_TEST_DATABASE_URL / DATABASE_URL absent).",
  );

const pkce = () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge };
};

describe("isValidLoopbackRedirectUri (RFC 8252)", () => {
  it("accepte la boucle locale avec port explicite et chemin /callback", () => {
    for (const good of [
      "http://127.0.0.1:47381/callback",
      "http://localhost:1024/callback",
      "http://[::1]:65535/callback",
      "http://127.0.0.1:5000/callback/desktop",
    ])
      expect(isValidLoopbackRedirectUri(good)).toBe(true);
  });

  it("refuse https, hôtes distants, port absent, identifiants, fragment et autre chemin", () => {
    for (const bad of [
      "https://127.0.0.1:47381/callback",
      "https://evil.example/callback",
      "http://evil.example:47381/callback",
      "http://127.0.0.1/callback",
      "http://127.0.0.1:80/callback",
      "http://127.0.0.1:70000/callback",
      "http://user:pw@127.0.0.1:47381/callback",
      "http://127.0.0.1:47381/callback#x",
      "http://127.0.0.1:47381/autre",
      "javascript:alert(1)",
      "pas une url",
    ])
      expect(isValidLoopbackRedirectUri(bad)).toBe(false);
  });
});

describe("handleDeviceOidcDiscovery", () => {
  it("publie les points de terminaison exacts et impose S256", async () => {
    const res = handleDeviceOidcDiscovery(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/oauth/token`,
      jwks_uri: `${BASE}/api/auth/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["openid", "profile", "email", "device:grant"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});

describe.skipIf(!dbAvailable)("flux OIDC des clients natifs (PostgreSQL)", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
  });
  afterAll(async () => {
    await t.drop();
  });

  const id = () => randomBytes(6).toString("hex");

  async function seedUser(over: { twoFactorEnabled?: boolean } = {}) {
    const userId = id();
    await t.db.insert(users).values({
      id: userId,
      name: "Aline Tremblay",
      email: `${userId}@example.com`,
      ...over,
    });
    return { id: userId, email: `${userId}@example.com`, name: "Aline Tremblay" };
  }

  function authorizeUrl(
    over: Record<string, string | null> = {},
    challenge = pkce().challenge,
  ): string {
    const params = new URLSearchParams({
      client_id: "lifecode-desktop",
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: "openid profile device:grant",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st-123",
    });
    for (const [k, v] of Object.entries(over)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return `${BASE}/oauth/authorize?${params.toString()}`;
  }

  function deps(
    user: DeviceOidcSessionUser | null,
    now?: () => Date,
  ): DeviceOidcDeps {
    return {
      db: t.db,
      baseUrl: BASE,
      getSessionUser: async () => user,
      now,
    };
  }

  async function exchange(
    form: Record<string, string>,
    asJson = false,
  ): Promise<Response> {
    return handleDeviceOidcToken(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: {
          "content-type": asJson
            ? "application/json"
            : "application/x-www-form-urlencoded",
        },
        body: asJson
          ? JSON.stringify(form)
          : new URLSearchParams(form).toString(),
      }),
      { db: t.db, baseUrl: BASE, signingSecret: SECRET },
    );
  }

  /** Autorise et renvoie { url de retour, verifier }. */
  async function authorize(
    user: DeviceOidcSessionUser,
    over: Record<string, string | null> = {},
  ) {
    const { verifier, challenge } = pkce();
    const req = new Request(authorizeUrl({ code_challenge: challenge, ...over }));
    const res = await handleDeviceOidcAuthorize(req, deps(user));
    return { res, verifier, challenge };
  }

  it("sans session : redirige vers la connexion avec next accepté par safeNextPath", async () => {
    const { challenge } = pkce();
    const target = authorizeUrl({ code_challenge: challenge });
    const res = await handleDeviceOidcAuthorize(
      new Request(target),
      deps(null),
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe(BASE);
    expect(location.pathname).toBe("/fr/compte/connexion");
    const next = location.searchParams.get("next");
    expect(next?.startsWith("/oauth/authorize?")).toBe(true);
    expect(next).toBe(`/oauth/authorize${new URL(target).search}`);
    expect(safeNextPath(next)).toBe(next);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sans session et langue anglaise : /en/compte/connexion", async () => {
    const res = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl(), { headers: { "accept-language": "en-US,en;q=0.9" } }),
      deps(null),
    );
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
      "/en/compte/connexion",
    );
    const res2 = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl({ ui_locales: "en" })),
      deps(null),
    );
    expect(new URL(res2.headers.get("location") ?? "").pathname).toBe(
      "/en/compte/connexion",
    );
  });

  it("refuse un redirect_uri non local (400 JSON, aucune redirection ouverte)", async () => {
    const user = await seedUser();
    for (const redirectUri of [
      "https://evil.example/callback",
      "http://127.0.0.1/callback",
      "http://evil.example:47381/callback",
      "http://127.0.0.1:47381/autre",
    ]) {
      const res = await handleDeviceOidcAuthorize(
        new Request(authorizeUrl({ redirect_uri: redirectUri })),
        deps(user),
      );
      expect(res.status).toBe(400);
      expect(res.headers.get("location")).toBeNull();
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    const unknown = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl({ client_id: "evil-client" })),
      deps(user),
    );
    expect(unknown.status).toBe(400);
    expect(unknown.headers.get("location")).toBeNull();
    expect(await unknown.json()).toMatchObject({ error: "invalid_request" });
  });

  it("refuse PKCE absent/plain et portées sans device:grant (retour d'erreur au client local)", async () => {
    const user = await seedUser();
    const cases: Record<string, string | null>[] = [
      { code_challenge_method: "plain" },
      { code_challenge_method: null },
      { code_challenge: "trop-court" },
      { scope: "openid profile" },
      { scope: "openid device:grant admin" },
      { response_type: "token" },
    ];
    for (const over of cases) {
      const res = await handleDeviceOidcAuthorize(
        new Request(authorizeUrl(over)),
        deps(user),
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get("error")).toMatch(
        /^(invalid_request|invalid_scope)$/,
      );
      expect(location.searchParams.get("state")).toBe("st-123");
      expect(location.searchParams.get("code")).toBeNull();
    }
    const scope = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl({ scope: "openid profile" })),
      deps(user),
    );
    expect(
      new URL(scope.headers.get("location") ?? "").searchParams.get("error"),
    ).toBe("invalid_scope");
    expect(await t.db.select().from(deviceOidcCodes)).toHaveLength(0);
  });

  it("membre du personnel sans double authentification : renvoyé vers la sécurité", async () => {
    const staff = await seedUser();
    await t.db
      .insert(staffAccounts)
      .values({ userId: staff.id, grantedBy: "admin" });
    const res = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl()),
      deps({ ...staff, twoFactorEnabled: false }),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/fr/compte/securite`);

    await t.db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, staff.id));
    const ok = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl()),
      deps({ ...staff, twoFactorEnabled: true }),
    );
    const okLocation = new URL(ok.headers.get("location") ?? "");
    expect(okLocation.origin + okLocation.pathname).toBe(REDIRECT);
  });

  it("flux complet (form-urlencoded et JSON) : nxo_…, id_token, empreintes seules en base", async () => {
    const user = await seedUser();
    for (const asJson of [false, true]) {
      const { res, verifier, challenge } = await authorize(user, {
        scope: "openid profile email device:grant",
        nonce: "n-0S6_WzA2Mj",
      });
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get("state")).toBe("st-123");
      const code = location.searchParams.get("code") ?? "";
      expect(code).toMatch(/^nxc_[A-Za-z0-9_-]{43}$/);

      // Le code n'est stocké qu'en empreinte.
      const codes = await t.db.select().from(deviceOidcCodes);
      const codeRow = codes.find(
        (r) => r.codeHash === createHash("sha256").update(code).digest("hex"),
      );
      expect(codeRow).toBeDefined();
      expect(codes.some((r) => r.codeHash === code)).toBe(false);
      expect(codeRow?.codeChallenge).toBe(challenge);
      expect(codeRow?.nonce).toBe("n-0S6_WzA2Mj");
      expect(codeRow?.consumedAt).toBeNull();
      expect((codeRow?.expiresAt.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(
        5 * 60 * 1000,
      );

      const tokenRes = await exchange(
        {
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: "lifecode-desktop",
          code_verifier: verifier,
        },
        asJson,
      );
      expect(tokenRes.status).toBe(200);
      expect(tokenRes.headers.get("cache-control")).toBe("no-store");
      expect(tokenRes.headers.get("pragma")).toBe("no-cache");
      const body = await tokenRes.json();
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(900);
      expect(body.scope).toBe("openid profile email device:grant");
      expect(body.access_token).toMatch(/^nxo_[A-Za-z0-9_-]{43}$/);
      expect(body.account).toEqual({
        id: codeRow?.organizationId,
        user_id: user.id,
        email: user.email,
        display_name: user.name,
      });

      // id_token : JWT HS256 signé avec le secret, nonce repris, compte lié.
      const [h, p, s] = String(body.id_token).split(".");
      expect(JSON.parse(Buffer.from(h, "base64url").toString()).alg).toBe(
        "HS256",
      );
      const claims = JSON.parse(Buffer.from(p, "base64url").toString());
      expect(claims).toMatchObject({
        iss: BASE,
        sub: user.id,
        aud: "lifecode-desktop",
        account_id: codeRow?.organizationId,
        email: user.email,
        name: user.name,
        nonce: "n-0S6_WzA2Mj",
      });
      expect(claims.exp - claims.iat).toBe(900);
      const { createHmac } = await import("node:crypto");
      const expectedSig = createHmac("sha256", SECRET)
        .update(`${h}.${p}`)
        .digest("base64url");
      expect(s).toBe(expectedSig);

      // Le jeton n'est stocké qu'en empreinte.
      const expectedTokenHash = createHash("sha256")
        .update(body.access_token)
        .digest("hex");
      const tokens = await t.db
        .select()
        .from(deviceOidcTokens)
        .where(eq(deviceOidcTokens.userId, user.id));
      expect(tokens.some((tok) => tok.tokenHash === body.access_token)).toBe(
        false,
      );
      const tokenRow = tokens.find(
        (tok) => tok.tokenHash === expectedTokenHash,
      );
      expect(tokenRow).toBeDefined();

      const principal = await authenticateDeviceOidcToken(
        t.db,
        body.access_token,
      );
      expect(principal).toEqual({
        tokenId: tokenRow?.id,
        userId: user.id,
        organizationId: codeRow?.organizationId,
        clientId: "lifecode-desktop",
        scopes: ["openid", "profile", "email", "device:grant"],
        email: user.email,
        displayName: user.name,
      });
    }
  });

  it("mauvais code_verifier : 400 invalid_grant, et le code est brûlé", async () => {
    const user = await seedUser();
    const { res, verifier } = await authorize(user);
    const code = new URL(res.headers.get("location") ?? "").searchParams.get(
      "code",
    ) ?? "";
    const wrong = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: "lifecode-desktop",
      code_verifier: randomBytes(48).toString("base64url"),
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ error: "invalid_grant" });

    const retry = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: "lifecode-desktop",
      code_verifier: verifier,
    });
    expect(retry.status).toBe(400);
    expect(await retry.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("mauvais redirect_uri ou client_id à l'échange : refusé", async () => {
    const user = await seedUser();
    const { res, verifier } = await authorize(user);
    const code = new URL(res.headers.get("location") ?? "").searchParams.get(
      "code",
    ) ?? "";
    const bad = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: "http://127.0.0.1:47382/callback",
      client_id: "lifecode-desktop",
      code_verifier: verifier,
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("code inconnu, corps mal formé, grant_type inattendu : 400", async () => {
    const form = {
      grant_type: "authorization_code",
      code: "nxc_inexistant",
      redirect_uri: REDIRECT,
      client_id: "lifecode-desktop",
      code_verifier: randomBytes(48).toString("base64url"),
    };
    const res = await exchange(form);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });

    const unsupported = await exchange({ ...form, grant_type: "password" });
    expect(unsupported.status).toBe(400);
    expect(await unsupported.json()).toMatchObject({
      error: "unsupported_grant_type",
    });

    const malformed = await handleDeviceOidcToken(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{pas du json",
      }),
      { db: t.db, baseUrl: BASE, signingSecret: SECRET },
    );
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid_request" });
  });

  it("code expiré : invalid_grant", async () => {
    const user = await seedUser();
    const clock = { now: Date.now() };
    const { verifier, challenge } = pkce();
    const res = await handleDeviceOidcAuthorize(
      new Request(authorizeUrl({ code_challenge: challenge })),
      deps(user, () => new Date(clock.now)),
    );
    const code = new URL(res.headers.get("location") ?? "").searchParams.get(
      "code",
    ) ?? "";
    clock.now += 301_000;
    const out = await handleDeviceOidcToken(
      new Request(`${BASE}/oauth/token`, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: "lifecode-desktop",
          code_verifier: verifier,
        }).toString(),
      }),
      {
        db: t.db,
        baseUrl: BASE,
        signingSecret: SECRET,
        now: () => new Date(clock.now),
      },
    );
    expect(out.status).toBe(400);
    expect(await out.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("rejeu séquentiel et concurrent : un seul échange réussit, les autres invalid_grant", async () => {
    const user = await seedUser();
    const { res, verifier } = await authorize(user);
    const code = new URL(res.headers.get("location") ?? "").searchParams.get(
      "code",
    ) ?? "";
    const form = {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: "lifecode-desktop",
      code_verifier: verifier,
    };
    const results = await Promise.all([
      exchange(form),
      exchange(form),
      exchange(form),
      exchange(form, true),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 400)).toHaveLength(3);
    for (const r of results.filter((r) => r.status === 400))
      expect(await r.json()).toMatchObject({ error: "invalid_grant" });

    const replay = await exchange(form);
    expect(replay.status).toBe(400);
    const body = await replay.json();
    expect(body).toMatchObject({ error: "invalid_grant" });
    expect(body.error_description).toMatch(/already used/i);

    // Un seul jeton émis.
    expect(
      await t.db
        .select()
        .from(deviceOidcTokens)
        .where(eq(deviceOidcTokens.userId, user.id)),
    ).toHaveLength(1);
  });

  it("authenticateDeviceOidcToken refuse jeton inconnu, expiré, révoqué ou sans la portée", async () => {
    expect(await authenticateDeviceOidcToken(t.db, "pas-un-jeton")).toBeNull();
    expect(await authenticateDeviceOidcToken(t.db, "nxo_inconnu")).toBeNull();

    const user = await seedUser();
    const { res, verifier } = await authorize(user);
    const code = new URL(res.headers.get("location") ?? "").searchParams.get(
      "code",
    ) ?? "";
    const tokenRes = await exchange({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id: "lifecode-desktop",
      code_verifier: verifier,
    });
    const { access_token } = await tokenRes.json();
    expect(await authenticateDeviceOidcToken(t.db, access_token)).not.toBeNull();
    // Portée exigée absente du jeton.
    expect(
      await authenticateDeviceOidcToken(t.db, access_token, "admin"),
    ).toBeNull();
    // Expiré (horloge future de 16 minutes).
    expect(
      await authenticateDeviceOidcToken(
        t.db,
        access_token,
        "device:grant",
        new Date(Date.now() + 16 * 60 * 1000),
      ),
    ).toBeNull();
    // Révoqué.
    await t.db
      .update(deviceOidcTokens)
      .set({ revokedAt: new Date() })
      .where(eq(deviceOidcTokens.userId, user.id));
    expect(await authenticateDeviceOidcToken(t.db, access_token)).toBeNull();
  });

  it("les clients natifs autorisés couvrent LifeCode (desktop/CLI) et Creative Studio", () => {
    expect([...ALLOWED_NATIVE_CLIENTS].sort()).toEqual([
      "creative-studio-desktop",
      "lifecode-cli",
      "lifecode-desktop",
      "nexora-lifecode-cli",
    ]);
  });
});
