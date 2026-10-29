import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {
    order.push("connection");
  }),
}));
vi.mock("@/server/webpilot/deps", () => ({
  webpilotDeps: vi.fn(() => {
    order.push("deps");
    return {};
  }),
}));
vi.mock("@/server/webpilot/handlers", () => {
  const handler = async () => {
    order.push("handler");
    return new Response(null, { status: 204 });
  };
  return {
    handleSearch: handler,
    handleScrape: handler,
    handleExtract: handler,
    handleCrawlCreate: handler,
    handleCrawlGet: handler,
    handleCrawlDelete: handler,
    handleSessions: handler,
  };
});

const ROOT = dirname(fileURLToPath(import.meta.url));

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}
const files = routes(ROOT);

describe("routes /v1/webpilot/*", () => {
  beforeEach(() => {
    order.length = 0;
  });

  it("les huit routes sont là", () => {
    expect(files).toHaveLength(8);
  });

  for (const file of files) {
    it(`attend une vraie requête avant de lire l'environnement (sinon elle est préparée au build et fige sa réponse) : ${file.slice(ROOT.length + 1)}`, async () => {
      const route = (await import(/* @vite-ignore */ file)) as Record<
        string,
        unknown
      >;
      const methods = ["GET", "POST", "DELETE"].filter(
        (m) => typeof route[m] === "function",
      );
      expect(methods.length).toBeGreaterThan(0);
      expect(route.dynamic).toBeUndefined();
      for (const method of methods) {
        order.length = 0;
        const handler = route[method] as (
          r: Request,
          c: { params: Promise<{ id: string }> },
        ) => Promise<Response>;
        await handler(
          new Request("https://site.test/v1/webpilot/x", { method }),
          {
            params: Promise.resolve({ id: "x" }),
          },
        );
        expect(order).toEqual(["connection", "deps", "handler"]);
      }
    });
  }
});
