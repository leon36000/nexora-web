import {
  and,
  asc,
  type Database,
  eq,
  isNull,
  ne,
  sql,
  type VaultKind,
  vaultSecrets,
} from "@nexora/db";
import {
  decryptSecret,
  type EncryptedRecord,
  encryptSecret,
  type Keyring,
  last4Of,
  rewrapDataKey,
  VaultError,
} from "./crypto.ts";

export interface StoredSecretSummary {
  ref: string;
  kind: VaultKind;
  last4: string;
  createdAt: Date;
  updatedAt: Date;
  revokedAt: Date | null;
}

/** Crée ou remplace le secret `ref` (nouvelle clé de données à chaque écriture) et le réactive. */
export async function putSecret(
  db: Database,
  keyring: Keyring,
  input: { ref: string; value: string; kind: VaultKind },
): Promise<{ ref: string; kind: VaultKind; last4: string; updatedAt: Date }> {
  const enc = encryptSecret(input.value, input.ref, keyring.current);
  const material = {
    kind: input.kind,
    algorithm: enc.algorithm,
    iv: enc.iv,
    ciphertext: enc.ciphertext,
    authTag: enc.authTag,
    dataKeyEncrypted: enc.dataKeyEncrypted,
    masterKeyVersion: enc.masterKeyVersion,
    last4: last4Of(input.value),
  };
  const [row] = await db
    .insert(vaultSecrets)
    .values({ ref: input.ref, ...material })
    .onConflictDoUpdate({
      target: vaultSecrets.ref,
      set: { ...material, revokedAt: null, updatedAt: sql`now()` },
    })
    .returning({
      ref: vaultSecrets.ref,
      kind: vaultSecrets.kind,
      last4: vaultSecrets.last4,
      updatedAt: vaultSecrets.updatedAt,
    });
  if (!row) throw new Error("coffre : écriture sans retour");
  return row;
}

export async function listSecrets(
  db: Database,
): Promise<StoredSecretSummary[]> {
  return db
    .select({
      ref: vaultSecrets.ref,
      kind: vaultSecrets.kind,
      last4: vaultSecrets.last4,
      createdAt: vaultSecrets.createdAt,
      updatedAt: vaultSecrets.updatedAt,
      revokedAt: vaultSecrets.revokedAt,
    })
    .from(vaultSecrets)
    .orderBy(asc(vaultSecrets.createdAt), asc(vaultSecrets.ref));
}

/** Révoque : efface tout le matériel chiffré. Idempotent. Renvoie null si la référence est inconnue. */
export async function revokeSecret(
  db: Database,
  ref: string,
): Promise<{ ref: string; revokedAt: Date } | null> {
  const [revoked] = await db
    .update(vaultSecrets)
    .set({
      iv: "",
      ciphertext: "",
      authTag: "",
      dataKeyEncrypted: "",
      revokedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(vaultSecrets.ref, ref), isNull(vaultSecrets.revokedAt)))
    .returning({ ref: vaultSecrets.ref, revokedAt: vaultSecrets.revokedAt });
  if (revoked?.revokedAt)
    return { ref: revoked.ref, revokedAt: revoked.revokedAt };

  const [existing] = await db
    .select({ ref: vaultSecrets.ref, revokedAt: vaultSecrets.revokedAt })
    .from(vaultSecrets)
    .where(eq(vaultSecrets.ref, ref));
  return existing?.revokedAt
    ? { ref: existing.ref, revokedAt: existing.revokedAt }
    : null;
}

/** Déchiffre un secret pour un usage serveur. Ne jamais journaliser le résultat. */
export async function readSecret(
  db: Database,
  keyring: Keyring,
  ref: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(vaultSecrets)
    .where(eq(vaultSecrets.ref, ref));
  if (!row) throw new VaultError("not_found", "secret introuvable");
  if (row.revokedAt) throw new VaultError("revoked", "secret révoqué");
  return decryptSecret(row as unknown as EncryptedRecord, ref, keyring);
}

/**
 * Rotation de la clé maîtresse : réencapsule la clé de données de chaque secret actif sous la clé
 * courante. Les textes chiffrés ne changent pas. Rejouable ; chaque ligne est traitée verrouillée.
 */
export async function rotateMasterKey(
  db: Database,
  keyring: Keyring,
): Promise<{ rewrapped: number; alreadyCurrent: number }> {
  const stale = await db
    .select({ id: vaultSecrets.id })
    .from(vaultSecrets)
    .where(
      and(
        isNull(vaultSecrets.revokedAt),
        ne(vaultSecrets.masterKeyVersion, keyring.current.version),
      ),
    );
  let rewrapped = 0;
  for (const { id } of stale) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(vaultSecrets)
        .where(eq(vaultSecrets.id, id))
        .for("update");
      if (
        !row ||
        row.revokedAt ||
        row.masterKeyVersion === keyring.current.version
      )
        return;
      const next = rewrapDataKey(
        row as unknown as EncryptedRecord,
        row.ref,
        keyring,
      );
      await tx
        .update(vaultSecrets)
        .set({
          dataKeyEncrypted: next.dataKeyEncrypted,
          masterKeyVersion: next.masterKeyVersion,
        })
        .where(eq(vaultSecrets.id, id));
      rewrapped++;
    });
  }
  const active = await db
    .select({ id: vaultSecrets.id })
    .from(vaultSecrets)
    .where(
      and(
        isNull(vaultSecrets.revokedAt),
        eq(vaultSecrets.masterKeyVersion, keyring.current.version),
      ),
    );
  return { rewrapped, alreadyCurrent: active.length - rewrapped };
}
