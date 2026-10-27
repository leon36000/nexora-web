import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProxmoxClient, ProxmoxError } from "./client.ts";
import { ProxmoxSimulator } from "./simulator.ts";

const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("transport : politique TLS", () => {
  it("refuse le HTTP en clair vers un hôte qui n'est pas la boucle locale", () => {
    expect(
      () =>
        new ProxmoxClient({
          host: "pve.exemple.ca",
          protocol: "http",
          token: TOKEN,
          tls: { mode: "verify" },
        }),
    ).toThrow(/HTTP en clair refusé/);
  });

  it("refuse un jeton mal formé sans le citer", () => {
    const secret = "pas-un-jeton-valide";
    try {
      new ProxmoxClient({
        host: "127.0.0.1",
        token: secret,
        tls: { mode: "verify" },
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ProxmoxError);
      expect((e as Error).message).not.toContain(secret);
    }
  });
});

describe.skipIf(!hasOpenssl())(
  "transport : certificat auto-signé épinglé",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "nexora-tls-"));
    let sim: ProxmoxSimulator;
    let close: () => Promise<void>;
    let port = 0;
    let fingerprint = "";

    beforeAll(async () => {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "2",
          "-subj",
          "/CN=pve-test",
          "-addext",
          "subjectAltName=IP:127.0.0.1",
          "-keyout",
          join(dir, "k.pem"),
          "-out",
          join(dir, "c.pem"),
        ],
        { stdio: "ignore" },
      );
      const cert = readFileSync(join(dir, "c.pem"), "utf8");
      fingerprint = createHash("sha256")
        .update(new X509Certificate(cert).raw)
        .digest("hex");
      sim = new ProxmoxSimulator({
        token: TOKEN,
        tls: { key: readFileSync(join(dir, "k.pem"), "utf8"), cert },
      });
      const s = await sim.start();
      close = s.close;
      port = s.port;
    });
    afterAll(async () => {
      await close();
      rmSync(dir, { recursive: true, force: true });
    });

    const client = (
      tls: ConstructorParameters<typeof ProxmoxClient>[0]["tls"],
    ) =>
      new ProxmoxClient({
        host: "127.0.0.1",
        port,
        token: TOKEN,
        tls,
        timeoutMs: 5_000,
      });

    it("accepte le certificat dont l'empreinte est épinglée (avec séparateurs et majuscules)", async () => {
      const pretty = fingerprint.toUpperCase().match(/../g)?.join(":") ?? "";
      const version = await client({
        mode: "pinned",
        fingerprint: pretty,
      }).version();
      expect(version.version).toMatch(/^\d/);
    });

    it("refuse une empreinte différente AVANT d'envoyer la requête (le jeton ne part pas)", async () => {
      const before = sim.calls.length;
      const error = await client({
        mode: "pinned",
        fingerprint: "00".repeat(32),
      })
        .version()
        .catch((e: unknown) => e);
      expect(error).toMatchObject({ name: "ProxmoxError", code: "tls" });
      expect(sim.calls.length).toBe(before);
    });

    it("refuse un certificat auto-signé en mode `verify`", async () => {
      await expect(client({ mode: "verify" }).version()).rejects.toMatchObject({
        code: "tls",
      });
    });
  },
);
