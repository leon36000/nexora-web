import { randomBytes } from "node:crypto";
import {
  creditAccounts,
  eq,
  members,
  organizations,
  sessions,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type NexoraAuth } from "./index";
import { createMemoryMailer, type MemoryMailer } from "./mailer";

const ORIGIN = "http://localhost:3500";
const PASSWORD = "un-mot-de-passe-solide-42";

let t: TestDatabase;
let mailer: MemoryMailer;
let auth: NexoraAuth;

beforeAll(async () => {
  t = await createTestDatabase();
  mailer = createMemoryMailer();
  auth = createAuth({
    db: t.db,
    secret: randomBytes(32).toString("hex"),
    baseURL: ORIGIN,
    mailer,
    // Les essais de débit sont couverts par un test dédié ; ailleurs on les relâche.
    rateLimit: { enabled: false },
  });
});
afterAll(async () => {
  await t.drop();
});

/** Appelle le gestionnaire HTTP de Better Auth comme le ferait Next.js. */
async function call(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string | null;
    ip?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.origin !== null) headers.set("origin", options.origin ?? ORIGIN);
  if (options.cookie) headers.set("cookie", options.cookie);
  headers.set("x-forwarded-for", options.ip ?? "203.0.113.7");
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

let n = 0;
const uniqueEmail = () => `client${Date.now()}${++n}@example.com`;

async function signUp(
  over: Record<string, unknown> = {},
): Promise<{ email: string; res: Response }> {
  const email = uniqueEmail();
  const res = await call("/sign-up/email", {
    body: {
      email,
      password: PASSWORD,
      name: "Camille Tremblay",
      company: "Tremblay et fils",
      locale: "fr",
      ...over,
    },
  });
  return { email, res };
}

/** Clique sur le lien de vérification reçu par courriel. */
async function verifyFromMail(email: string): Promise<Response> {
  const mail = mailer
    .sentTo(email)
    .filter((m) => m.text.includes("verify-email"))
    .at(-1);
  expect(mail, "courriel de vérification").toBeDefined();
  const link = /https?:\/\/[^\s"<>]+verify-email[^\s"<>]*/.exec(
    mail?.text ?? "",
  )?.[0];
  expect(link).toBeDefined();
  const url = new URL(link as string);
  return call(`${url.pathname.replace("/api/auth", "")}${url.search}`, {
    origin: null,
  });
}

async function newVerifiedUser() {
  const { email } = await signUp();
  await verifyFromMail(email);
  const res = await call("/sign-in/email", {
    body: { email, password: PASSWORD },
  });
  expect(res.status).toBe(200);
  const cookie = cookiesOf(res);
  const [user] = await t.db.select().from(users).where(eq(users.email, email));
  const [member] = await t.db
    .select()
    .from(members)
    .where(eq(members.userId, user?.id as string));
  return {
    email,
    cookie,
    userId: user?.id as string,
    orgId: member?.organizationId as string,
  };
}

describe("inscription", () => {
  it("crée le compte, une organisation dont l'utilisateur est propriétaire, et envoie le courriel de vérification", async () => {
    const { email, res } = await signUp();
    expect(res.status).toBe(200);
    const [user] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    expect(user).toMatchObject({ emailVerified: false, locale: "fr" });
    const memberships = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, user?.id as string));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
    const [org] = await t.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, memberships[0]?.organizationId as string));
    expect(org?.name).toBe("Tremblay et fils");
    // Le compte de crédits existe, à zéro.
    const [account] = await t.db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.organizationId, org?.id as string));
    expect(account?.balanceMicro ?? 0n).toBe(0n);
    expect(mailer.sentTo(email)).toHaveLength(1);
  });

  it("sans nom d'entreprise, l'organisation porte le nom de la personne", async () => {
    const { email } = await signUp({ company: undefined });
    const [user] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    const [m] = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, user?.id as string));
    const [org] = await t.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, m?.organizationId as string));
    expect(org?.name).toContain("Camille Tremblay");
  });

  it("exactement une organisation par compte, même si l'hameçon est rejoué", async () => {
    const u = await newVerifiedUser();
    const rows = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, u.userId));
    expect(rows).toHaveLength(1);
  });

  it("le courriel de vérification est dans la langue de l'inscription", async () => {
    const fr = await signUp({ locale: "fr" });
    const en = await signUp({ locale: "en" });
    expect(mailer.last(fr.email)?.subject).toMatch(/courriel|Confirmez/i);
    expect(mailer.last(en.email)?.subject).toMatch(/Confirm|email/i);
    expect(mailer.last(en.email)?.subject).not.toMatch(/Confirmez/);
  });

  it("refuse un mot de passe trop court", async () => {
    const { res } = await signUp({ password: "court1" });
    expect(res.status).toBe(400);
  });

  it("ne stocke jamais le mot de passe en clair", async () => {
    const { email } = await signUp();
    const rows =
      await t.sql`SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = ${email}`;
    expect(rows[0]?.password).toBeTruthy();
    expect(rows[0]?.password).not.toContain(PASSWORD);
  });
});

describe("vérification du courriel et connexion", () => {
  it("refuse la connexion tant que le courriel n'est pas vérifié, puis l'accepte", async () => {
    const { email } = await signUp();
    const refused = await call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(refused.status).toBe(403);
    expect(cookiesOf(refused)).not.toContain("session_token");
    const verified = await verifyFromMail(email);
    expect([200, 302]).toContain(verified.status);
    const ok = await call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(ok.status).toBe(200);
    expect(cookiesOf(ok)).toContain("session_token");
  });

  it("nomme ses témoins avec un préfixe propre au site (WorkStudio, sur le même hôte, ne les écrase pas)", async () => {
    const { email } = await signUp();
    await verifyFromMail(email);
    const ok = await call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    const names = ok.headers.getSetCookie().map((c) => c.split("=")[0] ?? "");
    expect(names.some((n) => n === "nexora-site.session_token")).toBe(true);
    expect(names.some((n) => n.startsWith("better-auth."))).toBe(false);
  });

  it("la session a l'organisation du compte comme organisation active", async () => {
    const u = await newVerifiedUser();
    const rows = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, u.userId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((s) => s.activeOrganizationId === u.orgId)).toBe(true);
  });

  it("un mauvais mot de passe donne une erreur générique", async () => {
    const u = await newVerifiedUser();
    const bad = await call("/sign-in/email", {
      body: { email: u.email, password: "mauvais-mot-de-passe-1" },
    });
    const unknown = await call("/sign-in/email", {
      body: { email: uniqueEmail(), password: "mauvais-mot-de-passe-1" },
    });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await bad.json()).message).toBe((await unknown.json()).message);
  });

  it("la session est lisible avec son témoin, et la déconnexion la révoque", async () => {
    const u = await newVerifiedUser();
    const s = await call("/get-session", { cookie: u.cookie });
    expect((await s.json()).user.email).toBe(u.email);
    const out = await call("/sign-out", {
      method: "POST",
      body: {},
      cookie: u.cookie,
    });
    expect(out.status).toBe(200);
    const after = await call("/get-session", { cookie: u.cookie });
    expect(await after.json()).toBeNull();
  });
});

describe("réinitialisation du mot de passe", () => {
  it("envoie un lien, change le mot de passe, invalide l'ancien et les sessions", async () => {
    const u = await newVerifiedUser();
    const NEW = "nouveau-mot-de-passe-solide-77";
    const req = await call("/request-password-reset", {
      body: { email: u.email, redirectTo: "/compte/reinitialiser" },
    });
    expect(req.status).toBe(200);
    const mail = mailer
      .sentTo(u.email)
      .filter((m) => m.text.includes("reset-password"))
      .at(-1);
    expect(mail).toBeDefined();
    const token =
      /token=([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1] ??
      /reset-password\/([A-Za-z0-9_-]+)/.exec(mail?.text ?? "")?.[1];
    expect(token).toBeDefined();
    const reset = await call("/reset-password", {
      body: { newPassword: NEW, token },
    });
    expect(reset.status).toBe(200);
    const old = await call("/sign-in/email", {
      body: { email: u.email, password: PASSWORD },
    });
    expect(old.status).toBe(401);
    const fresh = await call("/sign-in/email", {
      body: { email: u.email, password: NEW },
    });
    expect(fresh.status).toBe(200);
    // Le jeton est à usage unique.
    const again = await call("/reset-password", {
      body: { newPassword: "encore-un-autre-mot-de-passe-9", token },
    });
    expect(again.status).toBe(400);
  });

  it("répond de la même façon pour un courriel inconnu et n'envoie rien", async () => {
    const unknown = uniqueEmail();
    const res = await call("/request-password-reset", {
      body: { email: unknown, redirectTo: "/compte/reinitialiser" },
    });
    expect(res.status).toBe(200);
    expect(mailer.sentTo(unknown)).toHaveLength(0);
  });
});

describe("gardes d'organisation : un membre ne lit pas une autre organisation", () => {
  it("getFullOrganization refuse l'organisation d'un autre compte", async () => {
    const a = await newVerifiedUser();
    const b = await newVerifiedUser();
    const own = await call(
      `/organization/get-full-organization?organizationId=${a.orgId}`,
      { cookie: a.cookie },
    );
    expect(own.status).toBe(200);
    const foreign = await call(
      `/organization/get-full-organization?organizationId=${a.orgId}`,
      { cookie: b.cookie },
    );
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    const body = await foreign.text();
    expect(body).not.toContain(a.email);
    expect(body).not.toContain(a.orgId);
  });

  it("setActiveOrganization vers l'organisation d'un autre compte est refusé", async () => {
    const a = await newVerifiedUser();
    const b = await newVerifiedUser();
    const res = await call("/organization/set-active", {
      body: { organizationId: a.orgId },
      cookie: b.cookie,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await t.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, b.userId));
    // Quoi que fasse Better Auth de la session après le refus, elle ne pointe jamais vers l'autre organisation.
    expect(rows.some((s) => s.activeOrganizationId === a.orgId)).toBe(false);
  });

  it("créer une seconde organisation est refusé (une organisation par compte)", async () => {
    const a = await newVerifiedUser();
    const res = await call("/organization/create", {
      body: { name: "Autre", slug: `autre-${randomBytes(3).toString("hex")}` },
      cookie: a.cookie,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const rows = await t.db
      .select()
      .from(members)
      .where(eq(members.userId, a.userId));
    expect(rows).toHaveLength(1);
  });

  it("n'accepte que les rôles propriétaire et membre, et aucune invitation", async () => {
    const owner = await newVerifiedUser();
    const other = await newVerifiedUser();
    const memberId = randomBytes(8).toString("hex");
    await t.db.insert(members).values({
      id: memberId,
      organizationId: owner.orgId,
      userId: other.userId,
      role: "member",
    });
    const bad = await call("/organization/update-member-role", {
      body: { memberId, role: "admin", organizationId: owner.orgId },
      cookie: owner.cookie,
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const [row] = await t.db
      .select()
      .from(members)
      .where(eq(members.id, memberId));
    expect(row?.role).toBe("member");
    const invite = await call("/organization/invite-member", {
      body: {
        email: uniqueEmail(),
        role: "member",
        organizationId: owner.orgId,
      },
      cookie: owner.cookie,
    });
    expect(invite.status).toBe(403);
  });

  it("un simple membre ne peut ni inviter ni supprimer l'organisation", async () => {
    const owner = await newVerifiedUser();
    const other = await newVerifiedUser();
    // `other` rejoint l'organisation de `owner` en tant que membre (écriture directe en base).
    await t.db.insert(members).values({
      id: randomBytes(8).toString("hex"),
      organizationId: owner.orgId,
      userId: other.userId,
      role: "member",
    });
    await call("/organization/set-active", {
      body: { organizationId: owner.orgId },
      cookie: other.cookie,
    });
    const invite = await call("/organization/invite-member", {
      body: {
        email: uniqueEmail(),
        role: "member",
        organizationId: owner.orgId,
      },
      cookie: other.cookie,
    });
    expect(invite.status).toBeGreaterThanOrEqual(400);
    const del = await call("/organization/delete", {
      body: { organizationId: owner.orgId },
      cookie: other.cookie,
    });
    expect(del.status).toBeGreaterThanOrEqual(400);
    const [org] = await t.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, owner.orgId));
    expect(org).toBeDefined();
  });
});

describe("CSRF", () => {
  it("refuse une requête qui modifie l'état depuis une autre origine", async () => {
    const u = await newVerifiedUser();
    const res = await call("/sign-out", {
      method: "POST",
      body: {},
      cookie: u.cookie,
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
    const s = await call("/get-session", { cookie: u.cookie });
    expect((await s.json()).user.email).toBe(u.email);
  });

  it("refuse aussi une connexion depuis une autre origine", async () => {
    const u = await newVerifiedUser();
    const res = await call("/sign-in/email", {
      body: { email: u.email, password: PASSWORD },
      origin: "https://evil.example",
    });
    expect(res.status).toBe(403);
  });

  it("les témoins de session sont HttpOnly et SameSite", async () => {
    const u = await newVerifiedUser();
    const res = await call("/sign-in/email", {
      body: { email: u.email, password: PASSWORD },
    });
    const set =
      res.headers.getSetCookie().find((c) => c.includes("session_token")) ?? "";
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=(Lax|Strict)/i);
  });
});

describe("limitation de débit", () => {
  it("bloque les tentatives de connexion répétées depuis la même adresse", async () => {
    const limited = createAuth({
      db: t.db,
      secret: randomBytes(32).toString("hex"),
      baseURL: ORIGIN,
      mailer,
    });
    const hit = () =>
      limited.handler(
        new Request(`${ORIGIN}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: ORIGIN,
            "x-forwarded-for": "198.51.100.23",
          },
          body: JSON.stringify({
            email: "x@example.com",
            password: "mauvais-mot-de-passe-1",
          }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await hit()).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toContain(429);
  });
});
