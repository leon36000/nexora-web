import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { handleMedia } from "./media";

const ID = "3f2c1d0e-1111-4222-8333-444455556666";
const TOKEN = "jeton-lecteur-secret-test";
let server: Server | undefined;
const seen: { url: string; auth: string; range?: string }[] = [];

type Reply = {
  status: number;
  type?: string;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
};

async function upstream(respond: (url: string) => Reply) {
  server = createServer((req, res) => {
    seen.push({
      url: req.url ?? "",
      auth: String(req.headers.authorization),
      range: req.headers.range,
    });
    const r = respond(req.url ?? "");
    res.writeHead(r.status, {
      ...(r.type ? { "content-type": r.type } : {}),
      ...(r.headers ?? {}),
    });
    res.end(r.body ?? "");
  });
  await new Promise<void>((ok) => server?.listen(0, "127.0.0.1", ok));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  seen.length = 0;
  await new Promise<void>((ok) => (server ? server.close(() => ok()) : ok()));
  server = undefined;
});

const deps = (baseUrl: string) => ({ baseUrl, token: TOKEN, timeoutMs: 500 });
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const VIDEO = new TextEncoder().encode("0123456789ABCDEF"); // 16 octets

describe("handleMedia", () => {
  it("relaie une image raster avec des en-têtes durcis et le jeton du serveur", async () => {
    const base = await upstream(() => ({
      status: 200,
      type: "image/png",
      body: PNG,
    }));
    const res = await handleMedia(ID, deps(base));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect(seen[0]?.url).toBe(`/assets/${ID}`);
    expect(seen[0]?.auth).toBe(`Bearer ${TOKEN}`);
  });

  it("refuse le SVG et tout ce qui n'est pas une image raster, une vidéo ou des sous-titres (D11)", async () => {
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "image/svg+xml; charset=utf-8",
      "video/quicktime",
      "text/plain",
    ]) {
      const base = await upstream(() => ({
        status: 200,
        type,
        body: "<svg onload=alert(1)/>",
      }));
      const res = await handleMedia(ID, deps(base));
      expect(res.status, type).toBe(415);
      await new Promise<void>((ok) => server?.close(() => ok()));
      server = undefined;
    }
  });

  it("sert les vidéos MP4 et WebM et les sous-titres WebVTT, sans charset parasite", async () => {
    for (const [type, expected] of [
      ["video/mp4", "video/mp4"],
      ["video/webm", "video/webm"],
      ["text/vtt; charset=utf-8", "text/vtt"],
    ] as const) {
      const base = await upstream(() => ({
        status: 200,
        type,
        body: VIDEO,
      }));
      const res = await handleMedia(ID, deps(base));
      expect(res.status, type).toBe(200);
      expect(res.headers.get("content-type"), type).toBe(expected);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      await res.arrayBuffer();
      await new Promise<void>((ok) => server?.close(() => ok()));
      server = undefined;
    }
  });

  it("transmet l'en-tête Range à Directus et relaie le 206 avec content-range et content-length", async () => {
    const base = await upstream(() => ({
      status: 206,
      type: "video/mp4",
      body: VIDEO.slice(4, 8),
      headers: {
        "content-range": "bytes 4-7/16",
        "content-length": "4",
      },
    }));
    const res = await handleMedia(ID, deps(base), { range: "bytes=4-7" });
    expect(seen[0]?.range).toBe("bytes=4-7");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 4-7/16");
    expect(res.headers.get("content-length")).toBe("4");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO.slice(4, 8));
  });

  it("relaie le 416 (plage hors du fichier) avec sa taille, sans corps", async () => {
    const base = await upstream(() => ({
      status: 416,
      headers: { "content-range": "bytes */16" },
    }));
    const res = await handleMedia(ID, deps(base), { range: "bytes=99-" });
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */16");
    expect(await res.text()).toBe("");
  });

  it("n'envoie à Directus qu'un Range bien formé ; sinon la requête est servie entière", async () => {
    const base = await upstream(() => ({
      status: 200,
      type: "video/mp4",
      body: VIDEO,
    }));
    for (const bad of [
      "bytes=abc",
      "items=0-1",
      "bytes=0-1,<script>",
      "x".repeat(300),
    ]) {
      const res = await handleMedia(ID, deps(base), { range: bad });
      expect(res.status, bad).toBe(200);
      expect(seen.at(-1)?.range, bad).toBeUndefined();
      await res.arrayBuffer();
    }
  });

  it("le délai ne porte que sur les en-têtes : un fichier long finit d'être envoyé", async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.write("abc");
      setTimeout(() => res.end("def"), 600);
    });
    await new Promise<void>((ok) => server?.listen(0, "127.0.0.1", ok));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await handleMedia(ID, {
      baseUrl: base,
      token: TOKEN,
      timeoutMs: 300,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abcdef");
  });

  it("refuse un identifiant qui n'est pas un UUID, sans interroger Directus", async () => {
    const base = await upstream(() => ({
      status: 200,
      type: "image/png",
      body: PNG,
    }));
    for (const bad of [
      "../users",
      "abc",
      `${ID}/../x`,
      `${ID}?access_token=x`,
      "",
    ]) {
      expect((await handleMedia(bad, deps(base))).status, bad).toBe(400);
    }
    expect(seen).toHaveLength(0);
  });

  it("404 si Directus ne connaît pas le fichier ou le refuse", async () => {
    for (const status of [403, 404]) {
      const base = await upstream(() => ({ status }));
      expect((await handleMedia(ID, deps(base))).status).toBe(404);
      await new Promise<void>((ok) => server?.close(() => ok()));
      server = undefined;
    }
  });

  it("502 si Directus est en panne, sans divulguer le jeton", async () => {
    const res = await handleMedia(ID, deps("http://127.0.0.1:1"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(TOKEN);
  });
});
