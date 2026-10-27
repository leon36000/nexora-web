import { execFileSync } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProxmoxSimulator } from "./simulator.ts";
import { probeTls, TlsProbeError } from "./tls-probe.ts";

const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasOpenssl())("sonde TLS : premier contact", () => {
  const dir = mkdtempSync(join(tmpdir(), "nexora-probe-"));
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
        "/CN=pve-sonde/O=Nexora Test",
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

  it("lit l'empreinte SHA-256 du certificat sans envoyer aucune requête HTTP (donc aucun jeton)", async () => {
    const before = sim.calls.length;
    const probe = await probeTls({ host: "127.0.0.1", port, timeoutMs: 5_000 });
    expect(probe.fingerprint).toBe(fingerprint);
    expect(probe.fingerprintDisplay).toBe(
      fingerprint.toUpperCase().match(/../g)?.join(":"),
    );
    expect(probe.subject).toContain("pve-sonde");
    expect(sim.calls.length).toBe(before);
  });

  it("signale un certificat auto-signé non reconnu par le système, et son nom couvert", async () => {
    const probe = await probeTls({ host: "127.0.0.1", port, timeoutMs: 5_000 });
    expect(probe.selfSigned).toBe(true);
    expect(probe.trusted).toBe(false);
    expect(probe.hostnameMatches).toBe(true);
    expect(probe.expired).toBe(false);
    expect(Date.parse(probe.validTo)).toBeGreaterThan(Date.now());
  });

  it("refuse un port sans TLS avec une cause lisible", async () => {
    const plain = new ProxmoxSimulator({ token: TOKEN });
    const s = await plain.start();
    try {
      await expect(
        probeTls({ host: "127.0.0.1", port: s.port, timeoutMs: 2_000 }),
      ).rejects.toMatchObject({ name: "TlsProbeError", kind: "tls" });
    } finally {
      await s.close();
    }
  });
});

describe("sonde TLS : pannes réseau", () => {
  it("port fermé : erreur réseau, sans détail technique brut", async () => {
    const srv = createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const { port } = srv.address() as { port: number };
    await new Promise<void>((r) => srv.close(() => r()));
    const error = await probeTls({
      host: "127.0.0.1",
      port,
      timeoutMs: 2_000,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TlsProbeError);
    expect((error as TlsProbeError).kind).toBe("network");
  });

  it("serveur muet : délai dépassé", async () => {
    const sockets: { destroy(): void }[] = [];
    const srv = createServer((c) => sockets.push(c));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const { port } = srv.address() as { port: number };
    try {
      const error = await probeTls({
        host: "127.0.0.1",
        port,
        timeoutMs: 300,
      }).catch((e: unknown) => e);
      expect((error as TlsProbeError).kind).toBe("timeout");
    } finally {
      for (const c of sockets) c.destroy();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});
