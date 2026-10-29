import { randomBytes } from "node:crypto";
import { apiKeys, eq } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "../vault/crypto";
import { readSecret } from "../vault/store";
import { hashApiKey, revokeApiKey } from "./keys";
import { ensureModelAccess } from "./provision";
import { newOrganization } from "./test-support";

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const input = (organizationId: string) => ({
  organizationId,
  gatewayUrl: "https://gx10-e526.tail0c55ff.ts.net:10000/v1",
  defaultModel: "nexora/glm-5.3",
});

describe("accès modèle automatique d'une instance WorkStudio", () => {
  it("crée une clé liée à l'organisation, la range dans le coffre et rend les trois réglages", async () => {
    const org = await newOrganization(t.db);
    const out = await ensureModelAccess(t.db, keyring, input(org));
    expect(out.created).toBe(true);
    expect(out.env.NEXORA_UPSTREAM_URL).toBe(
      "https://gx10-e526.tail0c55ff.ts.net:10000/v1",
    );
    expect(out.env.NEXORA_UPSTREAM_MODEL).toBe("nexora/glm-5.3");
    expect(out.env.NEXORA_UPSTREAM_KEY).toMatch(/^nxk_/);
    // la clé est celle de l'organisation, et seule l'empreinte est en base
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(out.env.NEXORA_UPSTREAM_KEY)));
    expect(row?.organizationId).toBe(org);
    expect(row?.name).toBe("WorkStudio (automatique)");
    // le coffre garde la valeur, chiffrée
    expect(await readSecret(t.db, keyring, `workstudio-key.${org}`)).toBe(
      out.env.NEXORA_UPSTREAM_KEY,
    );
  });

  it("est idempotent : un second appel rend la même clé sans en créer une autre", async () => {
    const org = await newOrganization(t.db);
    const first = await ensureModelAccess(t.db, keyring, input(org));
    const again = await ensureModelAccess(t.db, keyring, input(org));
    expect(again.created).toBe(false);
    expect(again.env.NEXORA_UPSTREAM_KEY).toBe(first.env.NEXORA_UPSTREAM_KEY);
    const rows = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, org));
    expect(rows).toHaveLength(1);
  });

  it("remplace la clé si le client l'a révoquée", async () => {
    const org = await newOrganization(t.db);
    const first = await ensureModelAccess(t.db, keyring, input(org));
    const [row] = await t.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, org));
    await revokeApiKey(t.db, org, row?.id as string);
    const next = await ensureModelAccess(t.db, keyring, input(org));
    expect(next.created).toBe(true);
    expect(next.env.NEXORA_UPSTREAM_KEY).not.toBe(
      first.env.NEXORA_UPSTREAM_KEY,
    );
    expect(await readSecret(t.db, keyring, `workstudio-key.${org}`)).toBe(
      next.env.NEXORA_UPSTREAM_KEY,
    );
  });

  it("isole les organisations", async () => {
    const a = await newOrganization(t.db);
    const b = await newOrganization(t.db);
    const ka = await ensureModelAccess(t.db, keyring, input(a));
    const kb = await ensureModelAccess(t.db, keyring, input(b));
    expect(ka.env.NEXORA_UPSTREAM_KEY).not.toBe(kb.env.NEXORA_UPSTREAM_KEY);
  });

  it("refuse une adresse de passerelle non sûre ou un modèle mal formé", async () => {
    const org = await newOrganization(t.db);
    await expect(
      ensureModelAccess(t.db, keyring, {
        ...input(org),
        gatewayUrl: "http://exemple.ca/v1",
      }),
    ).rejects.toThrow(/https/);
    await expect(
      ensureModelAccess(t.db, keyring, {
        ...input(org),
        gatewayUrl: "https://u:p@exemple.ca/v1",
      }),
    ).rejects.toThrow();
    await expect(
      ensureModelAccess(t.db, keyring, {
        ...input(org),
        defaultModel: "pas un modèle !",
      }),
    ).rejects.toThrow(/modèle/);
  });

  it("accepte la boucle locale en développement seulement", async () => {
    const org = await newOrganization(t.db);
    await expect(
      ensureModelAccess(t.db, keyring, {
        ...input(org),
        gatewayUrl: "http://127.0.0.1:3500/v1",
      }),
    ).rejects.toThrow(/https/);
    const ok = await ensureModelAccess(t.db, keyring, {
      ...input(org),
      gatewayUrl: "http://127.0.0.1:3500/v1",
      allowLoopback: true,
    });
    expect(ok.env.NEXORA_UPSTREAM_URL).toBe("http://127.0.0.1:3500/v1");
  });
});
