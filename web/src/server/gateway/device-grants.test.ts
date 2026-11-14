/**
 * Cycle de vie des accès d'appareils natifs (`gatewayDeviceGrants` + `apiKeys`) :
 * émission sans secret en clair en base, scopes et plafond de dépense, exigence de solde positif,
 * réémission atomique, rotation avec fenêtre de grâce de 300 s, révocation ciblée ou globale,
 * isolation inter-organisations et plafond d'appareils actifs par organisation.
 */
import { randomBytes } from "node:crypto";
import {
  apiKeys,
  credit,
  eq,
  gatewayDeviceGrants,
  organizations,
  users,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDeviceGrant,
  DeviceGrantError,
  findGrantByApiKeyId,
  getDeviceGrant,
  listDeviceGrants,
  MAX_ACTIVE_DEVICE_GRANTS_PER_ORG,
  ROTATION_GRACE_MS,
  revokeAllDeviceGrants,
  revokeDeviceGrant,
  rotateDeviceGrant,
} from "./device-grants";
import { authenticateApiKey } from "./keys";

const dbAvailable = Boolean(
  process.env.NEXORA_TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
if (!dbAvailable) {
  console.warn(
    "device-grants : tests d'intégration ignorés (NEXORA_TEST_DATABASE_URL / DATABASE_URL absent).",
  );
}

const uid = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

async function expectGrantError(
  promise: Promise<unknown>,
  expectedCode: string,
  expectedStatus?: number,
): Promise<DeviceGrantError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(DeviceGrantError);
    const grantErr = err as DeviceGrantError;
    expect(grantErr.code).toBe(expectedCode);
    if (expectedStatus !== undefined) {
      expect(grantErr.status).toBe(expectedStatus);
    }
    return grantErr;
  }
  throw new Error(`DeviceGrantError(${expectedCode}) attendue mais résolue.`);
}

describe.skipIf(!dbAvailable)(
  "accès d'appareils passerelle (PostgreSQL)",
  () => {
    let t: TestDatabase;
    let orgA: string;
    let orgB: string;
    let userA: string;
    let userB: string;

    beforeAll(async () => {
      t = await createTestDatabase();

      orgA = uid("orgA");
      orgB = uid("orgB");
      await t.db.insert(organizations).values([
        { id: orgA, name: "Org Alpha", slug: orgA },
        { id: orgB, name: "Org Beta", slug: orgB },
      ]);

      userA = uid("usrA");
      userB = uid("usrB");
      await t.db.insert(users).values([
        {
          id: userA,
          name: "Aline Tremblay",
          email: `${userA}@example.com`,
          emailVerified: true,
        },
        {
          id: userB,
          name: "Benoît Gagnon",
          email: `${userB}@example.com`,
          emailVerified: true,
        },
      ]);

      await credit(t.db, {
        organizationId: orgA,
        amountMicro: 25_000_000n,
        idempotencyKey: `topup-${orgA}`,
        configVersion: "test",
        source: "test",
      });
      await credit(t.db, {
        organizationId: orgB,
        amountMicro: 25_000_000n,
        idempotencyKey: `topup-${orgB}`,
        configVersion: "test",
        source: "test",
      });
    });

    afterAll(async () => {
      await t.drop();
    });

    it("émet une clé nxk_ de 47 caractères sans secret en clair, persiste scopes + spendCapCad et refuse requirePositiveBalance à solde nul", async () => {
      const t0 = new Date("2026-06-01T12:00:00.000Z");
      const issued = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-macbook-1",
        deviceLabel: "MacBook Pro Aline",
        product: "lifecode-desktop",
        scopes: { models: [], webpilot: ["search"] },
        spendCapCad: 2.5,
        requirePositiveBalance: true,
        now: t0,
      });

      expect(issued.key).toMatch(/^nxk_[A-Za-z0-9_-]+$/);
      expect(issued.key).toHaveLength(47);
      expect(issued.product).toBe("lifecode");
      expect(issued.scopes).toEqual({ models: [], webpilot: ["search"] });
      expect(issued.spend_cap_cad).toBe(2.5);

      const [grantRow] = await t.db
        .select()
        .from(gatewayDeviceGrants)
        .where(eq(gatewayDeviceGrants.id, issued.grant_id));
      expect(grantRow).toBeDefined();
      expect(JSON.stringify(grantRow)).not.toContain(issued.key);
      expect(JSON.stringify(grantRow)).not.toContain(issued.key.slice(12));

      const [keyRow] = await t.db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, grantRow!.apiKeyId));
      expect(keyRow).toBeDefined();
      const serializedKeyRow = JSON.stringify(keyRow, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
      expect(serializedKeyRow).not.toContain(issued.key);
      expect(serializedKeyRow).not.toContain(issued.key.slice(12));
      expect(keyRow!.allowedModels).toEqual([]);
      expect(keyRow!.webpilotOperations).toEqual(["search"]);
      expect(keyRow!.spendCapMicro).toBe(2_500_000n);

      const auth = await authenticateApiKey(t.db, `Bearer ${issued.key}`, t0);
      expect(auth.ok).toBe(true);

      // Organisation sans crédits (solde = 0) -> refus credits_required (402)
      const emptyOrg = uid("orgZero");
      await t.db
        .insert(organizations)
        .values({ id: emptyOrg, name: "Org Vide", slug: emptyOrg });

      await expectGrantError(
        createDeviceGrant(t.db, {
          organizationId: emptyOrg,
          userId: userA,
          deviceId: "dev-zero-1",
          deviceLabel: "Poste sans solde",
          product: "lifecode",
          requirePositiveBalance: true,
          now: t0,
        }),
        "credits_required",
        402,
      );
    });

    it("réémet sur le même (organizationId, deviceId, product) en révoquant atomiquement l'ancienne clé", async () => {
      const t0 = new Date("2026-06-02T10:00:00.000Z");
      const t1 = new Date(t0.getTime() + 10_000);

      const first = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-relogin-1",
        deviceLabel: "Poste Bureau",
        product: "workstudio-desktop",
        now: t0,
      });

      const second = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-relogin-1",
        deviceLabel: "Poste Bureau (reconnexion)",
        product: "workstudio",
        now: t1,
      });

      expect(second.grant_id).not.toBe(first.grant_id);
      expect(second.key).not.toBe(first.key);

      const oldAuth = await authenticateApiKey(t.db, `Bearer ${first.key}`, t1);
      expect(oldAuth).toEqual({ ok: false, code: "api_key_revoked" });

      const newAuth = await authenticateApiKey(
        t.db,
        `Bearer ${second.key}`,
        t1,
      );
      expect(newAuth.ok).toBe(true);

      const firstSummary = await getDeviceGrant(t.db, {
        organizationId: orgA,
        grantId: first.grant_id,
      });
      expect(firstSummary?.revoked_at).toBe(t1.toISOString());
      expect(firstSummary?.revoke_reason).toBe("replaced_by_relogin");
    });

    it("gère la rotation avec grâce de 300 s, bloque la rotation croisée entre appareils et révoque la clé en grâce lors d'une 2e rotation", async () => {
      const t0 = new Date("2026-06-03T08:00:00.000Z");

      const initial = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-rotate-main",
        deviceLabel: "Portable Rotation",
        product: "lifecode",
        now: t0,
      });

      const otherDevice = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-rotate-other",
        deviceLabel: "Autre Appareil",
        product: "lifecode",
        now: t0,
      });

      const [otherGrantRow] = await t.db
        .select()
        .from(gatewayDeviceGrants)
        .where(eq(gatewayDeviceGrants.id, otherDevice.grant_id));

      // Rotation tentée avec la clé d'un autre appareil -> cross_device_forbidden (403)
      await expectGrantError(
        rotateDeviceGrant(t.db, {
          organizationId: orgA,
          grantId: initial.grant_id,
          actingApiKeyId: otherGrantRow!.apiKeyId,
          now: t0,
        }),
        "cross_device_forbidden",
        403,
      );

      // 1re rotation légitime à t0
      const rotated1 = await rotateDeviceGrant(t.db, {
        organizationId: orgA,
        grantId: initial.grant_id,
        now: t0,
      });
      expect(rotated1.key).toMatch(/^nxk_[A-Za-z0-9_-]+$/);
      expect(rotated1.key).toHaveLength(47);
      expect(rotated1.key).not.toBe(initial.key);
      expect(rotated1.grace_expires_at).toBe(
        new Date(t0.getTime() + ROTATION_GRACE_MS).toISOString(),
      );

      // Pendant la fenêtre de grâce (+60s < 300s) : ancienne ET nouvelle clés valides
      const duringGrace = new Date(t0.getTime() + 60_000);
      const oldDuringGrace = await authenticateApiKey(
        t.db,
        `Bearer ${initial.key}`,
        duringGrace,
      );
      expect(oldDuringGrace.ok).toBe(true);

      const newDuringGrace = await authenticateApiKey(
        t.db,
        `Bearer ${rotated1.key}`,
        duringGrace,
      );
      expect(newDuringGrace.ok).toBe(true);

      // Après grace_expires_at : ancienne clé expirée, nouvelle toujours valide
      const afterGrace = new Date(t0.getTime() + ROTATION_GRACE_MS + 1_000);
      const oldAfterGrace = await authenticateApiKey(
        t.db,
        `Bearer ${initial.key}`,
        afterGrace,
      );
      expect(oldAfterGrace).toEqual({ ok: false, code: "api_key_expired" });

      const newAfterGrace = await authenticateApiKey(
        t.db,
        `Bearer ${rotated1.key}`,
        afterGrace,
      );
      expect(newAfterGrace.ok).toBe(true);

      // 2e rotation pendant qu'une clé est en grâce -> révoque immédiatement la clé précédente en grâce
      const tRot1 = new Date("2026-06-03T09:00:00.000Z");
      const fresh = await createDeviceGrant(t.db, {
        organizationId: orgA,
        userId: userA,
        deviceId: "dev-rotate-twice",
        deviceLabel: "Double Rotation",
        product: "lifecode",
        now: tRot1,
      });
      const r1 = await rotateDeviceGrant(t.db, {
        organizationId: orgA,
        grantId: fresh.grant_id,
        now: tRot1,
      });
      const tRot2 = new Date(tRot1.getTime() + 30_000);
      const r2 = await rotateDeviceGrant(t.db, {
        organizationId: orgA,
        grantId: fresh.grant_id,
        now: tRot2,
      });

      // fresh.key était en grâce lors de r1 : r2 doit l'avoir révoquée immédiatement à tRot2
      const freshAfterSecondRot = await authenticateApiKey(
        t.db,
        `Bearer ${fresh.key}`,
        tRot2,
      );
      expect(freshAfterSecondRot).toEqual({
        ok: false,
        code: "api_key_revoked",
      });
      // r1.key passe en grâce, r2.key est active
      expect(
        (await authenticateApiKey(t.db, `Bearer ${r1.key}`, tRot2)).ok,
      ).toBe(true);
      expect(
        (await authenticateApiKey(t.db, `Bearer ${r2.key}`, tRot2)).ok,
      ).toBe(true);
    });

    it("révoque immédiatement clé courante et clé en grâce (unitaire et globale), isole les organisations et impose le plafond d'appareils actifs", async () => {
      const t0 = new Date("2026-06-04T10:00:00.000Z");

      // Grant sur orgB avec rotation pour avoir à la fois clé courante + clé en grâce
      const grantB1 = await createDeviceGrant(t.db, {
        organizationId: orgB,
        userId: userB,
        deviceId: "dev-b-1",
        deviceLabel: "Appareil Beta 1",
        product: "creative-studio",
        now: t0,
      });
      const rotatedB1 = await rotateDeviceGrant(t.db, {
        organizationId: orgB,
        grantId: grantB1.grant_id,
        now: t0,
      });

      const [keyRowB1] = await t.db
        .select()
        .from(gatewayDeviceGrants)
        .where(eq(gatewayDeviceGrants.id, grantB1.grant_id));
      expect((await findGrantByApiKeyId(t.db, keyRowB1!.apiKeyId))?.id).toBe(
        grantB1.grant_id,
      );

      // Isolation inter-organisations : orgA ne peut ni lire, ni tourner, ni révoquer un grant de orgB
      expect(
        await getDeviceGrant(t.db, {
          organizationId: orgA,
          grantId: grantB1.grant_id,
        }),
      ).toBeNull();

      await expectGrantError(
        revokeDeviceGrant(t.db, {
          organizationId: orgA,
          grantId: grantB1.grant_id,
          now: t0,
        }),
        "grant_not_found",
        404,
      );

      // Révocation ciblée sur orgB : invalide immédiatement la clé courante ET la clé en grâce dès t0
      const revRes = await revokeDeviceGrant(t.db, {
        organizationId: orgB,
        grantId: grantB1.grant_id,
        reason: "user_logout",
        now: t0,
      });
      expect(revRes).toEqual({ revoked: true, grantId: grantB1.grant_id });

      expect(
        await authenticateApiKey(t.db, `Bearer ${grantB1.key}`, t0),
      ).toEqual({
        ok: false,
        code: "api_key_revoked",
      });
      expect(
        await authenticateApiKey(t.db, `Bearer ${rotatedB1.key}`, t0),
      ).toEqual({
        ok: false,
        code: "api_key_revoked",
      });

      // revokeAllDeviceGrants : révoque tous les grants actifs de orgB (y compris clés en grâce) sans toucher orgA
      const gAll1 = await createDeviceGrant(t.db, {
        organizationId: orgB,
        userId: userB,
        deviceId: "dev-b-all-1",
        deviceLabel: "Beta All 1",
        product: "lifecode",
        now: t0,
      });
      const gAll1Rot = await rotateDeviceGrant(t.db, {
        organizationId: orgB,
        grantId: gAll1.grant_id,
        now: t0,
      });
      const gAll2 = await createDeviceGrant(t.db, {
        organizationId: orgB,
        userId: userB,
        deviceId: "dev-b-all-2",
        deviceLabel: "Beta All 2",
        product: "webpilot",
        now: t0,
      });

      const orgAActiveBefore = await listDeviceGrants(t.db, {
        organizationId: orgA,
      });
      expect(orgAActiveBefore.length).toBeGreaterThan(0);

      const allRevoked = await revokeAllDeviceGrants(t.db, {
        organizationId: orgB,
        now: t0,
      });
      expect(allRevoked.revokedCount).toBe(2);

      for (const k of [gAll1.key, gAll1Rot.key, gAll2.key]) {
        expect(await authenticateApiKey(t.db, `Bearer ${k}`, t0)).toEqual({
          ok: false,
          code: "api_key_revoked",
        });
      }
      expect(
        await listDeviceGrants(t.db, { organizationId: orgB }),
      ).toHaveLength(0);
      expect(
        (await listDeviceGrants(t.db, { organizationId: orgA })).length,
      ).toBe(orgAActiveBefore.length);

      // Plafond d'appareils actifs par organisation (MAX_ACTIVE_DEVICE_GRANTS_PER_ORG)
      for (let i = 0; i < MAX_ACTIVE_DEVICE_GRANTS_PER_ORG; i++) {
        await createDeviceGrant(t.db, {
          organizationId: orgB,
          userId: userB,
          deviceId: `dev-cap-${i}`,
          deviceLabel: `Appareil ${i}`,
          product: "lifecode",
          now: t0,
        });
      }

      await expectGrantError(
        createDeviceGrant(t.db, {
          organizationId: orgB,
          userId: userB,
          deviceId: "dev-cap-overflow",
          deviceLabel: "Appareil en trop",
          product: "lifecode",
          now: t0,
        }),
        "too_many_devices",
        429,
      );
    });
  },
);
