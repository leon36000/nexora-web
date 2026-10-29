import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AddressPolicy } from "./address.ts";
import { createEgressProxy, type EgressProxy } from "./proxy.ts";

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const PUBLIC = "93.184.216.34";
const basePolicy: AddressPolicy = {
  allowedPorts: [80, 443, 8080],
  allowLoopback: false,
};

function listen(server: net.Server): Promise<number> {
  const open = new Set<net.Socket>();
  server.on("connection", (s) => {
    open.add(s);
    s.on("close", () => open.delete(s));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as net.AddressInfo).port);
    });
    closers.push(
      () =>
        new Promise<void>((done) => {
          for (const s of open) s.destroy();
          server.close(() => done());
        }),
    );
  });
}

async function origin() {
  const seen: Array<{
    url: string;
    host: string | undefined;
    proxyAuth?: string;
  }> = [];
  const server = http.createServer((req, res) => {
    seen.push({
      url: req.url ?? "",
      host: req.headers.host,
      proxyAuth: req.headers["proxy-authorization"] as string | undefined,
    });
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("bonjour");
  });
  const port = await listen(server);
  return { port, seen };
}

async function startProxy(over: {
  policy?: AddressPolicy;
  resolve?: (host: string) => Promise<string[]>;
  dialTo?: number;
}) {
  const dials: Array<{ address: string; port: number }> = [];
  const blocked: Array<{ host: string; reason: string }> = [];
  const resolveCalls: string[] = [];
  const proxy: EgressProxy = createEgressProxy({
    policy: over.policy ?? basePolicy,
    resolve: async (host) => {
      resolveCalls.push(host);
      return over.resolve ? over.resolve(host) : [PUBLIC];
    },
    ...(over.dialTo
      ? {
          dial: (address: string, port: number) => {
            dials.push({ address, port });
            return { address: "127.0.0.1", port: over.dialTo as number };
          },
        }
      : {}),
    onBlocked: (host, reason) => blocked.push({ host, reason }),
  });
  const { port } = await proxy.listen();
  closers.push(() => proxy.close());
  return { port, dials, blocked, resolveCalls };
}

function viaProxy(
  proxyPort: number,
  absoluteUrl: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(absoluteUrl);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: proxyPort,
        method: "GET",
        path: absoluteUrl,
        headers: { host: target.host, ...headers },
      },
      (res) => {
        const parts: Buffer[] = [];
        res.on("data", (c: Buffer) => parts.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(parts).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function connect(
  proxyPort: number,
  authority: string,
): Promise<{ status: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, "127.0.0.1", () => {
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`,
      );
    });
    let buf = "";
    socket.on("error", reject);
    socket.on("data", function onData(chunk) {
      buf += chunk.toString("latin1");
      const end = buf.indexOf("\r\n\r\n");
      if (end === -1) return;
      socket.off("data", onData);
      const status = Number(/^HTTP\/1\.\d (\d{3})/.exec(buf)?.[1]);
      resolve({ status, socket });
    });
    closers.push(async () => {
      socket.destroy();
    });
  });
}

describe("mandataire de sortie : HTTP", () => {
  it("relaie vers l'adresse VALIDÉE, après une seule résolution, avec l'en-tête Host d'origine", async () => {
    const o = await origin();
    const p = await startProxy({ dialTo: o.port });
    const r = await viaProxy(p.port, "http://exemple.org/page?x=1");
    expect(r).toEqual({ status: 200, body: "bonjour" });
    expect(p.resolveCalls).toEqual(["exemple.org"]);
    expect(p.dials).toEqual([{ address: PUBLIC, port: 80 }]);
    expect(o.seen[0]).toMatchObject({ url: "/page?x=1", host: "exemple.org" });
  });

  it("ne transmet pas les en-têtes du mandataire", async () => {
    const o = await origin();
    const p = await startProxy({ dialTo: o.port });
    await viaProxy(p.port, "http://exemple.org/", {
      "proxy-authorization": "Basic secret",
    });
    expect(o.seen[0]?.proxyAuth).toBeUndefined();
  });

  it("refuse (403) une destination qui résout vers le réseau privé, sans jamais se connecter", async () => {
    const o = await origin();
    const p = await startProxy({
      dialTo: o.port,
      resolve: async () => ["10.0.0.5"],
    });
    const r = await viaProxy(p.port, "http://interne.example/secret");
    expect(r.status).toBe(403);
    expect(p.dials).toEqual([]);
    expect(o.seen).toEqual([]);
    expect(p.blocked).toEqual([
      { host: "interne.example", reason: "adresse non publique refusée" },
    ]);
  });

  it("refuse la boucle locale littérale en production", async () => {
    const o = await origin();
    const p = await startProxy({});
    const r = await viaProxy(p.port, `http://127.0.0.1:${o.port}/`);
    expect(r.status).toBe(403);
    expect(o.seen).toEqual([]);
  });

  it("refuse un port hors liste et un schéma autre que http", async () => {
    const p = await startProxy({});
    expect((await viaProxy(p.port, "http://exemple.org:5432/")).status).toBe(
      403,
    );
    expect((await viaProxy(p.port, "ftp://exemple.org/")).status).toBe(403);
  });

  it("refuse une requête qui n'est pas en forme absolue (le mandataire n'est pas un serveur)", async () => {
    const p = await startProxy({});
    const r = await new Promise<number>((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port: p.port, path: "/" }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
        .on("error", reject);
    });
    expect(r).toBe(400);
  });
});

describe("mandataire de sortie : CONNECT (HTTPS, WebSocket)", () => {
  it("ouvre un tunnel vers l'adresse validée", async () => {
    const echo = net.createServer((s) => s.on("data", (d) => s.write(d)));
    const echoPort = await listen(echo);
    const p = await startProxy({ dialTo: echoPort });
    const { status, socket } = await connect(p.port, "exemple.org:443");
    expect(status).toBe(200);
    const got = await new Promise<string>((resolve) => {
      socket.once("data", (d) => resolve(d.toString()));
      socket.write("ping");
    });
    expect(got).toBe("ping");
    expect(p.dials).toEqual([{ address: PUBLIC, port: 443 }]);
  });

  it("refuse (403) le privé, le lien local, la boucle locale et les ports hors liste", async () => {
    const p = await startProxy({
      resolve: async (host) =>
        host === "meta.example" ? ["169.254.169.254"] : ["192.168.1.10"],
    });
    for (const authority of [
      "meta.example:443",
      "interne.example:443",
      "127.0.0.1:443",
      "exemple.org:22",
      "[::1]:443",
    ])
      expect((await connect(p.port, authority)).status, authority).toBe(403);
  });

  it("refuse un CONNECT mal formé", async () => {
    const p = await startProxy({});
    expect((await connect(p.port, "sansport")).status).toBe(400);
  });
});
