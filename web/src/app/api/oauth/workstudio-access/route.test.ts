import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("next/server", () => ({
  connection: vi.fn(async () => {
    order.push("connection");
  }),
}));
vi.mock("@/server/auth/workstudio-access-deps", () => ({
  workstudioAccessDeps: vi.fn(() => {
    order.push("deps");
    return {};
  }),
}));
vi.mock("@/server/auth/workstudio-access", () => ({
  handleWorkstudioAccess: vi.fn(async () => {
    order.push("handler");
    return new Response(null, { status: 204 });
  }),
}));

import { GET } from "./route";

describe("GET /api/oauth/workstudio-access", () => {
  beforeEach(() => {
    order.length = 0;
  });

  it("attend une vraie requête avant de lire l'environnement (sinon elle est préparée au build, sans l'environnement OIDC, et fige un 404)", async () => {
    await GET(new Request("https://site.test/api/oauth/workstudio-access"));
    expect(order).toEqual(["connection", "deps", "handler"]);
  });
});
