import { createHash, randomBytes } from "node:crypto";
import { eq, users } from "@nexora/db";
import type { TestDatabase } from "@nexora/db/testing";
import { expect } from "vitest";
import type { NexoraAuth } from "./index";
import type { MemoryMailer } from "./mailer";
import { WORKSTUDIO_SCOPES } from "./workstudio-oidc";

/**
 * Outils des tests d'intégration du fournisseur OpenID Connect : un « navigateur » et un « serveur WorkStudio »
 * simulés qui parlent au vrai gestionnaire HTTP de Better Auth, sur une base d'essai.
 */

export const PASSWORD = "un-mot-de-passe-solide-42";
export const ALL_SCOPES = WORKSTUDIO_SCOPES.join(" ");

export interface TokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export interface AuthorizeOptions {
  cookie?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string | null;
  state?: string;
  challenge?: string | null;
  nonce?: string;
  extra?: Record<string, string>;
}

export interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: Record<string, string>;
  cookie?: string;
  origin?: string | null;
  bearer?: string;
  /** Authentification « client_secret_basic » du serveur WorkStudio. */
  basic?: { id: string; secret: string };
  ip?: string;
}

export function createOidcHarness(env: {
  auth: () => NexoraAuth;
  mailer: () => MemoryMailer;
  db: () => TestDatabase;
  origin: string;
  clientId: string;
  clientSecret: string;
  callback: string;
}) {
  const ISSUER = `${env.origin}/api/auth`;
  const ORIGIN = env.origin;
  const CLIENT_ID = env.clientId;
  const CLIENT_SECRET = env.clientSecret;
  const CALLBACK = env.callback;

  async function request(
    instance: NexoraAuth,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const headers = new Headers();
    if (options.origin !== null && options.origin !== undefined)
      headers.set("origin", options.origin);
    if (options.cookie) headers.set("cookie", options.cookie);
    if (options.bearer)
      headers.set("authorization", `Bearer ${options.bearer}`);
    if (options.basic)
      headers.set(
        "authorization",
        `Basic ${Buffer.from(`${encodeURIComponent(options.basic.id)}:${encodeURIComponent(options.basic.secret)}`).toString("base64")}`,
      );
    headers.set("x-forwarded-for", options.ip ?? "203.0.113.7");
    let body: string | undefined;
    if (options.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.json);
    } else if (options.form) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(options.form).toString();
    }
    return instance.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: options.method ?? (body ? "POST" : "GET"),
        headers,
        body,
        redirect: "manual",
      }),
    );
  }
  const call = (path: string, options: RequestOptions = {}) =>
    request(env.auth(), path, options);

  function cookiesOf(res: Response): string {
    return res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  let n = 0;
  async function newVerifiedUser(name = "Camille Tremblay") {
    const email = `oidc${Date.now()}${++n}@example.com`;
    const up = await call("/sign-up/email", {
      origin: ORIGIN,
      json: {
        email,
        password: PASSWORD,
        name,
        company: "Tremblay et fils",
        locale: "fr",
      },
    });
    expect(up.status).toBe(200);
    const mail = env
      .mailer()
      .sentTo(email)
      .filter((m) => m.text.includes("verify-email"))
      .at(-1);
    const link = /https?:\/\/[^\s"<>]+verify-email[^\s"<>]*/.exec(
      mail?.text ?? "",
    )?.[0];
    const url = new URL(link as string);
    await call(`${url.pathname.replace("/api/auth", "")}${url.search}`);
    const res = await call("/sign-in/email", {
      origin: ORIGIN,
      json: { email, password: PASSWORD },
    });
    expect(res.status).toBe(200);
    const [user] = await env
      .db()
      .db.select()
      .from(users)
      .where(eq(users.email, email));
    return {
      email,
      name,
      cookie: cookiesOf(res),
      userId: user?.id as string,
    };
  }

  function pkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  function authorize(o: AuthorizeOptions = {}): Promise<Response> {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: o.clientId ?? CLIENT_ID,
      redirect_uri: o.redirectUri ?? CALLBACK,
      state: o.state ?? "etat-1234",
      ...o.extra,
    });
    if (o.scope !== null) params.set("scope", o.scope ?? ALL_SCOPES);
    if (o.challenge !== null && o.challenge !== undefined) {
      params.set("code_challenge", o.challenge);
      params.set("code_challenge_method", "S256");
    }
    if (o.nonce) params.set("nonce", o.nonce);
    return call(`/oauth2/authorize?${params}`, { cookie: o.cookie });
  }

  function redirectOf(res: Response): URL {
    expect(res.status, "redirection attendue").toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    return new URL(res.headers.get("location") as string);
  }

  /** Autorisation réussie : renvoie le code. */
  async function obtainCode(
    cookie: string,
    o: AuthorizeOptions & { verifier?: string } = {},
  ) {
    const { verifier, challenge } = pkce();
    const res = await authorize({ cookie, challenge, ...o });
    const location = redirectOf(res);
    expect(`${location.origin}${location.pathname}`).toBe(CALLBACK);
    const code = location.searchParams.get("code");
    expect(code, location.toString()).toBeTruthy();
    expect(location.searchParams.get("iss")).toBe(ISSUER);
    return {
      code: code as string,
      verifier,
      state: location.searchParams.get("state"),
    };
  }

  function exchange(
    code: string,
    verifier: string | null,
    over: Record<string, string> = {},
  ): Promise<Response> {
    const form: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...over,
    };
    if (verifier !== null) form.code_verifier = verifier;
    return call("/oauth2/token", { form });
  }

  async function fullLogin(cookie: string, nonce = "nonce-xyz") {
    const { code, verifier } = await obtainCode(cookie, { nonce });
    const res = await exchange(code, verifier);
    expect(res.status).toBe(200);
    return (await res.json()) as TokenResponse;
  }

  function userinfo(token: string, instance: NexoraAuth = env.auth()) {
    return request(instance, "/oauth2/userinfo", { bearer: token });
  }

  return {
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
  };
}
