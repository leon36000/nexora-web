import { randomBytes } from "node:crypto";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKeyring } from "./crypto";
import { putSecret, readSecretForScope, secretKindOf } from "./store";

let t: TestDatabase;
const keyring = loadKeyring({
  NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
});
beforeAll(async () => {
  t = await createTestDatabase();
  await putSecret(t.db, keyring, {
    ref: "stripe.secret_key",
    value: "sk_test_valeur_de_plateforme",
    kind: "payment",
  });
  await putSecret(t.db, keyring, {
    ref: "openrouter.cle",
    value: "sk-or-valeur",
    kind: "llm_provider",
  });
  await putSecret(t.db, keyring, {
    ref: "proxmox.pve1",
    value: "jeton-proxmox",
    kind: "proxmox",
  });
  await putSecret(t.db, keyring, {
    ref: "workstudio.espace",
    value: "sk-nexora-espace",
    kind: "other",
  });
});
afterAll(async () => {
  await t.drop();
});

describe("lecture du coffre par portée", () => {
  it("lit la clé quand l'usage correspond au type", async () => {
    expect(
      await readSecretForScope(
        t.db,
        keyring,
        "openrouter.cle",
        "model-provider",
      ),
    ).toBe("sk-or-valeur");
    expect(
      await readSecretForScope(t.db, keyring, "proxmox.pve1", "proxmox"),
    ).toBe("jeton-proxmox");
    expect(
      await readSecretForScope(
        t.db,
        keyring,
        "workstudio.espace",
        "workstudio-instance",
      ),
    ).toBe("sk-nexora-espace");
  });

  it("refuse (scope_denied) une clé de paiement comme clé de fournisseur, d'instance ou de Proxmox", async () => {
    for (const scope of [
      "model-provider",
      "workstudio-instance",
      "proxmox",
    ] as const) {
      const err = await readSecretForScope(
        t.db,
        keyring,
        "stripe.secret_key",
        scope,
      ).catch((e) => e);
      expect(err.code, scope).toBe("scope_denied");
      expect(String(err.message), scope).not.toContain("sk_test_valeur");
    }
  });

  it("refuse une clé de fournisseur comme jeton Proxmox, et un jeton Proxmox comme clé de fournisseur", async () => {
    expect(
      (
        await readSecretForScope(
          t.db,
          keyring,
          "openrouter.cle",
          "proxmox",
        ).catch((e) => e)
      ).code,
    ).toBe("scope_denied");
    expect(
      (
        await readSecretForScope(
          t.db,
          keyring,
          "proxmox.pve1",
          "model-provider",
        ).catch((e) => e)
      ).code,
    ).toBe("scope_denied");
    expect(
      (
        await readSecretForScope(
          t.db,
          keyring,
          "workstudio.espace",
          "model-provider",
        ).catch((e) => e)
      ).code,
    ).toBe("scope_denied");
  });

  it("une référence absente reste « introuvable », sans fuite", async () => {
    expect(
      (
        await readSecretForScope(
          t.db,
          keyring,
          "absent.cle",
          "model-provider",
        ).catch((e) => e)
      ).code,
    ).toBe("not_found");
    expect(await secretKindOf(t.db, "absent.cle")).toBeNull();
    expect(await secretKindOf(t.db, "proxmox.pve1")).toBe("proxmox");
  });
});
