import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  last4Of,
  loadKeyring,
  parseMasterKey,
  rewrapDataKey,
  VaultError,
} from "./crypto";

const b64 = () => randomBytes(32).toString("base64");
const ring = (version = 1, key = b64()) => ({
  current: { version, key: parseMasterKey(key) },
});

describe("chiffrement par enveloppe AES-256-GCM", () => {
  it("restitue la valeur d'origine", () => {
    const keyring = ring();
    const rec = encryptSecret(
      "sk-or-v1-abcdef0123456789",
      "openrouter.main",
      keyring.current,
    );
    expect(decryptSecret(rec, "openrouter.main", keyring)).toBe(
      "sk-or-v1-abcdef0123456789",
    );
  });

  it("ne laisse ni la valeur ni sa trace dans le matériel stocké", () => {
    const keyring = ring();
    const value = "valeur-secrète-à-ne-jamais-voir-0001";
    const rec = encryptSecret(value, "ref.test", keyring.current);
    const stored = JSON.stringify(rec);
    expect(stored).not.toContain(value);
    expect(stored).not.toContain(Buffer.from(value).toString("base64"));
    expect(rec.algorithm).toBe("aes-256-gcm");
    expect(rec.masterKeyVersion).toBe(1);
  });

  it("utilise une clé de données et un IV aléatoires par secret", () => {
    const keyring = ring();
    const a = encryptSecret("même valeur", "ref.a", keyring.current);
    const b = encryptSecret("même valeur", "ref.a", keyring.current);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.dataKeyEncrypted).not.toBe(b.dataKeyEncrypted);
  });

  it("détecte l'altération du texte chiffré, de l'étiquette ou de la clé de données", () => {
    const keyring = ring();
    const rec = encryptSecret("abcdefghijkl", "ref.t", keyring.current);
    const flip = (s: string) => `${s[0] === "A" ? "B" : "A"}${s.slice(1)}`;
    expect(() =>
      decryptSecret(
        { ...rec, ciphertext: flip(rec.ciphertext) },
        "ref.t",
        keyring,
      ),
    ).toThrow(VaultError);
    expect(() =>
      decryptSecret({ ...rec, authTag: flip(rec.authTag) }, "ref.t", keyring),
    ).toThrow(VaultError);
    expect(() =>
      decryptSecret(
        { ...rec, dataKeyEncrypted: flip(rec.dataKeyEncrypted) },
        "ref.t",
        keyring,
      ),
    ).toThrow(VaultError);
  });

  it("lie le secret à sa référence : un enregistrement copié sous une autre référence est refusé", () => {
    const keyring = ring();
    const rec = encryptSecret("abcdefghijkl", "ref.a", keyring.current);
    expect(() => decryptSecret(rec, "ref.b", keyring)).toThrow(VaultError);
  });

  it("refuse de déchiffrer avec une autre clé maîtresse, sans révéler de clé dans l'erreur", () => {
    const rec = encryptSecret("abcdefghijkl", "ref.a", ring(1).current);
    const otherKey = b64();
    try {
      decryptSecret(rec, "ref.a", ring(1, otherKey));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(VaultError);
      expect((e as VaultError).code).toBe("decrypt_failed");
      expect((e as Error).message).not.toContain(otherKey);
    }
  });

  it("refuse une version de clé maîtresse absente du trousseau", () => {
    const rec = encryptSecret("abcdefghijkl", "ref.a", ring(1).current);
    expect(() =>
      decryptSecret({ ...rec, masterKeyVersion: 7 }, "ref.a", ring(2)),
    ).toThrow(/version de clé/);
  });
});

describe("parseMasterKey / loadKeyring", () => {
  it("exige 32 octets en base64 et n'écho jamais la clé", () => {
    const bad = Buffer.from("trop-courte").toString("base64");
    try {
      parseMasterKey(bad);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(bad);
      expect((e as VaultError).code).toBe("not_configured");
    }
    expect(() => parseMasterKey("")).toThrow(VaultError);
    expect(parseMasterKey(b64())).toHaveLength(32);
  });

  it("lit la clé courante (version 1 par défaut) et la précédente si présente", () => {
    const cur = b64();
    const prev = b64();
    const kr = loadKeyring({
      NEXORA_VAULT_MASTER_KEY: cur,
      NEXORA_VAULT_MASTER_KEY_VERSION: "2",
      NEXORA_VAULT_MASTER_KEY_PREVIOUS: prev,
      NEXORA_VAULT_MASTER_KEY_PREVIOUS_VERSION: "1",
    });
    expect(kr.current.version).toBe(2);
    expect(kr.previous?.version).toBe(1);
    expect(loadKeyring({ NEXORA_VAULT_MASTER_KEY: cur }).current.version).toBe(
      1,
    );
  });

  it("échoue fermé sans clé maîtresse ou si les versions se confondent", () => {
    expect(() => loadKeyring({})).toThrow(VaultError);
    expect(() =>
      loadKeyring({
        NEXORA_VAULT_MASTER_KEY: b64(),
        NEXORA_VAULT_MASTER_KEY_PREVIOUS: b64(),
      }),
    ).toThrow(VaultError);
  });
});

describe("rotation de la clé maîtresse", () => {
  it("réencapsule seulement la clé de données ; le texte chiffré ne change pas", () => {
    const oldKey = b64();
    const newKey = b64();
    const v1 = { current: { version: 1, key: parseMasterKey(oldKey) } };
    const rec = encryptSecret("valeur-à-conserver-9", "ref.rot", v1.current);

    const rotating = {
      current: { version: 2, key: parseMasterKey(newKey) },
      previous: { version: 1, key: parseMasterKey(oldKey) },
    };
    const rewrapped = rewrapDataKey(rec, "ref.rot", rotating);
    expect(rewrapped.masterKeyVersion).toBe(2);
    expect(rewrapped.dataKeyEncrypted).not.toBe(rec.dataKeyEncrypted);
    expect(rewrapped.ciphertext).toBe(rec.ciphertext);
    expect(rewrapped.iv).toBe(rec.iv);

    // Une fois l'ancienne clé retirée, seule la nouvelle est nécessaire.
    const afterRetire = {
      current: { version: 2, key: parseMasterKey(newKey) },
    };
    expect(decryptSecret(rewrapped, "ref.rot", afterRetire)).toBe(
      "valeur-à-conserver-9",
    );
    // Et l'ancien enregistrement n'est plus lisible sans l'ancienne clé.
    expect(() => decryptSecret(rec, "ref.rot", afterRetire)).toThrow(
      VaultError,
    );
  });
});

describe("last4Of", () => {
  it("renvoie les 4 derniers caractères d'une valeur assez longue", () => {
    expect(last4Of("sk-or-v1-abcdef123456")).toBe("3456");
  });
  it("masque entièrement les valeurs trop courtes pour que 4 caractères restent sûrs", () => {
    expect(last4Of("abcd1234")).toBe("****");
  });
});
