import { randomBytes } from "node:crypto";
import { eq, sessions, staffAccounts, twoFactors, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type NexoraAuth } from "./index";
import { createMemoryMailer, type MemoryMailer } from "./mailer";

// Durcissement de l'authentification (vague 2, sécurité) : nom injecté dans les courriels, politique de mots de
// passe, verrouillage progressif, double authentification (TOTP + codes de secours), avertissement de connexion.

const ORIGIN = "http://localhost:3500";
const PASSWORD = "un-mot-de-passe-solide-42";

let t: TestDatabase;
let mailer: MemoryMailer;
let auth: NexoraAuth;
let clock = 1_900_000_000_000;
const SECRET = randomBytes(32).toString("hex");

function makeAuth(extra: Partial<Parameters<typeof createAuth>[0]> = {}) {
  return createAuth({
    db: t.db,
    secret: SECRET,
    baseURL: ORIGIN,
    mailer,
    rateLimit: { enabled: false },
    now: () => clock,
    ...extra,
  });
}

beforeAll(async () => {
  t = await createTestDatabase();
  mailer = createMemoryMailer();
  auth = makeAuth();
});
afterAll(async () => {
  await t.drop();
});

async function call(
  path: string,
  options: {
    body?: unknown;
    cookie?: string;
    ip?: string;
    method?: string;
    instance?: NexoraAuth;
    userAgent?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("origin", ORIGIN);
  if (options.cookie) headers.set("cookie", options.cookie);
  headers.set("x-forwarded-for", options.ip ?? "203.0.113.7");
  headers.set("user-agent", options.userAgent ?? "Mozilla/5.0 test");
  return (options.instance ?? auth).handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }),
  );
}

const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

let n = 0;
const uniqueEmail = () => `secu${Date.now()}x${++n}@example.com`;

async function signUp(
  over: Record<string, unknown> = {},
  instance?: NexoraAuth,
) {
  const email = (over.email as string) ?? uniqueEmail();
  const res = await call("/sign-up/email", {
    instance,
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

async function verifyEmail(email: string, ip = "203.0.113.7") {
  const mail = mailer
    .sentTo(email)
    .filter((m) => m.text.includes("verify-email"))
    .at(-1);
  const link = /https?:\/\/[^\s"<>]+verify-email[^\s"<>]*/.exec(
    mail?.text ?? "",
  )?.[0] as string;
  const url = new URL(link);
  await call(`${url.pathname.replace("/api/auth", "")}${url.search}`, { ip });
}

async function verifiedUser(ip = "203.0.113.7") {
  const { email } = await signUp();
  await verifyEmail(email);
  const res = await call("/sign-in/email", {
    ip,
    body: { email, password: PASSWORD },
  });
  expect(res.status).toBe(200);
  const [user] = await t.db.select().from(users).where(eq(users.email, email));
  return { email, cookie: cookiesOf(res), userId: user?.id as string };
}

function base32Decode(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString("utf8");
}

async function currentCode(totpURI: string): Promise<string> {
  const secret = new URL(totpURI).searchParams.get("secret") as string;
  const out = await auth.api.generateTOTP({
    body: { secret: base32Decode(secret) },
  });
  return out.code;
}

describe("nom d'affichage : aucune injection dans les courriels", () => {
  it("refuse un nom qui contient une adresse web ou des balises", async () => {
    const { res } = await signUp({
      name: "Votre compte est suspendu, ouvrez https://evil.example/paye",
    });
    expect(res.status).toBe(400);
    const { res: res2 } = await signUp({ name: "<b>Alice</b>" });
    expect(res2.status).toBe(400);
  });

  it("aplatit les retours à la ligne : le courriel de vérification reste sur une seule ligne de salutation", async () => {
    const { email, res } = await signUp({
      name: "Camille\n\nAppelez le 555-0100\r\nmaintenant",
    });
    expect(res.status).toBe(200);
    const mail = mailer.sentTo(email).at(-1);
    expect(mail?.text.split("\n")[0]).toBe(
      "Bonjour Camille Appelez le 555-0100 maintenant,",
    );
    const [user] = await t.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    expect(user?.name).toBe("Camille Appelez le 555-0100 maintenant");
  });

  it("refuse un nom vide ou fait de caractères de contrôle", async () => {
    const { res } = await signUp({ name: "\n\t ‮" });
    expect(res.status).toBe(400);
  });
});

describe("politique des mots de passe", () => {
  const code = async (res: Response) => ((await res.json()) as { code?: string }).code;

  it("refuse moins de 12 caractères", async () => {
    const { res } = await signUp({ password: "Abcdef-1234" });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("PASSWORD_TOO_SHORT");
  });

  it("refuse un mot de passe courant, même allongé de chiffres", async () => {
    for (const password of ["motdepasse123", "Password1234!", "123456789012", "aaaaaaaaaaaa"]) {
      const { res } = await signUp({ password });
      expect(res.status, password).toBe(400);
      expect(await code(res), password).toBe("PASSWORD_TOO_COMMON");
    }
  });

  it("refuse un mot de passe bâti sur le courriel", async () => {
    const email = uniqueEmail();
    const local = email.split("@")[0];
    const { res } = await signUp({ email, password: `${local}-2026-x!` });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("PASSWORD_PERSONAL");
  });

  it("refuse un mot de passe vu dans une fuite (HIBP) et laisse passer si le service est indisponible", async () => {
    const breached = makeAuth({
      breachCheck: async (p) => (p === "Fuite-Connue-Longue-77" ? true : null),
    });
    const { res } = await signUp({ password: "Fuite-Connue-Longue-77" }, breached);
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("PASSWORD_COMPROMISED");
    const { res: ok } = await signUp({ password: "Autre-Phrase-Longue-88" }, breached);
    expect(ok.status).toBe(200);
  });

  it("s'applique aussi au changement de mot de passe", async () => {
    const { cookie } = await verifiedUser();
    const res = await call("/change-password", {
      cookie,
      body: { currentPassword: PASSWORD, newPassword: "motdepasse123" },
    });
    expect(res.status).toBe(400);
    expect(await code(res)).toBe("PASSWORD_TOO_COMMON");
  });
});

describe("verrouillage progressif des connexions", () => {
  const login = (email: string, password: string, ip = "198.51.100.9") =>
    call("/sign-in/email", { ip, body: { email, password } });

  it("verrouille après 5 échecs, double la durée, et se lève avec le temps ; une réussite remet à zéro", async () => {
    const { email } = await signUp();
    await verifyEmail(email);
    for (let i = 0; i < 4; i++)
      expect((await login(email, "mauvais-mot-de-passe-1")).status).toBe(401);
    // 5e échec : refusé comme les autres, mais le compte se verrouille.
    expect((await login(email, "mauvais-mot-de-passe-1")).status).toBe(401);
    const locked = await login(email, PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBe("60");
    expect(((await locked.json()) as { code: string }).code).toBe(
      "ACCOUNT_TEMPORARILY_LOCKED",
    );
    // Même avec une autre adresse : le verrou est sur le compte.
    expect((await login(email, PASSWORD, "198.51.100.77")).status).toBe(429);
    clock += 61_000;
    // Un nouvel échec double le délai (2 min).
    expect((await login(email, "mauvais-mot-de-passe-2")).status).toBe(401);
    const second = await login(email, PASSWORD);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("120");
    clock += 121_000;
    expect((await login(email, PASSWORD)).status).toBe(200);
    // Compteur remis à zéro : 4 nouveaux échecs ne verrouillent pas.
    for (let i = 0; i < 4; i++) await login(email, "mauvais-mot-de-passe-3");
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it("traite une adresse sans compte exactement comme une adresse existante (aucune énumération)", async () => {
    const ghost = uniqueEmail();
    for (let i = 0; i < 5; i++) await login(ghost, "mauvais-mot-de-passe-1");
    const res = await login(ghost, "mauvais-mot-de-passe-1");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
  });
});

describe("double authentification", () => {
  async function enable(cookie: string) {
    const res = await call("/two-factor/enable", {
      cookie,
      body: { password: PASSWORD },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    const verify = await call("/two-factor/verify-totp", {
      cookie,
      body: { code: await currentCode(body.totpURI) },
    });
    expect(verify.status).toBe(200);
    return { ...body, cookie: cookiesOf(verify) || cookie };
  }

  it("active le TOTP avec dix codes de secours, chiffrés en base, et n'active rien avant le premier code", async () => {
    const { email, cookie, userId } = await verifiedUser();
    const res = await call("/two-factor/enable", {
      cookie,
      body: { password: PASSWORD },
    });
    const body = (await res.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    expect(body.backupCodes).toHaveLength(10);
    let [user] = await t.db.select().from(users).where(eq(users.id, userId));
    expect(user?.twoFactorEnabled).toBe(false);
    const secret = new URL(body.totpURI).searchParams.get("secret") as string;
    const [row] = await t.db
      .select()
      .from(twoFactors)
      .where(eq(twoFactors.userId, userId));
    expect(row?.verified).toBe(false);
    expect(row?.secret).not.toContain(secret);
    for (const c of body.backupCodes)
      expect(row?.backupCodes).not.toContain(c);
    await call("/two-factor/verify-totp", {
      cookie,
      body: { code: await currentCode(body.totpURI) },
    });
    [user] = await t.db.select().from(users).where(eq(users.id, userId));
    expect(user?.twoFactorEnabled).toBe(true);
    void email;
  });

  it("exige le second facteur à la connexion : mauvais code refusé, bon code ouvre la session, appareil jamais mémorisé", async () => {
    const { email, cookie } = await verifiedUser();
    const { totpURI } = await enable(cookie);
    const first = await call("/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(first.status).toBe(200);
    const challenge = (await first.json()) as { twoFactorRedirect?: boolean };
    expect(challenge.twoFactorRedirect).toBe(true);
    const pending = cookiesOf(first);
    // Aucune session n'existe encore : les routes protégées répondent comme sans connexion.
    const session = await call("/get-session", { cookie: pending });
    expect(await session.json()).toBeNull();
    const bad = await call("/two-factor/verify-totp", {
      cookie: pending,
      body: { code: "000000" },
    });
    expect(bad.status).toBe(401);
    const good = await call("/two-factor/verify-totp", {
      cookie: pending,
      body: { code: await currentCode(totpURI), trustDevice: true },
    });
    expect(good.status).toBe(200);
    expect(
      good.headers.getSetCookie().some((c) => c.includes("trust_device")),
    ).toBe(false);
    // « Se souvenir de cet appareil » est ignoré : la connexion suivante redemande le code.
    const again = await call("/sign-in/email", {
      cookie: cookiesOf(good),
      body: { email, password: PASSWORD },
    });
    expect(((await again.json()) as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
  });

  it("accepte un code de secours une seule fois", async () => {
    const { email, cookie } = await verifiedUser();
    const { backupCodes } = await enable(cookie);
    const login = async () => {
      const r = await call("/sign-in/email", {
        body: { email, password: PASSWORD },
      });
      return cookiesOf(r);
    };
    const used = backupCodes[0] as string;
    const ok = await call("/two-factor/verify-backup-code", {
      cookie: await login(),
      body: { code: used },
    });
    expect(ok.status).toBe(200);
    const replay = await call("/two-factor/verify-backup-code", {
      cookie: await login(),
      body: { code: used },
    });
    expect(replay.status).not.toBe(200);
  });

  it("verrouille le compte après des échecs répétés de second facteur", async () => {
    const { email, cookie } = await verifiedUser();
    const { totpURI } = await enable(cookie);
    let locked = false;
    for (let i = 0; i < 12 && !locked; i++) {
      const r = await call("/sign-in/email", {
        ip: `198.51.100.${i + 1}`,
        body: { email, password: PASSWORD },
      });
      if (r.status !== 200) {
        locked = true;
        break;
      }
      const v = await call("/two-factor/verify-totp", {
        cookie: cookiesOf(r),
        body: { code: "000000" },
      });
      if (v.status === 429) locked = true;
    }
    expect(locked).toBe(true);
    void totpURI;
  });

  it("un compte du personnel ne peut pas retirer sa double authentification ; un autre le peut", async () => {
    const staff = await verifiedUser();
    const staffTwoFactor = await enable(staff.cookie);
    await t.db.insert(staffAccounts).values({
      userId: staff.userId,
      grantedBy: "test",
    });
    const staffSignIn = await call("/sign-in/email", {
      body: { email: staff.email, password: PASSWORD },
    });
    const staffCode = await currentCode(staffTwoFactor.totpURI);
    const verified = await call("/two-factor/verify-totp", {
      cookie: cookiesOf(staffSignIn),
      body: { code: staffCode },
    });
    const refused = await call("/two-factor/disable", {
      cookie: cookiesOf(verified),
      body: { password: PASSWORD },
    });
    expect(refused.status).toBe(403);
    const [still] = await t.db
      .select()
      .from(users)
      .where(eq(users.id, staff.userId));
    expect(still?.twoFactorEnabled).toBe(true);

    const other = await verifiedUser();
    const o = await enable(other.cookie);
    const off = await call("/two-factor/disable", {
      cookie: o.cookie,
      body: { password: PASSWORD },
    });
    expect(off.status).toBe(200);
  });
});

describe("avertissement de connexion inhabituelle", () => {
  it("ne dit rien à la première connexion ni depuis une adresse déjà vue, avertit depuis une adresse nouvelle", async () => {
    const { email } = await signUp();
    await verifyEmail(email, "203.0.113.50");
    const count = () =>
      mailer.sentTo(email).filter((m) => /Nouvelle connexion/.test(m.subject))
        .length;
    await call("/sign-in/email", {
      ip: "203.0.113.50",
      body: { email, password: PASSWORD },
    });
    expect(count()).toBe(0);
    await call("/sign-in/email", {
      ip: "203.0.113.50",
      body: { email, password: PASSWORD },
    });
    expect(count()).toBe(0);
    await call("/sign-in/email", {
      ip: "192.0.2.44",
      userAgent: "Mozilla/5.0 (X11; Linux) Firefox/130",
      body: { email, password: PASSWORD },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(count()).toBe(1);
    const mail = mailer.sentTo(email).find((m) => /Nouvelle connexion/.test(m.subject));
    expect(mail?.text).toContain("192.0.2.44");
    expect(mail?.text).not.toMatch(/https?:\/\//);
    const rows = await t.db.select().from(sessions);
    expect(rows.length).toBeGreaterThan(2);
  });
});
