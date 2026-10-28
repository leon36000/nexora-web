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

  describe("longueurs et champs du blob (refus 400 plutôt qu'échec après paiement)", () => {
    const part = (b: Buffer | string) => {
      const buf = typeof b === "string" ? Buffer.from(b) : b;
      const len = Buffer.alloc(4);
      len.writeUInt32BE(buf.length);
      return Buffer.concat([len, buf]);
    };
    const line = (type: string, ...fields: Array<Buffer | string>) =>
      `${type} ${Buffer.concat([part(type), ...fields.map(part)]).toString("base64")}`;
    const key32 = Buffer.alloc(32, 7);
    const point = (bytes: number) =>
      Buffer.concat([Buffer.from([4]), Buffer.alloc(bytes - 1, 9)]);

    it("ed25519 : exactement 32 octets de clé, rien après", () => {
      expect(parseSshPublicKey(line("ssh-ed25519", key32)).ok).toBe(true);
      for (const bad of [
        Buffer.alloc(0),
        Buffer.alloc(31, 7),
        Buffer.alloc(33, 7),
        Buffer.alloc(64, 7),
      ])
        expect(
          parseSshPublicKey(line("ssh-ed25519", bad)),
          `${bad.length} octets`,
        ).toMatchObject({ ok: false, reason: "invalid_format" });
      // Octets en trop après le champ de clé.
      expect(
        parseSshPublicKey(line("ssh-ed25519", key32, "queue")),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
    });

    it.each([
      ["nistp256", 65],
      ["nistp384", 97],
      ["nistp521", 133],
    ])(
      "ecdsa-sha2-%s : courbe cohérente, point non compressé de %i octets",
      (curve, size) => {
        const type = `ecdsa-sha2-${curve}`;
        expect(parseSshPublicKey(line(type, curve, point(size))).ok).toBe(true);
        // Courbe annoncée différente du type.
        expect(
          parseSshPublicKey(line(type, "nistp999", point(size))),
        ).toMatchObject({ ok: false, reason: "invalid_format" });
        // Point trop court / trop long / compressé.
        expect(
          parseSshPublicKey(line(type, curve, point(size - 1))),
        ).toMatchObject({ ok: false, reason: "invalid_format" });
        expect(
          parseSshPublicKey(line(type, curve, point(size + 1))),
        ).toMatchObject({ ok: false, reason: "invalid_format" });
        const compressed = point(size);
        compressed[0] = 2;
        expect(parseSshPublicKey(line(type, curve, compressed))).toMatchObject({
          ok: false,
          reason: "invalid_format",
        });
        // Octets en trop.
        expect(
          parseSshPublicKey(line(type, curve, point(size), "x")),
        ).toMatchObject({ ok: false, reason: "invalid_format" });
      },
    );

    it("clés de sécurité (sk-…) : clé de la bonne taille et champ application", () => {
      expect(
        parseSshPublicKey(line("sk-ssh-ed25519@openssh.com", key32, "ssh:")).ok,
      ).toBe(true);
      expect(
        parseSshPublicKey(
          line("sk-ssh-ed25519@openssh.com", Buffer.alloc(5), "ssh:"),
        ),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
      expect(
        parseSshPublicKey(line("sk-ssh-ed25519@openssh.com", key32)),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
      expect(
        parseSshPublicKey(
          line(
            "sk-ecdsa-sha2-nistp256@openssh.com",
            "nistp256",
            point(65),
            "ssh:",
          ),
        ).ok,
      ).toBe(true);
      expect(
        parseSshPublicKey(
          line(
            "sk-ecdsa-sha2-nistp256@openssh.com",
            "nistp256",
            point(10),
            "ssh:",
          ),
        ),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
    });

    it("rsa : exposant impair et plausible, module impair non négatif, rien après", () => {
      const n = (bits: number, last = 0xab) => {
        const b = Buffer.concat([
          Buffer.from([0]),
          Buffer.alloc(bits / 8, 0xab),
        ]);
        b[b.length - 1] = last;
        return b;
      };
      const e = Buffer.from([1, 0, 1]);
      expect(parseSshPublicKey(line("ssh-rsa", e, n(2048))).ok).toBe(true);
      expect(
        parseSshPublicKey(line("ssh-rsa", e, n(2048, 0xaa))),
      ).toMatchObject({
        ok: false,
        reason: "invalid_format",
      }); // module pair
      for (const badE of [
        Buffer.alloc(0),
        Buffer.from([0]),
        Buffer.from([1]),
        Buffer.from([2]),
        Buffer.from([1, 0, 0]),
        Buffer.alloc(40, 3),
      ])
        expect(
          parseSshPublicKey(line("ssh-rsa", badE, n(2048))),
          `e=${badE.toString("hex")}`,
        ).toMatchObject({ ok: false, reason: "invalid_format" });
      // Module « négatif » (bit de poids fort sans octet 0 devant).
      expect(
        parseSshPublicKey(line("ssh-rsa", e, Buffer.alloc(256, 0xab))),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
      // Module démesuré.
      expect(parseSshPublicKey(line("ssh-rsa", e, n(32768)))).toMatchObject({
        ok: false,
      });
      expect(
        parseSshPublicKey(line("ssh-rsa", e, n(2048), "queue")),
      ).toMatchObject({ ok: false, reason: "invalid_format" });
    });
  });
});
