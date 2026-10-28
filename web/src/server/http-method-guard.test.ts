import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installMethodGuard } from "./http-method-guard";

let server: http.Server;
let port = 0;
let uninstall: () => void;
let reached: string[] = [];

beforeAll(async () => {
  uninstall = installMethodGuard();
  server = http.createServer((req, res) => {
    reached.push(req.method ?? "");
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  uninstall();
  await new Promise<void>((r) => server.close(() => r()));
});

function send(method: string, path = "/") {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path },
      (res) => {
        let body = "";
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("méthodes HTTP exotiques : 405 propre avant Next.js", () => {
  it("TRACE et les méthodes WebDAV/cache reçoivent 405 avec Allow, sans écho ni page, et n'atteignent jamais l'application", async () => {
    reached = [];
    for (const method of ["TRACE", "PROPFIND", "PURGE", "MKCOL", "LOCK"]) {
      const r = await send(method, "/une-page?x=1");
      expect(r.status, method).toBe(405);
      expect(r.headers.allow, method).toBe(
        "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.headers["content-security-policy"]).toBe("default-src 'none'");
      expect(r.headers["x-content-type-options"]).toBe("nosniff");
      expect(r.headers["content-type"]).toMatch(/^text\/plain/);
      expect(r.body).not.toContain("une-page");
      expect(r.body).not.toContain("<");
    }
    expect(reached).toEqual([]);
  });

  it("les sept méthodes usuelles passent à l'application", async () => {
    reached = [];
    for (const method of [
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ])
      expect((await send(method)).status, method).toBe(200);
    expect(reached).toEqual([
      "GET",
      "HEAD",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]);
  });

  it("la garde ne s'installe qu'une fois et se retire proprement", () => {
    const again = installMethodGuard();
    again();
    expect(typeof uninstall).toBe("function");
  });
});
