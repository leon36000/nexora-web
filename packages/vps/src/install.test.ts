import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSshRunner } from "./install.ts";

/**
 * `ssh` simulé : comme le vrai client avec `StrictHostKeyChecking=accept-new`, il inscrit la clé
 * d'hôte vue dans le fichier `UserKnownHostsFile` reçu en option, puis rend le code de sortie voulu.
 */
const ED25519_BLOB =
  "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";
// Valeur de référence calculée par `ssh-keygen -lf` sur cette clé (oracle indépendant du code testé).
const ED25519_FINGERPRINT =
  "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU";

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "nexora-fake-ssh-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeSsh(name: string, body: string): string {
  const file = join(dir, name);
  writeFileSync(
    file,
    `#!/usr/bin/env bash
KH=""
for a in "$@"; do case "$a" in UserKnownHostsFile=*) KH="\${a#UserKnownHostsFile=}";; esac; done
cat >/dev/null
${body}
`,
    { mode: 0o700 },
  );
  chmodSync(file, 0o700);
  return file;
}

const runner = (sshBinary: string) =>
  createSshRunner({ privateKey: async () => "cle-de-test", sshBinary });
const input = {
  host: "10.20.0.10",
  user: "debian",
  script: "echo ok",
  env: { NEXORA_APP_CODE: "x" },
  timeoutMs: 10_000,
};

describe("exécuteur SSH : empreinte de la clé d'hôte", () => {
  it("remonte l'empreinte SHA256 de la clé d'hôte vue à la première connexion", async () => {
    const bin = fakeSsh(
      "ok",
      `echo "10.20.0.10 ssh-ed25519 ${ED25519_BLOB}" >> "$KH"; exit 0`,
    );
    const res = await runner(bin).run(input);
    expect(res).toMatchObject({ ok: true, exitCode: 0 });
    expect(res.hostKeyFingerprint).toBe(ED25519_FINGERPRINT);
  });

  it("la remonte aussi quand le script échoue (la connexion a eu lieu), et accepte un nom d'hôte haché", async () => {
    const bin = fakeSsh(
      "hashed",
      `echo "|1|c2VsLXNlbA==|aGFzaC1oYXNo ssh-ed25519 ${ED25519_BLOB}" >> "$KH"; echo "boum" >&2; exit 1`,
    );
    const res = await runner(bin).run(input);
    expect(res).toMatchObject({ ok: false, exitCode: 1 });
    expect(res.hostKeyFingerprint).toBe(ED25519_FINGERPRINT);
  });

  it("n'invente rien quand la connexion n'a pas eu lieu", async () => {
    const bin = fakeSsh("refused", `echo "connexion refusée" >&2; exit 255`);
    const res = await runner(bin).run(input);
    expect(res).toMatchObject({ ok: false, exitCode: 255 });
    expect(res.hostKeyFingerprint).toBeUndefined();
  });

  it("ignore une ligne de known_hosts illisible", async () => {
    const bin = fakeSsh(
      "garbage",
      `echo "n'importe quoi" >> "$KH"; echo "# commentaire" >> "$KH"; exit 0`,
    );
    const res = await runner(bin).run(input);
    expect(res.hostKeyFingerprint).toBeUndefined();
  });
});
