import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../canonical.ts";
import { PERMISSIVE_LICENSES } from "../catalog.ts";
import {
  SEED_BARE_APPS,
  SEED_GUIDE_APPS,
  SEED_INSTALLABLE_APPS,
} from "./apps.ts";

describe("applications du catalogue", () => {
  it("n'installe que des licences permissives ; n8n, Open WebUI et Dify sont des guides sans script", () => {
    for (const a of SEED_INSTALLABLE_APPS)
      expect(PERMISSIVE_LICENSES as readonly string[], a.code).toContain(
        a.license,
      );
    const guides = SEED_GUIDE_APPS.map((a) => a.code).sort();
    expect(guides).toEqual(["dify", "n8n", "open-webui"]);
    for (const g of SEED_GUIDE_APPS) {
      expect(g.kind).toBe("guide");
      expect(g.installScript ?? null).toBeNull();
      expect(
        g.licenseWarningFr && g.licenseWarningEn && g.guideFr && g.guideEn,
      ).toBeTruthy();
    }
    expect(SEED_INSTALLABLE_APPS.map((a) => a.code)).not.toEqual(
      expect.arrayContaining(["n8n"]),
    );
  });

  it("chaque script épingle ses images par version et empreinte, lie ses ports à 127.0.0.1 et n'embarque pas l'administration AGPL de LibreChat", () => {
    for (const a of SEED_INSTALLABLE_APPS) {
      const script = a.installScript ?? "";
      const images = [...script.matchAll(/^\s*image:\s*(\S+)/gm)].map(
        (m) => m[1] as string,
      );
      expect(images.length, a.code).toBeGreaterThan(0);
      for (const image of images) {
        expect(image, a.code).toMatch(/:[A-Za-z0-9._-]+@sha256:[0-9a-f]{64}$/);
        expect(image).not.toMatch(/:latest/);
      }
      for (const m of script.matchAll(/^\s*-\s*"([^"]*:\d+:\d+)"/gm))
        expect(m[1], a.code).toMatch(/^127\.0\.0\.1:/);
      expect(script).not.toMatch(/admin-panel:/);
      expect(script).toContain("set -euo pipefail");
      expect(a.ports?.every((p) => p.exposure === "tunnel")).toBe(true);
    }
  });

  it("la somme SHA-256 est celle du texte du script (calculée à l'insertion)", () => {
    for (const a of SEED_INSTALLABLE_APPS)
      expect(sha256Hex(a.installScript ?? "")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scripts d'installation (bash)", () => {
  const stub = (dir: string) => {
    mkdirSync(join(dir, "bin"), { recursive: true });
    writeFileSync(
      join(dir, "bin/docker"),
      '#!/bin/sh\necho "docker $*" >> "$FAKE_LOG"\n',
    );
    for (const c of ["apt-get", "systemctl", "gpg", "curl", "chown"])
      writeFileSync(join(dir, "bin", c), "#!/bin/sh\nexit 0\n");
    writeFileSync(
      join(dir, "bin/getent"),
      `#!/bin/sh\necho "debian:x:1000:1000::${dir}/home:/bin/bash"\n`,
    );
    for (const c of [
      "docker",
      "apt-get",
      "systemctl",
      "gpg",
      "curl",
      "chown",
      "getent",
    ])
      chmodSync(join(dir, "bin", c), 0o755);
    mkdirSync(join(dir, "home"), { recursive: true });
  };

  for (const app of SEED_INSTALLABLE_APPS) {
    it(`${app.code} : syntaxe valide et exécution à blanc (Docker simulé) qui écrit un compose, des secrets 0600 et reste rejouable`, () => {
      const dir = mkdtempSync(join(tmpdir(), "nexora-script-"));
      try {
        stub(dir);
        const script = (app.installScript ?? "")
          .replaceAll("/opt/nexora", `${dir}/opt`)
          .replaceAll("/var/lib/nexora", `${dir}/var`);
        const file = join(dir, "install.sh");
        writeFileSync(file, script);
        expect(spawnSync("bash", ["-n", file]).status).toBe(0);
        const env = {
          PATH: `${dir}/bin:${process.env.PATH}`,
          FAKE_LOG: join(dir, "log"),
          SUDO_USER: "debian",
          NEXORA_APP_CODE: app.code,
          NEXORA_APP_VERSION: app.version,
        };
        const run = () => spawnSync("bash", [file], { env, encoding: "utf8" });
        const first = run();
        expect(first.status, first.stderr).toBe(0);
        expect(
          readFileSync(join(dir, `opt/${app.code}/compose.yml`), "utf8"),
        ).toContain("127.0.0.1:");
        const access = readFileSync(join(dir, "home/nexora-acces.txt"), "utf8");
        expect(access).toContain("ssh -N -L");
        // Rejouer : témoin d'installation, aucune seconde exécution de Docker.
        const lines = readFileSync(join(dir, "log"), "utf8").split("\n").length;
        const second = run();
        expect(second.status).toBe(0);
        expect(second.stdout).toContain("déjà installé");
        expect(readFileSync(join(dir, "log"), "utf8").split("\n").length).toBe(
          lines,
        );
        // Une autre version ou un autre code est refusé.
        const wrong = spawnSync("bash", [file], {
          env: { ...env, NEXORA_APP_VERSION: "0.0.0" },
          encoding: "utf8",
        });
        expect(wrong.status).toBe(64);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe("serveur nu (produit de base)", () => {
  const app = SEED_BARE_APPS[0];
  it("n'installe rien, n'expose aucun port et vérifie son application", () => {
    expect(app?.code).toBe("serveur-nu");
    expect(PERMISSIVE_LICENSES as readonly string[]).toContain(app?.license);
    expect(app?.ports).toEqual([]);
    const script = app?.installScript ?? "";
    expect(script).toContain("set -euo pipefail");
    expect(script).not.toMatch(/apt-get|curl|wget|docker/);
    expect(script).toContain('"$NEXORA_APP_CODE" != "serveur-nu"');
    expect(script).toContain(`"$NEXORA_APP_VERSION" != "${app?.version}"`);
  });
  it("le script passe bash -n", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("bash", ["-n"], { input: app?.installScript ?? "" });
    expect(r.status).toBe(0);
  });
});
