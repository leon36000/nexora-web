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
