import { createHash } from "node:crypto";

/**
 * Validation de la clé publique SSH fournie par le client (jamais de mot de passe en clair, D8).
 * La clé est écrite dans `authorized_keys` de la VM par cloud-init : on n'accepte donc QUE
 * `<type> <base64>` sur une seule ligne, sans options (`command=…`) et sans commentaire.
 */
export type SshKeyResult =
  | {
      ok: true;
      type: string;
      /** `type base64` — la forme écrite dans la configuration cloud-init. */
      normalized: string;
      /** Empreinte `SHA256:…` (celle qu'affichent ssh-keygen et ssh). */
      fingerprint: string;
    }
  | {
      ok: false;
      reason:
        | "empty"
        | "too_long"
        | "multiple_lines"
        | "private_key"
        | "unsupported_type"
        | "invalid_format"
        | "type_mismatch"
        | "weak_key";
    };

const TYPES = new Set([
  "ssh-ed25519",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
  "ssh-rsa",
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
]);
const MIN_RSA_BITS = 2048;

function readString(
  buf: Buffer,
  offset: number,
): { value: Buffer; next: number } | null {
  if (offset + 4 > buf.length) return null;
  const len = buf.readUInt32BE(offset);
  if (offset + 4 + len > buf.length) return null;
  return {
    value: buf.subarray(offset + 4, offset + 4 + len),
    next: offset + 4 + len,
  };
}

const ECDSA_POINT_BYTES: Record<string, number> = {
  nistp256: 65,
  nistp384: 97,
  nistp521: 133,
};
const MAX_RSA_BYTES = 2_050; // 16 384 bits plus l'octet de signe
const MAX_RSA_EXPONENT_BYTES = 8;

/** Point EC non compressé : 0x04 suivi de X et Y, de la taille exacte de la courbe. */
function validEcPoint(point: Buffer, curve: string): boolean {
  return point.length === ECDSA_POINT_BYTES[curve] && point[0] === 4;
}

/**
 * Vérifie les champs du blob après le nom du type (longueurs exactes, aucune donnée en trop) : une clé mal
 * formée serait acceptée ici puis refusée par sshd après le paiement, sans accès possible à la VM.
 */
function validBlobFields(type: string, blob: Buffer, offset: number): boolean {
  const fields: Buffer[] = [];
  let at = offset;
  while (at < blob.length) {
    const f = readString(blob, at);
    if (!f) return false;
    fields.push(f.value);
    at = f.next;
  }
  const [a, b, c] = fields;
  switch (type) {
    case "ssh-ed25519":
      return fields.length === 1 && a?.length === 32;
    case "sk-ssh-ed25519@openssh.com":
      return fields.length === 2 && a?.length === 32 && (b?.length ?? 0) > 0;
    case "ecdsa-sha2-nistp256":
    case "ecdsa-sha2-nistp384":
    case "ecdsa-sha2-nistp521": {
      const curve = type.slice("ecdsa-sha2-".length);
      return (
        fields.length === 2 &&
        a?.toString("utf8") === curve &&
        !!b &&
        validEcPoint(b, curve)
      );
    }
    case "sk-ecdsa-sha2-nistp256@openssh.com":
      return (
        fields.length === 3 &&
        a?.toString("utf8") === "nistp256" &&
        !!b &&
        validEcPoint(b, "nistp256") &&
        (c?.length ?? 0) > 0
      );
    case "ssh-rsa": {
      if (fields.length !== 2 || !a || !b) return false;
      // mpint : positif (bit de poids fort libre), exposant impair >= 3, module impair.
      const positive = (m: Buffer) =>
        m.length > 0 && ((m[0] as number) & 0x80) === 0;
      if (!positive(a) || !positive(b)) return false;
      if (a.length > MAX_RSA_EXPONENT_BYTES || b.length > MAX_RSA_BYTES)
        return false;
      const odd = (m: Buffer) => ((m[m.length - 1] as number) & 1) === 1;
      let exponent = 0n;
      for (const byte of a) exponent = exponent * 256n + BigInt(byte);
      return exponent >= 3n && odd(a) && odd(b);
    }
    default:
      return false;
  }
}

export function parseSshPublicKey(input: string): SshKeyResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };
  if (/PRIVATE KEY/.test(text)) return { ok: false, reason: "private_key" };
  if (text.length > 1_500) return { ok: false, reason: "too_long" };
  if (/[\r\n]/.test(text)) return { ok: false, reason: "multiple_lines" };
  const [type, body] = text.split(/\s+/, 2);
  if (!type || !TYPES.has(type)) {
    // Une ligne qui commence par des options (command="…", from="…") ou un type inconnu.
    return { ok: false, reason: "unsupported_type" };
  }
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body))
    return { ok: false, reason: "invalid_format" };
  const blob = Buffer.from(body, "base64");
  const declared = readString(blob, 0);
  if (!declared) return { ok: false, reason: "invalid_format" };
  if (declared.value.toString("utf8") !== type)
    return { ok: false, reason: "type_mismatch" };
  if (!validBlobFields(type, blob, declared.next))
    return { ok: false, reason: "invalid_format" };
  if (type === "ssh-rsa") {
    const e = readString(blob, declared.next);
    const n = e && readString(blob, e.next);
    if (!e || !n) return { ok: false, reason: "invalid_format" };
    const bits = n.value.subarray(n.value[0] === 0 ? 1 : 0).length * 8;
    if (bits < MIN_RSA_BITS) return { ok: false, reason: "weak_key" };
  }
  const fingerprint = `SHA256:${createHash("sha256")
    .update(blob)
    .digest("base64")
    .replace(/=+$/, "")}`;
  return { ok: true, type, normalized: `${type} ${body}`, fingerprint };
}
