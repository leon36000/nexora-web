import { createHash } from "node:crypto";
import { apiKeys, codeDeviceCodes, eq, organizations, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authenticateApiKey, createApiKey } from "../gateway/keys";
import { newOrganization } from "../gateway/test-support";
import {
  type DeviceDeps,
  type DeviceSession,
  generateUserCode,
  handleDeviceApprove,
  handleDevicePoll,
  handleDeviceStart,
  lookupDeviceRequest,
  normalizeUserCode,
  USER_CODE_ALPHABET,
} from "./device";

let t: TestDatabase;
const SITE = "http://localhost:3722";
const logs: string[] = [];
let clock = new Date("2026-10-30T15:00:00Z");

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const log = createLogger({
  name: "test",
  sink: (line: string) => {
    logs.push(line);
  },
});

let seq = 0;
/** Une personne : utilisateur, organisation (nommée) et contexte de session. */
async function person(
  over: Partial<DeviceSession> = {},
  opts: { name?: string } = {},
) {
  seq += 1;
  const orgId = await newOrganization(t.db);
  if (opts.name)
    await t.db
      .update(organizations)
      .set({ name: opts.name })
      .where(eq(organizations.id, orgId));
  const userId = `usr_dev_${seq}_${Math.random().toString(36).slice(2, 8)}`;
  await t.db.insert(users).values({
    id: userId,
    name: "Marie",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  const session: DeviceSession = {
    userId,
    organizationId: orgId,
    emailVerified: true,
    isStaff: false,
    twoFactorEnabled: false,
    ...over,
  };
  return { orgId, userId, session };
}

const deps = (
  session: DeviceSession | null = null,
  over: Partial<DeviceDeps> = {},
): DeviceDeps => ({
  db: () => t.db,
  siteUrl: SITE,
  now: () => clock,
  log,
  defaultModel: () => "nexora/test-model",
  getContext: async () => session,
  ...over,
});

let ip = 0;
const post = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${SITE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for":
        headers["x-forwarded-for"] ??
        `10.0.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const approveReq = (
  body: unknown,
  origin = SITE,
  extra: Record<string, string> = {},
) => post("/api/code/device/approve", body, { origin, ...extra });

async function start(name = "poste-de-marie", d = deps()) {
  const res = await handleDeviceStart(
    post("/api/code/device/start", {
      client: "nexora-code",
      client_version: "2.2.3",
      device_name: name,
    }),
    d,
  );
  expect(res.status).toBe(200);
  return (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
}
type PollBody = {
  status: string;
  api_key: string;
  key_prefix: string;
  organization_name: string;
  user_email: string;
  default_model: string;
  error: { code: string };
};
const poll = async (device_code: string, d = deps(), headers = {}) => {
  const res = await handleDevicePoll(
    post("/api/code/device/poll", { device_code }, headers),
    d,
  );
  return {
    status: res.status,
    body: (await res.json()) as PollBody,
    res,
  };
};
const dump = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("code d'utilisateur", () => {
  it("haute entropie, sans caractère ambigu, au format NXC-XXXX-XXXX", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const code = generateUserCode();
      expect(code).toMatch(/^NXC-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(code.replace(/^NXC-/, "").replace("-", "")).toMatch(
        new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`),
      );
      seen.add(code);
    }
    expect(seen.size).toBe(3000);
    for (const bad of ["0", "O", "1", "I", "L", "U"])
      expect(USER_CODE_ALPHABET).not.toContain(bad);
    // au moins 38 bits (8 caractères sur 28)
    expect(Math.log2(USER_CODE_ALPHABET.length) * 8).toBeGreaterThan(38);
  });

  it("se normalise : casse, tirets, espaces, préfixe", () => {
    const code = generateUserCode();
    const bare = code.replace(/^NXC-/, "").replace("-", "");
    expect(normalizeUserCode(code.toLowerCase())).toBe(bare);
    expect(normalizeUserCode(` ${bare.slice(0, 4)} ${bare.slice(4)} `)).toBe(
      bare,
    );
    expect(normalizeUserCode("NXC-4F7K")).toBeNull();
    expect(normalizeUserCode("")).toBeNull();
    expect(normalizeUserCode("NXC-0000-1111")).toBeNull();
  });
});

describe("POST /api/code/device/start", () => {
  it("rend la forme du contrat, sans cache", async () => {
    const res = await handleDeviceStart(
      post("/api/code/device/start", {
        client: "nexora-code",
        client_version: "2.2.3",
        device_name: "poste-de-marie",
      }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const b = await res.json();
    expect(b.device_code.length).toBeGreaterThanOrEqual(32);
    expect(b.user_code).toMatch(/^NXC-/);
    expect(b.verification_uri).toBe(`${SITE}/code/device`);
    expect(b.verification_uri_complete).toBe(
      `${SITE}/code/device?user_code=${encodeURIComponent(b.user_code)}`,
    );
    expect(b.expires_in).toBe(600);
    expect(b.interval).toBe(5);
  });

  it("ne conserve que des empreintes (jamais le code d'appareil ni celui d'utilisateur)", async () => {
    const b = await start();
    const [row] = await t.db
      .select()
      .from(codeDeviceCodes)
      .where(
        eq(codeDeviceCodes.deviceCodeHash, sha(`nxc-device:${b.device_code}`)),
      );
    expect(row?.userCodeHash).toBe(
      sha(`nxc-user:${normalizeUserCode(b.user_code)}`),
    );
    expect(dump(row)).not.toContain(b.device_code);
    expect(dump(row)).not.toContain(normalizeUserCode(b.user_code) as string);
    expect(row?.status).toBe("pending");
    expect(row?.expiresAt.getTime()).toBe(clock.getTime() + 600_000);
    expect(row?.deviceName).toBe("poste-de-marie");
  });

  it("nettoie le nom de l'appareil et refuse un corps illisible", async () => {
    const b = await start("  poste\u0000 de\nMarie<script>  ".padEnd(200, "x"));
    const [row] = await t.db
      .select()
      .from(codeDeviceCodes)
      .where(
        eq(codeDeviceCodes.deviceCodeHash, sha(`nxc-device:${b.device_code}`)),
      );
    const name = row?.deviceName ?? "";
    expect(
      [...name].some((c) => c.charCodeAt(0) < 32 || c === "<" || c === ">"),
    ).toBe(false);
    expect((row?.deviceName ?? "").length).toBeLessThanOrEqual(60);
    const bad = await handleDeviceStart(
      post("/api/code/device/start", "{pas du json"),
      deps(),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid_request");
    const big = await handleDeviceStart(
      post("/api/code/device/start", { device_name: "a".repeat(20_000) }),
      deps(),
    );
    expect(big.status).toBe(413);
  });

  it("accepte l'absence de nom d'appareil (valeur par défaut)", async () => {
    const res = await handleDeviceStart(
      post("/api/code/device/start", {}),
      deps(),
    );
    expect(res.status).toBe(200);
  });

  it("limite le débit par adresse", async () => {
    const same = { "x-forwarded-for": "203.0.113.77" };
    let last = 200;
    for (let i = 0; i < 12; i++) {
      const res = await handleDeviceStart(
        post("/api/code/device/start", {}, same),
        deps(),
      );
      last = res.status;
      if (res.status === 429) {
        expect((await res.json()).error.code).toBe("rate_limited");
        expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
        break;
      }
    }
    expect(last).toBe(429);
  });

  it("refuse toute autre méthode", async () => {
    const res = await handleDeviceStart(
      new Request(`${SITE}/api/code/device/start`, { method: "GET" }),
      deps(),
    );
    expect(res.status).toBe(405);
  });
});

describe("POST /api/code/device/poll", () => {
  it("pending, puis slow_down si le CLI va trop vite", async () => {
    const b = await start();
    const first = await poll(b.device_code);
    expect(first).toMatchObject({ status: 200, body: { status: "pending" } });
    const fast = await poll(b.device_code);
    expect(fast.body.status).toBe("slow_down");
    clock = new Date(clock.getTime() + 6000);
    expect((await poll(b.device_code)).body.status).toBe("pending");
  });

  it("code inconnu ou mal formé : 400 invalid_device_code", async () => {
    const unknown = await poll("a".repeat(43));
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("invalid_device_code");
    const malformed = await poll("court");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("invalid_device_code");
    const missing = await handleDevicePoll(
      post("/api/code/device/poll", {}),
      deps(),
    );
    expect(missing.status).toBe(400);
  });

  it("expired après la durée de vie", async () => {
    const b = await start();
    clock = new Date(clock.getTime() + 601_000);
    expect((await poll(b.device_code)).body).toMatchObject({
      status: "expired",
    });
  });

  it("denied quand la personne refuse", async () => {
    const b = await start();
    const p = await person();
    const res = await handleDeviceApprove(
      approveReq({ user_code: b.user_code, decision: "deny" }),
      deps(p.session),
    );
    expect(res.status).toBe(200);
    clock = new Date(clock.getTime() + 6000);
    expect((await poll(b.device_code)).body.status).toBe("denied");
  });

  it("par débit excessif répond slow_down avec un statut 200 (le CLI échouerait sur un 429)", async () => {
    const b = await start();
    const d = deps(null, {
      limits: { pollPerDevice: { limit: 3, windowSeconds: 60 } },
    });
    const answers: string[] = [];
    for (let i = 0; i < 5; i++) {
      clock = new Date(clock.getTime() + 6000); // l'intervalle est respecté : seule la limite de débit parle
      const r = await poll(b.device_code, d);
      expect(r.status).toBe(200);
      answers.push(r.body.status);
    }
    expect(answers).toEqual([
      "pending",
      "pending",
      "pending",
      "slow_down",
      "slow_down",
    ]);
  });
});

describe("POST /api/code/device/approve", () => {
  it("exige une session, une origine du site, un courriel vérifié, la 2FA du personnel", async () => {
    const b = await start();
    const p = await person();
    expect(
      (
        await handleDeviceApprove(
          approveReq({ user_code: b.user_code }),
          deps(null),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleDeviceApprove(
          approveReq({ user_code: b.user_code }, "https://evil.example"),
          deps(p.session),
        )
      ).status,
    ).toBe(403);
    const noOrigin = new Request(`${SITE}/api/code/device/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_code: b.user_code }),
    });
    expect((await handleDeviceApprove(noOrigin, deps(p.session))).status).toBe(
      403,
    );
    const unverified = await person({ emailVerified: false });
    const r1 = await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(unverified.session),
    );
    expect(r1.status).toBe(403);
    expect((await r1.json()).error.code).toBe("email_not_verified");
    const staff = await person({ isStaff: true, twoFactorEnabled: false });
    const r2 = await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(staff.session),
    );
    expect(r2.status).toBe(403);
    expect((await r2.json()).error.code).toBe("two_factor_required");
    // rien n'a été approuvé par ces refus
    expect((await poll(b.device_code)).body.status).toBe("pending");
    const staff2fa = await person({ isStaff: true, twoFactorEnabled: true });
    const ok = await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(staff2fa.session),
    );
    expect(ok.status).toBe(200);
  });

  it("un code inconnu, expiré, déjà approuvé ou mal formé donne la MÊME réponse", async () => {
    const p = await person();
    const used = await start();
    expect(
      (
        await handleDeviceApprove(
          approveReq({ user_code: used.user_code }),
          deps(p.session),
        )
      ).status,
    ).toBe(200);
    const stale = await start();
    clock = new Date(clock.getTime() + 601_000);
    const answers = [];
    for (const code of [
      used.user_code, // déjà approuvé
      stale.user_code, // expiré
      generateUserCode(), // inconnu
      "n'importe quoi", // mal formé
    ]) {
      const res = await handleDeviceApprove(
        approveReq({ user_code: code }),
        deps(p.session),
      );
      answers.push({ status: res.status, body: await res.json() });
    }
    for (const a of answers) expect(a).toEqual(answers[0]);
    expect(answers[0]?.status).toBe(400);
    expect(answers[0]?.body.error.code).toBe("invalid_code");
  });

  it("n'approuve qu'une fois, même en parallèle", async () => {
    const b = await start();
    const p1 = await person();
    const p2 = await person();
    const [a, c] = await Promise.all([
      handleDeviceApprove(
        approveReq({ user_code: b.user_code }),
        deps(p1.session),
      ),
      handleDeviceApprove(
        approveReq({ user_code: b.user_code }),
        deps(p2.session),
      ),
    ]);
    expect([a.status, c.status].sort()).toEqual([200, 400]);
  });

  it("l'organisation et la personne viennent de la session, pas du corps", async () => {
    const b = await start();
    const p = await person();
    const other = await person();
    const res = await handleDeviceApprove(
      approveReq({
        user_code: b.user_code,
        organization_id: other.orgId,
        user_id: other.userId,
      }),
      deps(p.session),
    );
    expect(res.status).toBe(200);
    const [row] = await t.db
      .select()
      .from(codeDeviceCodes)
      .where(
        eq(codeDeviceCodes.deviceCodeHash, sha(`nxc-device:${b.device_code}`)),
      );
    expect(row?.approvedUserId).toBe(p.userId);
    expect(row?.approvedOrganizationId).toBe(p.orgId);
  });

  it("limite les essais par personne (pas de recherche de code par force brute)", async () => {
    const p = await person();
    let limited = false;
    for (let i = 0; i < 40; i++) {
      const res = await handleDeviceApprove(
        approveReq({ user_code: generateUserCode() }),
        deps(p.session),
      );
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("accepte le code tel que la personne le tape (minuscules, sans tirets)", async () => {
    const b = await start();
    const p = await person();
    const typed = b.user_code
      .replace(/^NXC-/, "")
      .replace("-", "")
      .toLowerCase();
    expect(
      (
        await handleDeviceApprove(
          approveReq({ user_code: typed }),
          deps(p.session),
        )
      ).status,
    ).toBe(200);
  });
});

describe("remise de la clé nxk_", () => {
  it("la clé est remise UNE fois au poll, hachée au repos, nommée d'après l'appareil", async () => {
    logs.length = 0;
    const p = await person({}, { name: "Atelier Test" });
    const b = await start("portable de Marie");
    await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    clock = new Date(clock.getTime() + 6000);
    const ok = await poll(b.device_code);
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("cache-control")).toBe("no-store");
    expect(ok.body.status).toBe("approved");
    const key = ok.body.api_key as string;
    expect(key).toMatch(/^nxk_[A-Za-z0-9_-]{43}$/);
    expect(ok.body.key_prefix).toBe(key.slice(0, 11));
    expect(ok.body.organization_name).toBe("Atelier Test");
    expect(ok.body.user_email).toBe(`${p.userId}@example.com`);
    expect(ok.body.default_model).toBe("nexora/test-model");

    const [stored] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, p.orgId));
    expect(stored?.name).toBe("Nexora Code (portable de Marie)");
    expect(stored?.keyHash).toBe(sha(key));
    expect(dump(stored)).not.toContain(key);
    expect(stored?.createdBy).toBe(p.userId);
    expect(stored?.webpilotOperations).toBeNull();
    expect(stored?.ragAccess).toBeNull();
    expect((await authenticateApiKey(t.db, `Bearer ${key}`)).ok).toBe(true);

    // second sondage : plus rien
    clock = new Date(clock.getTime() + 6000);
    const again = await poll(b.device_code);
    expect(again.body).toEqual({ status: "expired" });
    // la clé n'est ni dans une table de codes ni dans les journaux
    const [row] = await t.db
      .select()
      .from(codeDeviceCodes)
      .where(
        eq(codeDeviceCodes.deviceCodeHash, sha(`nxc-device:${b.device_code}`)),
      );
    expect(row?.status).toBe("delivered");
    expect(row?.apiKeyId).toBe(stored?.id);
    expect(dump(row)).not.toContain(key);
    expect(logs.join("\n")).not.toContain(key);
    expect(logs.join("\n")).not.toContain(b.device_code);
    expect(logs.join("\n")).not.toContain(b.user_code);
  });

  it("la clé existe même sans crédit ni abonnement (c'est la passerelle qui refuse les appels)", async () => {
    const p = await person();
    const b = await start();
    await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    clock = new Date(clock.getTime() + 6000);
    const res = await poll(b.device_code);
    expect(res.body.status).toBe("approved");
  });

  it("renouvelle : une nouvelle connexion du même appareil révoque la clé précédente", async () => {
    const p = await person();
    const keys: string[] = [];
    for (let i = 0; i < 2; i++) {
      const b = await start("même-poste");
      await handleDeviceApprove(
        approveReq({ user_code: b.user_code }),
        deps(p.session),
      );
      clock = new Date(clock.getTime() + 6000);
      keys.push((await poll(b.device_code)).body.api_key);
    }
    expect((await authenticateApiKey(t.db, `Bearer ${keys[0]}`)).ok).toBe(
      false,
    );
    expect((await authenticateApiKey(t.db, `Bearer ${keys[1]}`)).ok).toBe(true);
  });

  it("deux appareils différents gardent chacun leur clé", async () => {
    const p = await person();
    const keys: string[] = [];
    for (const name of ["bureau", "portable"]) {
      const b = await start(name);
      await handleDeviceApprove(
        approveReq({ user_code: b.user_code }),
        deps(p.session),
      );
      clock = new Date(clock.getTime() + 6000);
      keys.push((await poll(b.device_code)).body.api_key);
    }
    for (const k of keys)
      expect((await authenticateApiKey(t.db, `Bearer ${k}`)).ok).toBe(true);
  });

  it("une remise simultanée ne crée qu'une seule clé", async () => {
    const p = await person();
    const b = await start("course");
    await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    clock = new Date(clock.getTime() + 6000);
    const rs = await Promise.all([
      poll(b.device_code),
      poll(b.device_code),
      poll(b.device_code),
    ]);
    const approved = rs.filter((r) => r.body.status === "approved");
    expect(approved).toHaveLength(1);
    const rows = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, p.orgId));
    expect(rows).toHaveLength(1);
  });

  it("une approbation périmée avant la remise ne livre rien", async () => {
    const p = await person();
    const b = await start("trop-tard");
    await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    clock = new Date(clock.getTime() + 601_000);
    expect((await poll(b.device_code)).body).toEqual({ status: "expired" });
    expect(
      await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.organizationId, p.orgId)),
    ).toHaveLength(0);
  });

  it("plafond de clés atteint : refus clair à l'approbation", async () => {
    const p = await person();
    for (let i = 0; i < 25; i++)
      await createApiKey(t.db, { organizationId: p.orgId, name: `k${i}` });
    const b = await start("de-trop");
    const res = await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("key_limit");
  });
});

describe("lookupDeviceRequest (page d'approbation)", () => {
  it("montre le nom de l'appareil d'une demande valide, rien d'autre pour le reste", async () => {
    const p = await person();
    const b = await start("poste de test");
    const found = await lookupDeviceRequest(
      deps(p.session),
      p.session,
      b.user_code,
    );
    expect(found).toMatchObject({
      state: "found",
      deviceName: "poste de test",
      client: "nexora-code",
    });
    expect(
      await lookupDeviceRequest(deps(p.session), p.session, generateUserCode()),
    ).toEqual({ state: "invalid" });
    expect(
      await lookupDeviceRequest(deps(p.session), p.session, "???"),
    ).toEqual({ state: "invalid" });
    await handleDeviceApprove(
      approveReq({ user_code: b.user_code }),
      deps(p.session),
    );
    expect(
      await lookupDeviceRequest(deps(p.session), p.session, b.user_code),
    ).toEqual({ state: "invalid" });
  });

  it("est limité par personne", async () => {
    const p = await person();
    let limited = false;
    for (let i = 0; i < 40; i++) {
      const r = await lookupDeviceRequest(
        deps(p.session),
        p.session,
        generateUserCode(),
      );
      if (r.state === "rate_limited") limited = true;
    }
    expect(limited).toBe(true);
  });
});
