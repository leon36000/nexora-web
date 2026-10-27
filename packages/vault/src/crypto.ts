import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement par enveloppe (D2).
 *  - Chaque secret est chiffré en AES-256-GCM par une clé de données aléatoire (jamais réutilisée).
 *  - La clé de données est elle-même chiffrée (AES-256-GCM) par la clé maîtresse, identifiée par
 *    une version : la rotation ne réencapsule que les clés de données.
 *  - La référence du secret est liée au chiffrement (données authentifiées additionnelles) : un
 *    enregistrement copié sous une autre référence est refusé.
 * Aucun message d'erreur ne contient de clé ni de valeur.
 */

export type VaultErrorCode =
  | "not_configured"
  | "decrypt_failed"
  | "key_version"
  | "not_found"
  | "revoked"
  | "scope_denied";

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

export const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface MasterKey {
  version: number;
  key: Buffer;
}

export interface Keyring {
  current: MasterKey;
  /** Ancienne clé, conservée le temps d'une rotation. */
  previous?: MasterKey;
}

export interface EncryptedRecord {
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  authTag: string;
  dataKeyEncrypted: string;
  masterKeyVersion: number;
}

const b64 = (b: Buffer) => b.toString("base64");
const fromB64 = (s: string) => Buffer.from(s, "base64");

export function parseMasterKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) {
    throw new VaultError(
      "not_configured",
      "clé maîtresse du coffre absente ou mal formée",
    );
  }
  const key = fromB64(value);
  if (key.length !== 32) {
    throw new VaultError(
      "not_configured",
      "la clé maîtresse du coffre doit faire 32 octets (base64)",
    );
  }
  return key;
}

function parseVersion(
  raw: string | undefined,
  fallback: number | undefined,
  name: string,
): number {
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (value === undefined || !Number.isInteger(value) || value < 1) {
    throw new VaultError(
      "not_configured",
      `${name} doit être un entier positif`,
    );
  }
  return value;
}

/** Construit le trousseau à partir de l'environnement. Échoue fermé si la configuration est invalide. */
export function loadKeyring(env: Record<string, string | undefined>): Keyring {
  const current: MasterKey = {
    version: parseVersion(
      env.NEXORA_VAULT_MASTER_KEY_VERSION,
      1,
      "NEXORA_VAULT_MASTER_KEY_VERSION",
    ),
    key: parseMasterKey(env.NEXORA_VAULT_MASTER_KEY),
  };
  if (!env.NEXORA_VAULT_MASTER_KEY_PREVIOUS) return { current };
  const previous: MasterKey = {
    version: parseVersion(
      env.NEXORA_VAULT_MASTER_KEY_PREVIOUS_VERSION,
      undefined,
      "NEXORA_VAULT_MASTER_KEY_PREVIOUS_VERSION",
    ),
    key: parseMasterKey(env.NEXORA_VAULT_MASTER_KEY_PREVIOUS),
  };
  if (previous.version === current.version) {
    throw new VaultError(
      "not_configured",
      "les versions de la clé courante et précédente doivent différer",
    );
  }
  return { current, previous };
}

const secretAad = (ref: string) => Buffer.from(`nexora-vault/v1/secret/${ref}`);
const keyAad = (ref: string, version: number) =>
  Buffer.from(`nexora-vault/v1/datakey/${ref}/${version}`);

function seal(key: Buffer, plaintext: Buffer, aad: Buffer) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, ciphertext, tag: cipher.getAuthTag() };
}

function open(
  key: Buffer,
  iv: Buffer,
  ciphertext: Buffer,
  tag: Buffer,
  aad: Buffer,
): Buffer {
  // Un tag GCM tronqué (4 octets) serait accepté par Node si on ne fixe pas
  // la longueur : on impose 16 octets et un IV de 12 octets partout.
  if (tag.length !== TAG_BYTES || iv.length !== IV_BYTES) {
    throw new Error("étiquette ou IV de longueur invalide");
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function wrapDataKey(dataKey: Buffer, ref: string, master: MasterKey): string {
  const sealed = seal(master.key, dataKey, keyAad(ref, master.version));
  return [sealed.iv, sealed.tag, sealed.ciphertext].map(b64).join(".");
}

function unwrapDataKey(
  wrapped: string,
  ref: string,
  master: MasterKey,
): Buffer {
  const [iv, tag, ciphertext] = wrapped.split(".").map(fromB64);
  if (!iv || !tag || !ciphertext) throw new Error("format invalide");
  return open(master.key, iv, ciphertext, tag, keyAad(ref, master.version));
}

export function encryptSecret(
  plaintext: string,
  ref: string,
  master: MasterKey,
): EncryptedRecord {
  const dataKey = randomBytes(32);
  try {
    const sealed = seal(
      dataKey,
      Buffer.from(plaintext, "utf8"),
      secretAad(ref),
    );
    return {
      algorithm: ALGORITHM,
      iv: b64(sealed.iv),
      ciphertext: b64(sealed.ciphertext),
      authTag: b64(sealed.tag),
      dataKeyEncrypted: wrapDataKey(dataKey, ref, master),
      masterKeyVersion: master.version,
    };
  } finally {
    dataKey.fill(0);
  }
}

function masterFor(version: number, keyring: Keyring): MasterKey {
  if (keyring.current.version === version) return keyring.current;
  if (keyring.previous?.version === version) return keyring.previous;
  throw new VaultError(
    "key_version",
    `version de clé maîtresse inconnue du trousseau : ${version}`,
  );
}

export function decryptSecret(
  record: EncryptedRecord,
  ref: string,
  keyring: Keyring,
): string {
  const master = masterFor(record.masterKeyVersion, keyring);
  let dataKey: Buffer | undefined;
  try {
    dataKey = unwrapDataKey(record.dataKeyEncrypted, ref, master);
    return open(
      dataKey,
      fromB64(record.iv),
      fromB64(record.ciphertext),
      fromB64(record.authTag),
      secretAad(ref),
    ).toString("utf8");
  } catch {
    throw new VaultError(
      "decrypt_failed",
      "déchiffrement impossible (données altérées ou mauvaise clé)",
    );
  } finally {
    dataKey?.fill(0);
  }
}

/** Réencapsule la clé de données sous la clé maîtresse courante ; le texte chiffré est inchangé. */
export function rewrapDataKey(
  record: EncryptedRecord,
  ref: string,
  keyring: Keyring,
): EncryptedRecord {
  if (record.masterKeyVersion === keyring.current.version) return record;
  const oldMaster = masterFor(record.masterKeyVersion, keyring);
  let dataKey: Buffer | undefined;
  try {
    dataKey = unwrapDataKey(record.dataKeyEncrypted, ref, oldMaster);
    return {
      ...record,
      dataKeyEncrypted: wrapDataKey(dataKey, ref, keyring.current),
      masterKeyVersion: keyring.current.version,
    };
  } catch {
    throw new VaultError(
      "decrypt_failed",
      "réencapsulation impossible (clé de données illisible)",
    );
  } finally {
    dataKey?.fill(0);
  }
}

/** 4 derniers caractères pour reconnaître une clé ; masqué si la valeur est trop courte pour que ce soit sûr. */
export function last4Of(value: string): string {
  return value.length >= 12 ? value.slice(-4) : "****";
}
