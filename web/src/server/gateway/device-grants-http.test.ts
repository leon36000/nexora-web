/**
 * Tests d'intégration HTTP des accès d'appareil (`device-grants-http.ts`),
 * du flux OIDC PKCE natif (`device-oidc.ts`) et de la passerelle `/v1/*` (`proxy.ts`).
 */
import { createHash, randomBytes } from "node:crypto";
import {
  credit,
  creditAccounts,
  eq,
  gatewayDeviceGrants,
  members,
  organizations,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type DeviceOidcDeps,
  type DeviceOidcSessionUser,
  type DeviceOidcTokenDeps,
  handleDeviceOidcAuthorize,
  handleDeviceOidcToken,
} from "../auth/device-oidc";
import {
  type DeviceGrantsHttpDeps,
  handleAccountBalance,
  handleAccountUsage,
  handleCreateDeviceGrant,
  handleGetDeviceGrant,
  handleListDeviceGrants,
  handleRevokeAllDeviceGrants,
  handleRevokeDeviceGrant,
  handleRevokeSelfDeviceGrant,
  handleRotateDeviceGrant,
  handleRotateSelfDeviceGrant,
} from "./device-grants-http";
import { requestCost } from "./pricing";
import {
  type GatewayDeps,
  handleChatCompletions,
  handleModels,
  resetModelsCache,
} from "./proxy";
import { publishTestCatalog, testPrivacyRouter } from "./test-support";

const SITE_URL = "https://nexora.test";
const AUTH_SECRET = "s".repeat(48);
const REDIRECT_URI = "http://127.0.0.1:47381/callback";
const CLIENT_ID = "lifecode-cli";
const MASTER_KEY = "sk-master-litellm-key-1234567890";
const M = 1_000_000n;
const PRICE = { input: 1_000_000n, output: 3_000_000n, cache: null };

const dbAvailable = Boolean(
  process.env.NEXORA_TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
if (!dbAvailable) {
  console.warn(
    "device-grants-http : tests d'intégration ignorés (NEXORA_TEST_DATABASE_URL / DATABASE_URL absent).",
  );
}

const makePkce = () => {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return { verifier, challenge };
};

describe.skipIf(!dbAvailable)(
  "device-grants-http : OIDC PKCE, gestion HTTP des grants et intégration passerelle /v1/*",
  () => {
    let t: TestDatabase;
    let currentNow = new Date();
    let reqCounter = 0;

    let upstreamUsage = {
      prompt_tokens: 120,
      completion_tokens: 40,
      total_tokens: 160,
    };

    beforeAll(async () => {
      t = await createTestDatabase();
      resetModelsCache();
      await publishTestCatalog(t.db, [{ publicId: "nexora/test-chat" }]);
    });

    afterAll(async () => {
      resetModelsCache();
      await t.drop();
    });

    async function seedUserAndOrg(options: { creditCad?: bigint } = {}) {
      const suffix = randomBytes(6).toString("hex");
      const userId = `usr_${suffix}`;
      const orgId = `org_${suffix}`;
      const email = `dev-${suffix}@nexora.test`;

      await t.db.insert(users).values({
        id: userId,
        email,
        emailVerified: true,
        name: `Dev ${suffix}`,
      });
      await t.db.insert(organizations).values({
        id: orgId,
        name: `Org ${suffix}`,
        slug: `org-${suffix}`,
      });
      await t.db.insert(members).values({
        id: `mem_${suffix}`,
        organizationId: orgId,
        userId,
        role: "owner",
      });

      if (options.creditCad && options.creditCad > 0n) {
        await credit(t.db, {
          organizationId: orgId,
          amountMicro: options.creditCad * M,
          idempotencyKey: `fund:${orgId}`,
          configVersion: "test",
          source: "test",
        });
      }

      return { userId, orgId, email, name: `Dev ${suffix}` };
    }

    function makeOidcDeps(
      sessionUser: DeviceOidcSessionUser | null,
    ): DeviceOidcDeps & DeviceOidcTokenDeps {
      return {
        db: t.db,
        baseUrl: SITE_URL,
        signingSecret: AUTH_SECRET,
        now: () => currentNow,
        getSessionUser: async () => sessionUser,
      };
    }

    function makeHttpDeps(
      sessionCtx: {
        userId: string;
        organizationId: string;
        role: "owner" | "admin" | "member";
      } | null = null,
    ): DeviceGrantsHttpDeps {
      return {
        db: () => t.db,
        siteUrl: SITE_URL,
        now: () => currentNow,
        log: createLogger({
          name: "device-grants-http-test",
          sink: () => undefined,
        }),
        getSessionContext: async () => sessionCtx,
      };
    }

    function makeGatewayDeps(): GatewayDeps {
      return {
        db: () => t.db,
        fetch: (async () =>
          Response.json({
            id: "gen-dg-1",
            object: "chat.completion",
            created: Math.floor(currentNow.getTime() / 1000),
            model: "nexora/test-chat",
            provider: "Wafer",
            choices: [
              {
                index: 0,
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "Bonjour depuis Nexora !",
                },
              },
            ],
            usage: {
              ...upstreamUsage,
              cost: 0.05,
              cost_details: { upstream_inference_cost: 0.04 },
              is_byok: false,
            },
          })) as typeof fetch,
        litellm: () => ({
          baseUrl: "http://litellm.internal:4000",
          masterKey: MASTER_KEY,
        }),
        log: createLogger({ name: "gateway-test", sink: () => undefined }),
        now: () => currentNow,
        privacy: testPrivacyRouter(t.db),
        requestId: () => `req_dg_test_${++reqCounter}`,
        limits: {
          defaultRpm: 1_000,
          defaultTpm: 10_000_000,
          maxBodyBytes: 1_000_000,
          upstreamTimeoutMs: 10_000,
          streamTimeoutMs: 10_000,
          defaultMaxOutputTokens: 1_000,
        },
      };
    }

    async function issueOidcAccessToken(account: {
      userId: string;
      orgId: string;
      email: string;
      name: string;
    }): Promise<string> {
      const { verifier, challenge } = makePkce();
      const state = randomBytes(16).toString("hex");
      const oidcDeps = makeOidcDeps({
        id: account.userId,
        email: account.email,
        name: account.name,
        activeOrganizationId: account.orgId,
      });

      const authUrl = new URL(`${SITE_URL}/oauth/authorize`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set(
        "scope",
        "openid profile email lifecode:device-grant",
      );
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", challenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const authRes = await handleDeviceOidcAuthorize(
        new Request(authUrl.toString(), { method: "GET" }),
        oidcDeps,
      );
      expect(authRes.status).toBe(302);
      const location = authRes.headers.get("location");
      expect(location).toBeTruthy();
      const redirected = new URL(location!);
      expect(redirected.searchParams.get("state")).toBe(state);
      const code = redirected.searchParams.get("code");
      expect(code).toBeTruthy();

      const tokenRes = await handleDeviceOidcToken(
        new Request(`${SITE_URL}/oauth/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code: code!,
            redirect_uri: REDIRECT_URI,
            code_verifier: verifier,
          }),
        }),
        oidcDeps,
      );
      expect(tokenRes.status).toBe(200);
      const tokenBody = (await tokenRes.json()) as {
        access_token: string;
        token_type: string;
        scope: string;
        id_token?: string;
      };
      expect(tokenBody.access_token).toMatch(/^nxo_/);
      expect(tokenBody.token_type.toLowerCase()).toBe("bearer");
      return tokenBody.access_token;
    }

    it("1) exécute le flux OIDC PKCE complet (scope lifecode:device-grant) puis émet un grant 201 nxk_...", async () => {
      currentNow = new Date();
      const account = await seedUserAndOrg({ creditCad: 5n });
      const nxoToken = await issueOidcAccessToken(account);
      const httpDeps = makeHttpDeps();

      const createRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "macbook-pro-m3-01",
            device_label: "MacBook Pro de test",
            product: "lifecode",
          }),
        }),
        httpDeps,
      );

      expect(createRes.status).toBe(201);
      const body = (await createRes.json()) as {
        key: string;
        grant_id: string;
        organization_id: string;
        device_id: string;
        device_label: string;
        product: string;
        expires_at: string;
      };
      expect(body.key).toMatch(/^nxk_/);
      expect(body.grant_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(body.organization_id).toBe(account.orgId);
      expect(body.device_id).toBe("macbook-pro-m3-01");
      expect(body.device_label).toBe("MacBook Pro de test");
      expect(body.product).toBe("lifecode");
    });

    it("2) refuse sans jeton (401), refuse nxk_ sur création (403 insufficient_scope), et valide le JSON / device_id (400)", async () => {
      currentNow = new Date();
      const account = await seedUserAndOrg({ creditCad: 5n });
      const nxoToken = await issueOidcAccessToken(account);
      const httpDeps = makeHttpDeps(null);

      // Sans jeton (avec Origin valide pour franchir le garde CSRF et vérifier le 401 d'auth)
      const unauthRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            origin: SITE_URL,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "dev-unauth",
            device_label: "Appareil non authentifié",
          }),
        }),
        httpDeps,
      );
      expect(unauthRes.status).toBe(401);

      // Création initiale valide pour obtenir une clé nxk_...
      const issuedRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "dev-initial",
            device_label: "Appareil initial",
          }),
        }),
        httpDeps,
      );
      expect(issuedRes.status).toBe(201);
      const issued = (await issuedRes.json()) as { key: string };

      // Tentative de création d'un nouveau grant avec Bearer nxk_... -> 403 insufficient_scope
      const nxkCreateRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${issued.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "dev-escalade",
            device_label: "Tentative escalade",
          }),
        }),
        httpDeps,
      );
      expect(nxkCreateRes.status).toBe(403);
      const nxkErr = (await nxkCreateRes.json()) as {
        code: string;
        error: { code: string };
      };
      expect(nxkErr.code).toBe("insufficient_scope");
      expect(nxkErr.error.code).toBe("insufficient_scope");

      // JSON invalide -> 400
      const badJsonRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: "{ json invalide",
        }),
        httpDeps,
      );
      expect(badJsonRes.status).toBe(400);

      // device_id absent -> 400
      const missingDeviceIdRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_label: "Sans identifiant d'appareil",
          }),
        }),
        httpDeps,
      );
      expect(missingDeviceIdRes.status).toBe(400);
    });

    it("3) gère list (sans key), get, rotate, rotateSelf (nxk_ + grace_period_seconds: 60), revoke (POST et DELETE) et revokeSelf", async () => {
      currentNow = new Date();
      const account = await seedUserAndOrg({ creditCad: 10n });
      const nxoToken = await issueOidcAccessToken(account);
      const httpDeps = makeHttpDeps();

      const createGrant = async (deviceId: string, label: string) => {
        const res = await handleCreateDeviceGrant(
          new Request(`${SITE_URL}/v1/device-grants`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${nxoToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              device_id: deviceId,
              device_label: label,
            }),
          }),
          httpDeps,
        );
        expect(res.status).toBe(201);
        return (await res.json()) as {
          key: string;
          grant_id: string;
        };
      };

      const g1 = await createGrant("dev-1", "Poste Bureau 1");
      const g2 = await createGrant("dev-2", "Poste Bureau 2");
      const g3 = await createGrant("dev-3", "Poste Bureau 3");

      // handleListDeviceGrants : aucun champ `key` ni `keyHash` exposé
      const listRes = await handleListDeviceGrants(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "GET",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        httpDeps,
      );
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as {
        object: string;
        data: Array<Record<string, unknown>>;
        grants: Array<Record<string, unknown>>;
      };
      expect(listBody.object).toBe("list");
      expect(listBody.grants.length).toBe(3);
      for (const item of listBody.grants) {
        expect(item).not.toHaveProperty("key");
        expect(item).not.toHaveProperty("keyHash");
      }

      // handleGetDeviceGrant (par UUID et via "current" avec Bearer nxk_...)
      const getRes = await handleGetDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants/${g1.grant_id}`, {
          method: "GET",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        g1.grant_id,
        httpDeps,
      );
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as Record<string, unknown>;
      expect(getBody.grant_id).toBe(g1.grant_id);
      expect(getBody).not.toHaveProperty("key");

      // handleRotateDeviceGrant (par identifiant de grant)
      const rotateRes = await handleRotateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants/${g1.grant_id}/rotate`, {
          method: "POST",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        g1.grant_id,
        httpDeps,
      );
      expect(rotateRes.status).toBe(200);
      const rotated1 = (await rotateRes.json()) as {
        key: string;
        grant_id: string;
      };
      expect(rotated1.grant_id).toBe(g1.grant_id);
      expect(rotated1.key).toMatch(/^nxk_/);
      expect(rotated1.key).not.toBe(g1.key);

      // handleRotateSelfDeviceGrant avec Bearer nxk_... et grace_period_seconds: 60
      const rotateTime = new Date(currentNow.getTime() + 1_000);
      currentNow = rotateTime;
      const selfRotateRes = await handleRotateSelfDeviceGrant(
        new Request(`${SITE_URL}/v1/account/device-grants/rotate`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${rotated1.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ grace_period_seconds: 60 }),
        }),
        httpDeps,
      );
      expect(selfRotateRes.status).toBe(200);
      const rotatedSelf = (await selfRotateRes.json()) as {
        key: string;
        grant_id: string;
        grace_expires_at: string | null;
      };
      expect(rotatedSelf.grant_id).toBe(g1.grant_id);
      expect(rotatedSelf.key).toMatch(/^nxk_/);
      expect(rotatedSelf.key).not.toBe(rotated1.key);
      expect(rotatedSelf.grace_expires_at).toBe(
        new Date(rotateTime.getTime() + 60_000).toISOString(),
      );

      // L'ancienne clé (rotated1.key) reste valide pendant la fenêtre de grâce de 60s
      const duringGraceBalance = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance`, {
          method: "GET",
          headers: { authorization: `Bearer ${rotated1.key}` },
        }),
        httpDeps,
      );
      expect(duringGraceBalance.status).toBe(200);

      // handleRevokeDeviceGrant en POST sur g1
      const revokePostRes = await handleRevokeDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants/${g1.grant_id}/revoke`, {
          method: "POST",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        g1.grant_id,
        httpDeps,
      );
      expect(revokePostRes.status).toBe(200);
      expect(await revokePostRes.json()).toEqual({
        revoked: true,
        grant_id: g1.grant_id,
      });

      // handleRevokeDeviceGrant en DELETE sur g2
      const revokeDeleteRes = await handleRevokeDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants/${g2.grant_id}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        g2.grant_id,
        httpDeps,
      );
      expect(revokeDeleteRes.status).toBe(200);
      expect(await revokeDeleteRes.json()).toEqual({
        revoked: true,
        grant_id: g2.grant_id,
      });

      // handleRevokeSelfDeviceGrant avec Bearer nxk_... sur g3
      const revokeSelfRes = await handleRevokeSelfDeviceGrant(
        new Request(`${SITE_URL}/v1/account/device-grants/revoke`, {
          method: "POST",
          headers: { authorization: `Bearer ${g3.key}` },
        }),
        httpDeps,
      );
      expect(revokeSelfRes.status).toBe(200);
      expect(await revokeSelfRes.json()).toEqual({
        revoked: true,
        grant_id: g3.grant_id,
      });

      // Liste active désormais vide
      const activeAfterRevoke = await handleListDeviceGrants(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "GET",
          headers: { authorization: `Bearer ${nxoToken}` },
        }),
        httpDeps,
      );
      const activeListBody = (await activeAfterRevoke.json()) as {
        grants: unknown[];
      };
      expect(activeListBody.grants).toHaveLength(0);
    });

    it("4) s'intègre réellement à la passerelle /v1/* : chat 200, débit exact + usage, scopes webpilot -> 403 model_not_allowed, spend_cap_cad -> 402, révocation -> 401 immédiat", async () => {
      currentNow = new Date();
      upstreamUsage = {
        prompt_tokens: 120,
        completion_tokens: 40,
        total_tokens: 160,
      };
      const account = await seedUserAndOrg({ creditCad: 10n });
      const nxoToken = await issueOidcAccessToken(account);
      const httpDeps = makeHttpDeps();
      const gwDeps = makeGatewayDeps();

      // Émet un grant standard pour cet appareil
      const createRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "workstation-gateway-1",
            device_label: "Station Passerelle",
          }),
        }),
        httpDeps,
      );
      expect(createRes.status).toBe(201);
      const mainGrant = (await createRes.json()) as {
        key: string;
        grant_id: string;
      };

      // Vérifie aussi l'accès à /v1/models avec la clé du grant
      const modelsRes = await handleModels(
        new Request(`${SITE_URL}/v1/models`, {
          method: "GET",
          headers: { authorization: `Bearer ${mainGrant.key}` },
        }),
        gwDeps,
      );
      expect(modelsRes.status).toBe(200);
      const modelsBody = (await modelsRes.json()) as {
        data: Array<{ id: string }>;
      };
      expect(modelsBody.data.some((m) => m.id === "nexora/test-chat")).toBe(
        true,
      );

      // Appelle handleChatCompletions avec Bearer ${key} -> 200
      const chatRes = await handleChatCompletions(
        new Request(`${SITE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${mainGrant.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "nexora/test-chat",
            messages: [{ role: "user", content: "Bonjour Nexora !" }],
            max_tokens: 200,
          }),
        }),
        gwDeps,
      );
      expect(chatRes.status).toBe(200);

      const expectedCostMicro = Number(
        requestCost(
          {
            prompt: 120,
            completion: 40,
            cached: 0,
          },
          PRICE,
        ),
      );
      expect(expectedCostMicro).toBeGreaterThan(0);

      // Vérifie le débit exact via handleAccountBalance (Bearer ${key})
      const balanceRes = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance`, {
          method: "GET",
          headers: { authorization: `Bearer ${mainGrant.key}` },
        }),
        httpDeps,
      );
      expect(balanceRes.status).toBe(200);
      const balanceBody = (await balanceRes.json()) as {
        balance_micros: number;
        total_balance_micros: number;
        reserved_micros: number;
        currency: string;
        can_use_models: boolean;
      };
      expect(balanceBody.currency).toBe("CAD");
      expect(balanceBody.reserved_micros).toBe(0);
      expect(balanceBody.balance_micros).toBe(10_000_000 - expectedCostMicro);
      expect(balanceBody.total_balance_micros).toBe(
        10_000_000 - expectedCostMicro,
      );
      expect(balanceBody.can_use_models).toBe(true);

      // Vérifie les jetons et le coût comptabilisés via handleAccountUsage (Bearer ${key})
      const usageRes = await handleAccountUsage(
        new Request(`${SITE_URL}/v1/account/usage`, {
          method: "GET",
          headers: { authorization: `Bearer ${mainGrant.key}` },
        }),
        httpDeps,
      );
      expect(usageRes.status).toBe(200);
      const usageJson = (await usageRes.json()) as {
        events: Array<{
          model: string;
          poste: string;
          input_tokens: number;
          output_tokens: number;
          cost_micros: number;
        }>;
      };
      expect(usageJson.events).toHaveLength(1);
      expect(usageJson.events[0]).toMatchObject({
        model: "nexora/test-chat",
        poste: "turn",
        input_tokens: 120,
        output_tokens: 40,
        cost_micros: expectedCostMicro,
      });

      // Grant créé avec scopes: ["webpilot"] (sans models) -> handleModels vide + 404 model_not_found sur handleChatCompletions
      const webpilotOnlyRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "webpilot-only-device",
            device_label: "Appareil WebPilot uniquement",
            scopes: ["webpilot"],
          }),
        }),
        httpDeps,
      );
      expect(webpilotOnlyRes.status).toBe(201);
      const webpilotGrant = (await webpilotOnlyRes.json()) as { key: string };

      const webpilotModelsRes = await handleModels(
        new Request(`${SITE_URL}/v1/models`, {
          method: "GET",
          headers: { authorization: `Bearer ${webpilotGrant.key}` },
        }),
        gwDeps,
      );
      expect(webpilotModelsRes.status).toBe(200);
      const webpilotModelsBody = (await webpilotModelsRes.json()) as {
        data: unknown[];
      };
      expect(webpilotModelsBody.data).toHaveLength(0);

      const forbiddenChatRes = await handleChatCompletions(
        new Request(`${SITE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${webpilotGrant.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "nexora/test-chat",
            messages: [{ role: "user", content: "Test refus modèle" }],
            max_tokens: 50,
          }),
        }),
        gwDeps,
      );
      expect(forbiddenChatRes.status).toBe(404);
      const forbiddenChatErr = (await forbiddenChatRes.json()) as {
        error: { code: string };
      };
      expect(forbiddenChatErr.error.code).toBe("model_not_found");

      // Grant créé avec spend_cap_cad: 0.000001 (1 micro-CAD) -> 402 quand la réservation dépasse son plafond
      const cappedGrantRes = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "tiny-cap-device",
            device_label: "Appareil Plafond 1 micro-CAD",
            spend_cap_cad: 0.000001,
          }),
        }),
        httpDeps,
      );
      expect(cappedGrantRes.status).toBe(201);
      const cappedGrant = (await cappedGrantRes.json()) as { key: string };

      const capExceededRes = await handleChatCompletions(
        new Request(`${SITE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${cappedGrant.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "nexora/test-chat",
            messages: [{ role: "user", content: "Test dépassement plafond" }],
            max_tokens: 200,
          }),
        }),
        gwDeps,
      );
      expect(capExceededRes.status).toBe(402);

      // Révoque mainGrant -> handleChatCompletions ET handleAccountBalance renvoient immédiatement 401
      const revokeMainRes = await handleRevokeDeviceGrant(
        new Request(
          `${SITE_URL}/v1/device-grants/${mainGrant.grant_id}/revoke`,
          {
            method: "POST",
            headers: { authorization: `Bearer ${nxoToken}` },
          },
        ),
        mainGrant.grant_id,
        httpDeps,
      );
      expect(revokeMainRes.status).toBe(200);

      const chatAfterRevoke = await handleChatCompletions(
        new Request(`${SITE_URL}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${mainGrant.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "nexora/test-chat",
            messages: [{ role: "user", content: "Après révocation" }],
            max_tokens: 50,
          }),
        }),
        gwDeps,
      );
      expect(chatAfterRevoke.status).toBe(401);

      const balanceAfterRevoke = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance`, {
          method: "GET",
          headers: { authorization: `Bearer ${mainGrant.key}` },
        }),
        httpDeps,
      );
      expect(balanceAfterRevoke.status).toBe(401);
    });

    it("5) renvoie les messages d'erreur bilingues FR/EN (Accept-Language: en-CA et ?lang=en) sur 401, 402 et 403", async () => {
      currentNow = new Date();
      const account = await seedUserAndOrg({ creditCad: 5n });
      const nxoToken = await issueOidcAccessToken(account);
      const httpDeps = makeHttpDeps();

      type ErrorBody = {
        code: string;
        error: {
          code: string;
          type: string;
          status: number;
          message: string;
          message_fr: string;
          message_en: string;
        };
      };

      const expectBilingual = (body: ErrorBody, status: number, code: string) => {
        expect(body.error.code).toBe(code);
        expect(body.error.status).toBe(status);
        expect(body.error.message_fr.length).toBeGreaterThan(0);
        expect(body.error.message_en.length).toBeGreaterThan(0);
        expect(body.error.message_fr).not.toBe(body.error.message_en);
      };

      // --- 401 : jeton absent (invalid_api_key, authentication_error)
      const unauthBody = JSON.stringify({
        device_id: "bilingual-401",
        device_label: "Appareil bilingue 401",
      });

      const unauthFr = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            origin: SITE_URL,
            "content-type": "application/json",
            "accept-language": "fr-CA,fr;q=0.9",
          },
          body: unauthBody,
        }),
        httpDeps,
      );
      expect(unauthFr.status).toBe(401);
      const unauthFrBody = (await unauthFr.json()) as ErrorBody;
      expectBilingual(unauthFrBody, 401, "invalid_api_key");
      expect(unauthFrBody.error.type).toBe("authentication_error");
      expect(unauthFrBody.error.message).toBe(unauthFrBody.error.message_fr);
      expect(unauthFrBody.error.message).toBe(
        "Jeton ou clé API invalide ou absent.",
      );

      const unauthHeaderEn = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            origin: SITE_URL,
            "content-type": "application/json",
            "accept-language": "en-CA",
          },
          body: unauthBody,
        }),
        httpDeps,
      );
      expect(unauthHeaderEn.status).toBe(401);
      const unauthHeaderEnBody = (await unauthHeaderEn.json()) as ErrorBody;
      expectBilingual(unauthHeaderEnBody, 401, "invalid_api_key");
      expect(unauthHeaderEnBody.error.message).toBe(
        unauthHeaderEnBody.error.message_en,
      );
      expect(unauthHeaderEnBody.error.message).toBe(
        "Invalid or missing token or API key.",
      );

      const unauthQueryEn = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants?lang=en`, {
          method: "POST",
          headers: {
            origin: SITE_URL,
            "content-type": "application/json",
            "accept-language": "fr-CA",
          },
          body: unauthBody,
        }),
        httpDeps,
      );
      expect(unauthQueryEn.status).toBe(401);
      const unauthQueryEnBody = (await unauthQueryEn.json()) as ErrorBody;
      expectBilingual(unauthQueryEnBody, 401, "invalid_api_key");
      expect(unauthQueryEnBody.error.message).toBe(
        "Invalid or missing token or API key.",
      );

      // --- 402 : solde débiteur (account_blocked, billing_error) sur /v1/account/balance
      const blocked = await seedUserAndOrg();
      await t.db.insert(creditAccounts).values({
        organizationId: blocked.orgId,
        balanceMicro: -1_000_000n,
      });
      const blockedToken = await issueOidcAccessToken(blocked);

      const balanceFr = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance`, {
          method: "GET",
          headers: { authorization: `Bearer ${blockedToken}` },
        }),
        httpDeps,
      );
      expect(balanceFr.status).toBe(402);
      const balanceFrBody = (await balanceFr.json()) as ErrorBody;
      expectBilingual(balanceFrBody, 402, "account_blocked");
      expect(balanceFrBody.error.type).toBe("billing_error");
      expect(balanceFrBody.error.message).toBe(balanceFrBody.error.message_fr);
      expect(balanceFrBody.error.message).toBe(
        "Le compte de facturation est bloqué (solde débiteur). Rechargez votre compte pour continuer.",
      );

      const balanceHeaderEn = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${blockedToken}`,
            "accept-language": "en-CA",
          },
        }),
        httpDeps,
      );
      expect(balanceHeaderEn.status).toBe(402);
      const balanceHeaderEnBody = (await balanceHeaderEn.json()) as ErrorBody;
      expectBilingual(balanceHeaderEnBody, 402, "account_blocked");
      expect(balanceHeaderEnBody.error.message).toBe(
        "The billing account is blocked (negative balance). Add funds to continue.",
      );
      expect(balanceHeaderEnBody.error.message).toBe(
        balanceHeaderEnBody.error.message_en,
      );

      const balanceQueryEn = await handleAccountBalance(
        new Request(`${SITE_URL}/v1/account/balance?lang=en`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${blockedToken}`,
            "accept-language": "fr",
          },
        }),
        httpDeps,
      );
      expect(balanceQueryEn.status).toBe(402);
      const balanceQueryEnBody = (await balanceQueryEn.json()) as ErrorBody;
      expectBilingual(balanceQueryEnBody, 402, "account_blocked");
      expect(balanceQueryEnBody.error.message).toBe(
        "The billing account is blocked (negative balance). Add funds to continue.",
      );

      // --- 403 : accès refusé (permission_error) pour une session non owner/admin sur revokeAll
      const memberDeps = makeHttpDeps({
        userId: account.userId,
        organizationId: account.orgId,
        role: "member",
      });

      const forbiddenFr = await handleRevokeAllDeviceGrants(
        new Request(`${SITE_URL}/v1/account/device-grants`, {
          method: "DELETE",
          headers: { origin: SITE_URL, "accept-language": "fr" },
        }),
        memberDeps,
      );
      expect(forbiddenFr.status).toBe(403);
      const forbiddenFrBody = (await forbiddenFr.json()) as ErrorBody;
      expectBilingual(forbiddenFrBody, 403, "forbidden");
      expect(forbiddenFrBody.error.type).toBe("permission_error");
      expect(forbiddenFrBody.error.message).toBe(forbiddenFrBody.error.message_fr);
      expect(forbiddenFrBody.error.message).toBe("Accès refusé.");

      const forbiddenHeaderEn = await handleRevokeAllDeviceGrants(
        new Request(`${SITE_URL}/v1/account/device-grants`, {
          method: "DELETE",
          headers: { origin: SITE_URL, "accept-language": "en-CA" },
        }),
        memberDeps,
      );
      expect(forbiddenHeaderEn.status).toBe(403);
      const forbiddenHeaderEnBody = (await forbiddenHeaderEn.json()) as ErrorBody;
      expectBilingual(forbiddenHeaderEnBody, 403, "forbidden");
      expect(forbiddenHeaderEnBody.error.message).toBe("Access denied.");
      expect(forbiddenHeaderEnBody.error.message).toBe(
        forbiddenHeaderEnBody.error.message_en,
      );

      const forbiddenQueryEn = await handleRevokeAllDeviceGrants(
        new Request(`${SITE_URL}/v1/account/device-grants?lang=en`, {
          method: "DELETE",
          headers: { origin: SITE_URL, "accept-language": "fr" },
        }),
        memberDeps,
      );
      expect(forbiddenQueryEn.status).toBe(403);
      const forbiddenQueryEnBody = (await forbiddenQueryEn.json()) as ErrorBody;
      expectBilingual(forbiddenQueryEnBody, 403, "forbidden");
      expect(forbiddenQueryEnBody.error.message).toBe("Access denied.");

      // --- 403 insufficient_scope : clé d'appareil sans portée usage:read sur /v1/account/usage
      // (la persistance n'expose pas de refus `usage` : on pose directement `usage: false` sur le grant)
      const scopedCreate = await handleCreateDeviceGrant(
        new Request(`${SITE_URL}/v1/device-grants`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${nxoToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            device_id: "bilingual-scope",
            device_label: "Appareil bilingue portée",
          }),
        }),
        httpDeps,
      );
      expect(scopedCreate.status).toBe(201);
      const scopedGrant = (await scopedCreate.json()) as {
        key: string;
        grant_id: string;
      };
      const updated = await t.db
        .update(gatewayDeviceGrants)
        .set({ scopes: { usage: false } })
        .where(eq(gatewayDeviceGrants.id, scopedGrant.grant_id));
      expect(updated).toBeDefined();

      const scopeFr = await handleAccountUsage(
        new Request(`${SITE_URL}/v1/account/usage`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${scopedGrant.key}`,
            "accept-language": "fr",
          },
        }),
        httpDeps,
      );
      expect(scopeFr.status).toBe(403);
      const scopeFrBody = (await scopeFr.json()) as ErrorBody;
      expectBilingual(scopeFrBody, 403, "insufficient_scope");
      expect(scopeFrBody.error.message).toBe(scopeFrBody.error.message_fr);
      expect(scopeFrBody.error.message).toBe(
        "Cette clé d'appareil ne dispose pas de la portée requise (usage:read).",
      );

      const scopeHeaderEn = await handleAccountUsage(
        new Request(`${SITE_URL}/v1/account/usage`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${scopedGrant.key}`,
            "accept-language": "en-CA",
          },
        }),
        httpDeps,
      );
      expect(scopeHeaderEn.status).toBe(403);
      const scopeHeaderEnBody = (await scopeHeaderEn.json()) as ErrorBody;
      expectBilingual(scopeHeaderEnBody, 403, "insufficient_scope");
      expect(scopeHeaderEnBody.error.message).toBe(
        "This device key lacks the required scope (usage:read).",
      );

      const scopeQueryEn = await handleAccountUsage(
        new Request(`${SITE_URL}/v1/account/usage?lang=en`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${scopedGrant.key}`,
            "accept-language": "fr",
          },
        }),
        httpDeps,
      );
      expect(scopeQueryEn.status).toBe(403);
      const scopeQueryEnBody = (await scopeQueryEn.json()) as ErrorBody;
      expectBilingual(scopeQueryEnBody, 403, "insufficient_scope");
      expect(scopeQueryEnBody.error.message).toBe(
        "This device key lacks the required scope (usage:read).",
      );
    });
  },
);
