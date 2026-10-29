import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {
    order.push("connection");
  }),
}));
vi.mock("@/server/db", () => ({
  getDb: vi.fn(() => {
    order.push("db");
    return {};
  }),
}));
vi.mock("@/server/log", () => ({ log: {} }));
vi.mock("@/server/webpilot/prices-admin", () => ({
  handlePricesAdmin: vi.fn(
    async (_r: Request, deps: { adminToken?: string }) => {
      order.push(`handler:${typeof deps.adminToken}`);
      return new Response(null, { status: 204 });
    },
  ),
}));

import { GET, PUT } from "./route";

describe("/api/admin/webpilot/prices", () => {
  beforeEach(() => {
    order.length = 0;
  });

  it("attend une vraie requête avant de lire l'environnement (jeton d'administration)", async () => {
    await GET(new Request("https://site.test/api/admin/webpilot/prices"));
    expect(order[0]).toBe("connection");
    order.length = 0;
    await PUT(
      new Request("https://site.test/api/admin/webpilot/prices", {
        method: "PUT",
      }),
    );
    expect(order[0]).toBe("connection");
  });
});
