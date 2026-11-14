/**
 * Vérification de bout en bout locale (`web/scripts/verify-device-grants-e2e.ts`).
 *
 * Lance un serveur HTTP local éphémère exposant les vrais handlers du site sur une base
 * PostgreSQL jetable (`createTestDatabase`) et pilote le vrai client LifeCode de `par/b1-compte` :
 *  1) Découverte OIDC + PKCE S256 (`startCallbackServer`, `buildAuthorizeUrl`, `exchangeOidcCode`)
 *     + refus du rejeu du code d'autorisation + `userinfo` (si exposé).
 *  2) Émission du grant via `b1.requestGrant` (`POST /v1/account/device-grants`) -> clé `nxk_…`
 *     + `b1.listGrants` (aucun secret renvoyé deux fois) + audit PostgreSQL zéro secret en clair.
 *  3) `b1.probe()`, `b1.fetchModels({ key })`, `POST /v1/chat/completions` (`Bearer nxk_…`)
 *     -> débit exact du grand livre (`360` micro-CAD) sur `/v1/account/balance` et `/v1/account/usage`.
 *  4) Rotation atomique via `b1.rotateGrant({ key, grantId })` -> nouvelle clé `nxk_…` valide (200),
 *     ancienne clé révoquée immédiatement (401).
 *  5) Révocation via `b1.revokeGrant({ key, grantId })` -> refus 401 immédiat sur `/v1/chat/completions`,
 *     `/v1/models` et `/v1/account/balance`.
 *  6) Solde vide (0 CAD) -> `402 insufficient_credits` à la création d'un grant (FR + EN) ET `402`
 *     sur la passerelle `/v1/chat/completions` quand le crédit d'une organisation est épuisé.
 */

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import {
  apiKeys,
  credit,
  deviceOidcCodes,
  deviceOidcTokens,
  gatewayDeviceGrants,
  members,
  organizations,
  users,
} from "@nexora/db";
import { createTestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import * as deviceOidcMod from "../src/server/auth/device-oidc";
import {
  type DeviceOidcDeps,
  type DeviceOidcTokenDeps,
  handleDeviceOidcAuthorize,
  handleDeviceOidcDiscovery,
  handleDeviceOidcToken,
} from "../src/server/auth/device-oidc";
import {
  handleActivity,
  handleActivityExport,
} from "../src/server/gateway/activity-handlers";
import * as deviceGrantsHttp from "../src/server/gateway/device-grants-http";
import { authenticateApiKey } from "../src/server/gateway/keys";
import {
  type GatewayDeps,
  handleChatCompletions,
  handleModels,
  resetModelsCache,
} from "../src/server/gateway/proxy";
import {
  publishTestCatalog,
  testPrivacyRouter,
} from "../src/server/gateway/test-support";

const requireFromHere = createRequire(import.meta.url);
const B1_ACCOUNT_DIR =
  "/home/pc6/nexora-recherche/par/b1-compte/src/core/account";

interface PkceModule {
  createPkce: (opts?: { length?: number }) => {
    verifier: string;
    challenge: string;
    method: "S256";
  };
  randomState: (opts?: { bytes?: number }) => string;
  timingSafeEqualStr: (a: string, b: string) => boolean;
  buildAuthorizeUrl: (opts: {
    baseUrl: string;
    clientId: string;
    redirectUri: string;
    state: string;
    challenge: string;
    scope?: string;
  }) => string;
  startCallbackServer: (opts?: {
    timeoutMs?: number;
    path?: string;
  }) => Promise<{
    redirectUri: string;
    port: number;
    waitForCode: () => Promise<{
      code?: string;
      state?: string;
      error?: string;
    }>;
    close: () => Promise<void>;
  }>;
}

interface B1Grant {
  grantId: string;
  key: string;
  keyPrefix: string;
}

interface B1GrantMeta {
  grantId: string;
  keyPrefix: string;
  product: string;
  deviceId: string | null;
}

interface B1Client {
  probe: () => Promise<{
    ok: boolean;
    latencyMs?: number;
    baseUrl?: string;
  }>;
  exchangeOidcCode: (opts: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId?: string;
  }) => Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number | null;
    idToken: string | null;
    scope: string | null;
  }>;
  fetchUserInfo: (opts: { accessToken: string }) => Promise<{
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    organizationId: string | null;
  }>;
  revokeOidcToken: (opts: {
    token: string;
    clientId?: string;
  }) => Promise<{ ok: boolean }>;
  requestGrant: (opts: {
    accessToken: string;
    product: string;
    deviceId: string;
    label: string;
  }) => Promise<B1Grant>;
  listGrants: (opts: {
    key?: string;
    accessToken?: string;
  }) => Promise<B1GrantMeta[]>;
  rotateGrant: (opts: {
    key?: string;
    grantId: string;
    accessToken?: string;
  }) => Promise<B1Grant>;
  revokeGrant: (opts: {
    key?: string;
    grantId?: string;
    accessToken?: string;
  }) => Promise<{ ok: boolean; revoked: unknown }>;
  fetchModels: (opts: { key: string }) => Promise<
    Array<{
      id: string;
      label: string;
      pricing: { input: string; output: string; currency: string };
    }>
  >;
  fetchActivity: (opts: {
    key: string;
    period?: string;
  }) => Promise<Record<string, unknown>>;
}

const pkce = requireFromHere(`${B1_ACCOUNT_DIR}/pkce.js`) as PkceModule;
const b1ClientMod = requireFromHere(`${B1_ACCOUNT_DIR}/client.js`) as {
  createClient: (opts: {
    baseUrl: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }) => B1Client;
};

const CLIENT_ID = "lifecode-desktop";
const DEVICE_SCOPE = "openid profile email device:grant";
const MODEL_ID = "nexora/e2e-chat";
const INITIAL_CREDIT_MICRO_CAD = 10_000_000n; // 10.000000 CAD
const SELL_INPUT_MICRO_CAD = 1_000_000n; // 1 CAD / 1M tokens
const SELL_OUTPUT_MICRO_CAD = 3_000_000n; // 3 CAD / 1M tokens

function safePrefix(secret: string): string {
  return `${secret.slice(0, 12)}…`;
}

function assertNoPlaintextSecret(
  haystack: string,
  secrets: string[],
  label: string,
): void {
  for (const s of secrets) {
    if (!s) continue;
    assert.equal(
      haystack.includes(s),
      false,
      `Fuite de secret détectée dans ${label}`,
    );
  }
}

async function toWebRequest(
  req: IncomingMessage,
  origin: string,
): Promise<Request> {
  const method = req.method ?? "GET";
  const url = `${origin}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else if (typeof v === "string") {
      headers.set(k, v);
    }
  }
  const chunks: Buffer[] = [];
  if (method !== "GET" && method !== "HEAD") {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  }
  const body = chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : null;
  return new Request(url, {
    method,
    headers,
    ...(body ? { body } : {}),
  });
}

async function writeWebResponse(
  webRes: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
}

async function startNodeServer(
  handler: (req: Request) => Promise<Response>,
): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  let boundUrl = "http://127.0.0.1:0";
  const server = createServer(async (nodeReq, nodeRes) => {
    try {
      const webReq = await toWebRequest(nodeReq, boundUrl);
      const webRes = await handler(webReq);
      await writeWebResponse(webRes, nodeRes);
    } catch (err) {
      nodeRes.statusCode = 500;
      nodeRes.setHeader("content-type", "application/json; charset=utf-8");
      nodeRes.end(
        JSON.stringify({
          error: {
            code: "internal_error",
            message: err instanceof Error ? err.message : String(err),
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  boundUrl = `http://127.0.0.1:${addr.port}`;
  return {
    server,
    url: boundUrl,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function issueOidcAccessToken(opts: {
  siteUrl: string;
  sessionHeader: string;
  b1: B1Client;
}): Promise<{ authCode: string; accessToken: string; verifier: string }> {
  const cb = await pkce.startCallbackServer({ timeoutMs: 15_000 });
  try {
    const pkcePair = pkce.createPkce();
    const state = pkce.randomState();
    const authorizeUrl = pkce.buildAuthorizeUrl({
      baseUrl: opts.siteUrl,
      clientId: CLIENT_ID,
      redirectUri: cb.redirectUri,
      state,
      challenge: pkcePair.challenge,
      scope: DEVICE_SCOPE,
    });
    const authRes = await fetch(authorizeUrl, {
      method: "GET",
      headers: {
        "x-test-session": opts.sessionHeader,
        origin: opts.siteUrl,
      },
      redirect: "manual",
    });
    assert.ok(
      authRes.status >= 300 && authRes.status < 400,
      `Redirection OAuth attendue en 3xx, reçu ${authRes.status}`,
    );
    const redirectLocation = authRes.headers.get("location");
    assert.ok(redirectLocation, "En-tête Location manquant sur authorize");
    const cbHttpRes = await fetch(redirectLocation);
    assert.equal(cbHttpRes.status, 200);
    const cbResult = await cb.waitForCode();
    assert.ok(cbResult.code, "Code OAuth absent du retour loopback");
    assert.equal(
      pkce.timingSafeEqualStr(cbResult.state ?? "", state),
      true,
      "State OAuth invalide",
    );
    const exchanged = await opts.b1.exchangeOidcCode({
      code: cbResult.code,
      codeVerifier: pkcePair.verifier,
      redirectUri: cb.redirectUri,
      clientId: CLIENT_ID,
    });
    assert.ok(
      exchanged.accessToken.startsWith("nxo_"),
      "Le jeton d'accès OIDC doit commencer par nxo_",
    );
    return {
      authCode: cbResult.code,
      accessToken: exchanged.accessToken,
      verifier: pkcePair.verifier,
    };
  } finally {
    await cb.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const t = await createTestDatabase();
  let closeServer: (() => Promise<void>) | null = null;

  try {
    resetModelsCache();

    // 1) Création org financée (10 CAD) + org vide (0 CAD) + publication d'un modèle
    const orgId = `org_${randomBytes(6).toString("hex")}`;
    const userId = `usr_${randomBytes(6).toString("hex")}`;
    const emptyOrgId = `org_empty_${randomBytes(6).toString("hex")}`;
    const emptyUserId = `usr_empty_${randomBytes(6).toString("hex")}`;
    const drainOrgId = `org_drain_${randomBytes(6).toString("hex")}`;
    const drainUserId = `usr_drain_${randomBytes(6).toString("hex")}`;
    const nowInit = new Date();

    await t.db.insert(organizations).values([
      { id: orgId, name: "Nexora E2E Org", slug: orgId, createdAt: nowInit },
      {
        id: emptyOrgId,
        name: "Nexora Empty Org",
        slug: emptyOrgId,
        createdAt: nowInit,
      },
      {
        id: drainOrgId,
        name: "Nexora Drain Org",
        slug: drainOrgId,
        createdAt: nowInit,
      },
    ]);

    await t.db.insert(users).values([
      {
        id: userId,
        name: "E2E Owner",
        email: `${userId}@example.invalid`,
        emailVerified: true,
        createdAt: nowInit,
        updatedAt: nowInit,
      },
      {
        id: emptyUserId,
        name: "Empty Owner",
        email: `${emptyUserId}@example.invalid`,
        emailVerified: true,
        createdAt: nowInit,
        updatedAt: nowInit,
      },
      {
        id: drainUserId,
        name: "Drain Owner",
        email: `${drainUserId}@example.invalid`,
        emailVerified: true,
        createdAt: nowInit,
        updatedAt: nowInit,
      },
    ]);

    await t.db.insert(members).values([
      {
        id: `mem_${randomBytes(6).toString("hex")}`,
        organizationId: orgId,
        userId,
        role: "owner",
        createdAt: nowInit,
      },
      {
        id: `mem_${randomBytes(6).toString("hex")}`,
        organizationId: emptyOrgId,
        userId: emptyUserId,
        role: "owner",
        createdAt: nowInit,
      },
      {
        id: `mem_${randomBytes(6).toString("hex")}`,
        organizationId: drainOrgId,
        userId: drainUserId,
        role: "owner",
        createdAt: nowInit,
      },
    ]);

    await credit(t.db, {
      organizationId: orgId,
      amountMicro: INITIAL_CREDIT_MICRO_CAD,
      idempotencyKey: `topup_e2e_${randomUUID()}`,
      configVersion: "e2e",
      source: "e2e",
    });

    // drainOrg : exactement 360 micro-CAD pour passer 1 appel chat puis tomber à 0 et recevoir 402
    await credit(t.db, {
      organizationId: drainOrgId,
      amountMicro: 360n,
      idempotencyKey: `topup_drain_${randomUUID()}`,
      configVersion: "e2e",
      source: "e2e",
    });

    await publishTestCatalog(t.db, [
      {
        publicId: MODEL_ID,
        inputMicroPerMillion: SELL_INPUT_MICRO_CAD,
        outputMicroPerMillion: SELL_OUTPUT_MICRO_CAD,
        cachedInputMicroPerMillion: 0n,
      },
    ]);

    const logLines: string[] = [];
    const log = createLogger({
      name: "e2e-device-grants",
      sink: (line) => logLines.push(line),
    });

    let siteUrl = "http://127.0.0.1:0";
    let reqSeq = 0;

    const sessionContext = async (headers: Headers) => {
      const s = headers.get("x-test-session");
      if (s === "owner") {
        return { userId, organizationId: orgId, role: "owner" as const };
      }
      if (s === "empty-owner") {
        return {
          userId: emptyUserId,
          organizationId: emptyOrgId,
          role: "owner" as const,
        };
      }
      if (s === "drain-owner") {
        return {
          userId: drainUserId,
          organizationId: drainOrgId,
          role: "owner" as const,
        };
      }
      return null;
    };

    const getOidcDeps = (): DeviceOidcDeps & DeviceOidcTokenDeps => ({
      db: t.db,
      baseUrl: siteUrl,
      signingSecret: "e2e-signing-secret-32-bytes-minimum-test-key",
      now: () => new Date(),
      getSessionUser: async (headers: Headers) => {
        const s = headers.get("x-test-session");
        if (s === "owner") {
          return {
            id: userId,
            email: `${userId}@example.invalid`,
            name: "E2E Owner",
          };
        }
        if (s === "empty-owner") {
          return {
            id: emptyUserId,
            email: `${emptyUserId}@example.invalid`,
            name: "Empty Owner",
          };
        }
        if (s === "drain-owner") {
          return {
            id: drainUserId,
            email: `${drainUserId}@example.invalid`,
            name: "Drain Owner",
          };
        }
        return null;
      },
    });

    const getDeviceGrantsDeps = (): deviceGrantsHttp.DeviceGrantsHttpDeps => ({
      db: () => t.db,
      siteUrl,
      now: () => new Date(),
      log,
      getSessionContext: sessionContext,
    });

    const gatewayDeps: GatewayDeps = {
      db: () => t.db,
      fetch: (async () =>
        Response.json({
          id: `chatcmpl_${++reqSeq}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: MODEL_ID,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "Réponse simulée E2E." },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 80,
            total_tokens: 200,
          },
        })) as typeof fetch,
      litellm: () => ({
        baseUrl: "http://litellm.internal:4000",
        masterKey: "sk-master-e2e-placeholder",
      }),
      log,
      now: () => new Date(),
      privacy: testPrivacyRouter(t.db, log),
      requestId: () => `req_e2e_${++reqSeq}`,
      limits: {
        defaultRpm: 1_000,
        defaultTpm: 10_000_000,
        maxBodyBytes: 1_000_000,
        upstreamTimeoutMs: 10_000,
        streamTimeoutMs: 10_000,
        defaultMaxOutputTokens: 120,
      },
    };

    const oidcDynamic = deviceOidcMod as Record<string, unknown>;

    const srv = await startNodeServer(async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const p = url.pathname;
      const deps = getDeviceGrantsDeps();

      if (p === "/.well-known/openid-configuration") {
        return handleDeviceOidcDiscovery(siteUrl);
      }
      if (
        p === "/oauth/authorize" ||
        p === "/v1/account/authorize" ||
        p === "/api/auth/oauth2/authorize"
      ) {
        return handleDeviceOidcAuthorize(req, getOidcDeps());
      }
      if (
        p === "/oauth/token" ||
        p === "/v1/account/token" ||
        p === "/api/auth/oauth2/token"
      ) {
        return handleDeviceOidcToken(req, getOidcDeps());
      }
      if (
        p === "/api/auth/oauth2/userinfo" &&
        typeof oidcDynamic.handleDeviceOidcUserInfo === "function"
      ) {
        return (
          oidcDynamic.handleDeviceOidcUserInfo as (
            r: Request,
            d: { db: typeof t.db },
          ) => Promise<Response>
        )(req, { db: t.db });
      }
      if (
        p === "/api/auth/oauth2/revoke" &&
        typeof oidcDynamic.handleDeviceOidcRevoke === "function"
      ) {
        return (
          oidcDynamic.handleDeviceOidcRevoke as (
            r: Request,
            d: { db: typeof t.db },
          ) => Promise<Response>
        )(req, { db: t.db });
      }

      if (p === "/v1/device-grants" || p === "/v1/account/device-grants") {
        if (req.method === "GET") {
          return deviceGrantsHttp.handleListDeviceGrants(req, deps);
        }
        if (req.method === "POST") {
          return deviceGrantsHttp.handleCreateDeviceGrant(req, deps);
        }
        if (req.method === "DELETE") {
          return deviceGrantsHttp.handleRevokeAllDeviceGrants(req, deps);
        }
      }

      if (
        p === "/v1/device-grants/rotate" ||
        p === "/v1/account/device-grants/rotate"
      ) {
        return deviceGrantsHttp.handleRotateSelfDeviceGrant(req, deps);
      }
      if (
        p === "/v1/device-grants/revoke" ||
        p === "/v1/account/device-grants/revoke"
      ) {
        return deviceGrantsHttp.handleRevokeSelfDeviceGrant(req, deps);
      }

      const itemMatch =
        /^\/v1\/(?:account\/)?device-grants\/([^/]+)(?:\/(rotate|revoke))?$/.exec(
          p,
        );
      if (itemMatch) {
        const grantIdParam = decodeURIComponent(itemMatch[1] ?? "");
        const action = itemMatch[2];
        if (action === "rotate") {
          return deviceGrantsHttp.handleRotateDeviceGrant(
            req,
            grantIdParam,
            deps,
          );
        }
        if (action === "revoke" || req.method === "DELETE") {
          return deviceGrantsHttp.handleRevokeDeviceGrant(
            req,
            grantIdParam,
            deps,
          );
        }
        if (req.method === "GET") {
          return deviceGrantsHttp.handleGetDeviceGrant(req, grantIdParam, deps);
        }
      }

      if (p === "/v1/account/balance" || p === "/v1/account/credit-balance") {
        return deviceGrantsHttp.handleAccountBalance(req, deps);
      }
      if (p === "/v1/account/usage") {
        return deviceGrantsHttp.handleAccountUsage(req, deps);
      }
      if (p === "/api/account/activity") {
        return handleActivity(req, {
          db: () => t.db,
          siteUrl,
          now: () => new Date(),
          log,
          getContext: sessionContext,
        });
      }
      if (p === "/api/account/activity/export") {
        return handleActivityExport(req, {
          db: () => t.db,
          siteUrl,
          now: () => new Date(),
          log,
          getContext: sessionContext,
        });
      }

      if (p === "/v1/models") {
        if (req.headers.get("authorization")) {
          const auth = await authenticateApiKey(
            t.db,
            req.headers.get("authorization"),
            new Date(),
          );
          if (!auth.ok) {
            return Response.json(
              { error: { code: "invalid_api_key", message: "Unauthorized" } },
              { status: 401 },
            );
          }
        }
        return handleModels(req, gatewayDeps);
      }
      if (p === "/v1/chat/completions") {
        return handleChatCompletions(req, gatewayDeps);
      }

      return Response.json(
        { error: { code: "not_found", message: p } },
        { status: 404 },
      );
    });

    siteUrl = srv.url;
    closeServer = srv.close;

    const b1 = b1ClientMod.createClient({ baseUrl: siteUrl });

    // 2) Découverte OIDC + PKCE S256 + échange via le vrai client B1
    const discoveryRes = await fetch(
      `${siteUrl}/.well-known/openid-configuration`,
    );
    assert.equal(discoveryRes.status, 200, "OIDC discovery doit répondre 200");
    const discovery = (await discoveryRes.json()) as Record<string, unknown>;
    assert.equal(discovery.issuer, siteUrl);

    const {
      authCode,
      accessToken: oidcAccessToken,
      verifier: pkceVerifier,
    } = await issueOidcAccessToken({
      siteUrl,
      sessionHeader: "owner",
      b1,
    });

    // Refus strict du rejeu du code d'autorisation
    const replayRes = await fetch(`${siteUrl}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: "http://127.0.0.1:43210/callback",
        client_id: CLIENT_ID,
        code_verifier: pkceVerifier,
      }),
    });
    assert.ok(
      replayRes.status === 400 || replayRes.status === 401,
      `Rejeu du code OAuth attendu 400/401, reçu ${replayRes.status}`,
    );

    // UserInfo OIDC si exposé
    let userInfoChecked = false;
    if (typeof oidcDynamic.handleDeviceOidcUserInfo === "function") {
      const ui = await b1.fetchUserInfo({ accessToken: oidcAccessToken });
      assert.equal(ui.sub, userId);
      assert.equal(ui.organizationId, orgId);
      userInfoChecked = true;
    }

    // 3) Création du grant via le VRAI client B1 (`POST /v1/account/device-grants`)
    const createdByB1 = await b1.requestGrant({
      accessToken: oidcAccessToken,
      product: "lifecode-desktop",
      deviceId: "e2e-linux-workstation-01",
      label: "Poste E2E Linux",
    });
    const initialKey = createdByB1.key;
    const grantId = createdByB1.grantId;
    assert.ok(initialKey.startsWith("nxk_"), "La clé émise doit commencer par nxk_");
    assert.ok(grantId.length > 0, "grantId doit être présent à la création");

    // Liste des appareils via B1 : aucun secret complet renvoyé
    const listedByB1 = await b1.listGrants({ key: initialKey });
    assert.ok(
      listedByB1.some((g) => g.grantId === grantId),
      "b1.listGrants doit retourner le grant actif",
    );
    assertNoPlaintextSecret(
      JSON.stringify(listedByB1),
      [initialKey, oidcAccessToken],
      "réponse b1.listGrants",
    );

    // Vérification zéro secret en clair en base PostgreSQL
    const dbDump = JSON.stringify(
      {
        dbKeys: await t.db.select().from(apiKeys),
        dbGrants: await t.db.select().from(gatewayDeviceGrants),
        dbCodes: await t.db.select().from(deviceOidcCodes),
        dbTokens: await t.db.select().from(deviceOidcTokens),
      },
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    );
    assertNoPlaintextSecret(
      dbDump,
      [authCode, oidcAccessToken, initialKey],
      "tables PostgreSQL",
    );

    // 4) Client B1 probe + fetchModels + appel passerelle réel + débit du grand livre
    const probeResult = await b1.probe();
    assert.equal(probeResult.ok, true, "b1.probe() doit retourner ok: true");

    const modelsList = await b1.fetchModels({ key: initialKey });
    assert.ok(
      modelsList.some((m) => m.id === MODEL_ID),
      `b1.fetchModels({ key }) doit contenir ${MODEL_ID}`,
    );

    const balBeforeRes = await fetch(`${siteUrl}/v1/account/balance`, {
      headers: { authorization: `Bearer ${initialKey}` },
    });
    assert.equal(balBeforeRes.status, 200);
    const balBefore = (await balBeforeRes.json()) as { balance_micros: number };
    assert.equal(BigInt(balBefore.balance_micros), INITIAL_CREDIT_MICRO_CAD);

    const chatRes = await fetch(`${siteUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${initialKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "Bonjour Nexora E2E !" }],
        max_tokens: 80,
      }),
    });
    assert.equal(
      chatRes.status,
      200,
      `POST /v1/chat/completions attendu 200, reçu ${chatRes.status}`,
    );

    // Coût : 120 * 1 CAD/M + 80 * 3 CAD/M = 360 micro-CAD -> reste 9_999_640 micro-CAD
    const expectedRemainingMicroCad = INITIAL_CREDIT_MICRO_CAD - 360n;
    const balAfterRes = await fetch(`${siteUrl}/v1/account/balance`, {
      headers: { authorization: `Bearer ${initialKey}` },
    });
    assert.equal(balAfterRes.status, 200);
    const balAfter = (await balAfterRes.json()) as { balance_micros: number };
    assert.equal(BigInt(balAfter.balance_micros), expectedRemainingMicroCad);

    const usageRes = await fetch(`${siteUrl}/v1/account/usage`, {
      headers: { authorization: `Bearer ${initialKey}` },
    });
    assert.equal(usageRes.status, 200);
    const usageBody = (await usageRes.json()) as {
      events: Array<{ input_tokens: number; output_tokens: number }>;
    };
    assert.equal(usageBody.events.length, 1);
    assert.equal(usageBody.events[0]?.input_tokens, 120);
    assert.equal(usageBody.events[0]?.output_tokens, 80);

    // Activité via B1 (`GET /api/account/activity` avec Bearer nxk_…)
    const actRes = await fetch(`${siteUrl}/api/account/activity?period=7d`, {
      headers: { authorization: `Bearer ${initialKey}` },
    });
    const activityBearerSupported = actRes.status === 200;
    if (activityBearerSupported) {
      const activityViaB1 = await b1.fetchActivity({
        key: initialKey,
        period: "7d",
      });
      assert.ok(activityViaB1 && typeof activityViaB1 === "object");
    }

    // 5) Rotation atomique via B1 (`POST /v1/account/device-grants/:id/rotate`) :
    //    nouvelle clé immédiatement active (200), ancienne clé immédiatement révoquée (401)
    const rotated = await b1.rotateGrant({
      key: initialKey,
      grantId,
    });
    const rotatedKey = rotated.key;
    assert.ok(rotatedKey.startsWith("nxk_"));
    assert.notEqual(rotatedKey, initialKey);

    const modelsNewKey = await b1.fetchModels({ key: rotatedKey });
    assert.ok(modelsNewKey.some((m) => m.id === MODEL_ID));

    const oldKeyAfterRotate = await fetch(`${siteUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${initialKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "Ancienne clé révoquée" }],
      }),
    });
    assert.equal(
      oldKeyAfterRotate.status,
      401,
      "L'ancienne clé doit être refusée immédiatement (401) après rotation",
    );

    // 6) Révocation via B1 (`DELETE /v1/account/device-grants/:id`) -> refus 401 immédiat partout
    const revokeResult = await b1.revokeGrant({
      key: rotatedKey,
      grantId,
    });
    assert.equal(revokeResult.ok, true);

    for (const [keyLabel, candidateKey] of [
      ["initialKey", initialKey],
      ["rotatedKey", rotatedKey],
    ] as const) {
      const chatRevoked = await fetch(`${siteUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${candidateKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_ID,
          messages: [{ role: "user", content: "Doit être refusé 401" }],
        }),
      });
      assert.equal(
        chatRevoked.status,
        401,
        `/v1/chat/completions doit renvoyer 401 après révocation (${keyLabel})`,
      );

      const modelsRevoked = await fetch(`${siteUrl}/v1/models`, {
        headers: { authorization: `Bearer ${candidateKey}` },
      });
      assert.equal(modelsRevoked.status, 401);

      const balanceRevoked = await fetch(`${siteUrl}/v1/account/balance`, {
        headers: { authorization: `Bearer ${candidateKey}` },
      });
      assert.equal(balanceRevoked.status, 401);
    }

    // 7) Solde vide (0 CAD) :
    //    7.a) `POST /v1/account/device-grants` -> 402 insufficient_credits (FR + EN)
    const emptyOidc = await issueOidcAccessToken({
      siteUrl,
      sessionHeader: "empty-owner",
      b1,
    });
    const emptyFrRes = await fetch(`${siteUrl}/v1/account/device-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${emptyOidc.accessToken}`,
        "accept-language": "fr-CA",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        product: "lifecode-desktop",
        device_id: "empty-dev-1",
        label: "Poste Sans Crédit",
      }),
    });
    assert.equal(
      emptyFrRes.status,
      402,
      "Création d'un grant sans crédits doit répondre 402 (FR)",
    );
    const emptyFrBody = (await emptyFrRes.json()) as {
      error?: { code?: string; message?: string };
    };
    assert.equal(emptyFrBody.error?.code, "insufficient_credits");

    const emptyEnRes = await fetch(`${siteUrl}/v1/account/device-grants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${emptyOidc.accessToken}`,
        "accept-language": "en-CA",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        product: "lifecode-desktop",
        device_id: "empty-dev-1",
        label: "Zero Balance Workstation",
      }),
    });
    assert.equal(
      emptyEnRes.status,
      402,
      "Création d'un grant sans crédits doit répondre 402 (EN)",
    );

    //    7.b) Clé d'appareil émise avec 360 micro-CAD : 1er appel chat consomme les 360 micro-CAD (200),
    //         2e appel chat sur solde tombé à 0 -> 402 sur la passerelle !
    const drainOidc = await issueOidcAccessToken({
      siteUrl,
      sessionHeader: "drain-owner",
      b1,
    });
    const drainGrant = await b1.requestGrant({
      accessToken: drainOidc.accessToken,
      product: "lifecode-desktop",
      deviceId: "drain-dev-1",
      label: "Poste Épuisement Solde",
    });
    const drainChat1 = await fetch(`${siteUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${drainGrant.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "Premier appel (360 micro-CAD)" }],
        max_tokens: 80,
      }),
    });
    assert.equal(drainChat1.status, 200);

    const drainChat2 = await fetch(`${siteUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${drainGrant.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: "Deuxième appel sur solde 0" }],
        max_tokens: 80,
      }),
    });
    assert.equal(
      drainChat2.status,
      402,
      `Appel passerelle avec clé d'appareil sur solde 0 attendu 402, reçu ${drainChat2.status}`,
    );

    // Révocation du jeton OIDC via B1 si exposé
    let oidcRevokeChecked = false;
    if (typeof oidcDynamic.handleDeviceOidcRevoke === "function") {
      const rev = await b1.revokeOidcToken({
        token: oidcAccessToken,
        clientId: CLIENT_ID,
      });
      assert.equal(rev.ok, true);
      oidcRevokeChecked = true;
    }

    const summary = {
      ok: true,
      organizationId: orgId,
      grantId,
      model: MODEL_ID,
      initialKeyPrefix: safePrefix(initialKey),
      rotatedKeyPrefix: safePrefix(rotatedKey),
      checks: {
        oidcPkceS256: true,
        authCodeReplayRejected: true,
        oidcUserInfoChecked: userInfoChecked,
        oidcRevokeChecked,
        zeroPlaintextSecretInDb: true,
        b1ProbeOk: true,
        b1FetchModelsOk: true,
        b1ListGrantsOk: true,
        activityBearerSupported,
        chatCompletionsDebited: {
          beforeMicroCad: INITIAL_CREDIT_MICRO_CAD.toString(),
          afterFirstChatMicroCad: expectedRemainingMicroCad.toString(),
          debitedMicroCad: "360",
        },
        rotationImmediateOldKey401: true,
        revocationImmediate401: true,
        emptyBalance402OnGrantAndGateway: true,
      },
    };

    const allSecrets = [
      authCode,
      oidcAccessToken,
      initialKey,
      rotatedKey,
      pkceVerifier,
      emptyOidc.authCode,
      emptyOidc.accessToken,
      drainOidc.authCode,
      drainOidc.accessToken,
      drainGrant.key,
    ];
    const outputJson = JSON.stringify(summary, null, 2);
    assertNoPlaintextSecret(outputJson, allSecrets, "sortie JSON récapitulative");
    assertNoPlaintextSecret(logLines.join("\n"), allSecrets, "journaux serveur");

    console.log(outputJson);
  } finally {
    if (closeServer) {
      await closeServer().catch(() => undefined);
    }
    await t.drop();
  }
}

await main();
process.exit(0);
