import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { handleMedia } from "./media";

const ID = "3f2c1d0e-1111-4222-8333-444455556666";
const TOKEN = "jeton-lecteur-secret-test";
let server: Server | undefined;
const seen: { url: string; auth: string }[] = [];

async function upstream(
  respond: (url: string) => {
    status: number;
    type?: string;
    body?: string | Uint8Array;
  },
) {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: String(req.headers.authorization) });
    const r = respond(req.url ?? "");
    res.writeHead(r.status, r.type ? { "content-type": r.type } : {});
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

  it("refuse le SVG et tout ce qui n'est pas une image raster (D11)", async () => {
    for (const type of [
      "image/svg+xml",
      "text/html",
      "application/pdf",
      "image/svg+xml; charset=utf-8",
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
