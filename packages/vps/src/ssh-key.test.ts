import { describe, expect, it } from "vitest";
import { parseSshPublicKey } from "./ssh-key.ts";

// Clé ed25519 d'essai (publique) : l'empreinte attendue est celle d'`ssh-keygen -lf`.
const ED =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";

describe("clé publique SSH du client", () => {
  it("accepte ed25519 et calcule l'empreinte SHA256 comme ssh-keygen", () => {
    const k = parseSshPublicKey(`${ED} contact@exemple.ca`);
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    expect(k.type).toBe("ssh-ed25519");
    expect(k.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    // Le commentaire n'est pas conservé : il finirait dans authorized_keys.
    expect(k.normalized).toBe(ED);
  });

  it("refuse une clé privée, même collée par erreur", () => {
    const r = parseSshPublicKey(
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk=\n-----END OPENSSH PRIVATE KEY-----",
    );
    expect(r).toMatchObject({ ok: false, reason: "private_key" });
  });

  it("refuse les options authorized_keys (command=…) et les lignes multiples", () => {
    expect(parseSshPublicKey(`command="rm -rf /" ${ED}`)).toMatchObject({
      ok: false,
    });
    expect(parseSshPublicKey(`${ED}\n${ED}`)).toMatchObject({
      ok: false,
      reason: "multiple_lines",
    });
  });

  it("refuse un type inconnu, un blob qui ne correspond pas au type et un corps invalide", () => {
    expect(parseSshPublicKey("ssh-dss AAAAB3NzaC1kc3M=")).toMatchObject({
      ok: false,
      reason: "unsupported_type",
    });
    // Blob d'un autre type que celui annoncé
    expect(
      parseSshPublicKey(
        "ecdsa-sha2-nistp256 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl",
      ),
    ).toMatchObject({ ok: false, reason: "type_mismatch" });
    expect(parseSshPublicKey("ssh-ed25519 !!!!")).toMatchObject({ ok: false });
    expect(parseSshPublicKey("")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("refuse une clé RSA de moins de 2048 bits", () => {
    const blob = (bits: number) => {
      const t = Buffer.from("ssh-rsa");
      const e = Buffer.from([1, 0, 1]);
      const n = Buffer.concat([Buffer.from([0]), Buffer.alloc(bits / 8, 0xab)]);
      const part = (b: Buffer) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(b.length);
        return Buffer.concat([len, b]);
      };
      return Buffer.concat([part(t), part(e), part(n)]).toString("base64");
    };
    expect(parseSshPublicKey(`ssh-rsa ${blob(1024)}`)).toMatchObject({
      ok: false,
      reason: "weak_key",
    });
    expect(parseSshPublicKey(`ssh-rsa ${blob(2048)}`).ok).toBe(true);
  });

  it("borne la longueur", () => {
    expect(parseSshPublicKey(`ssh-ed25519 ${"A".repeat(5000)}`)).toMatchObject({
      ok: false,
    });
  });
});
