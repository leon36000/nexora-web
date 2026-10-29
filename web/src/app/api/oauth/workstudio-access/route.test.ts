import { describe, expect, it } from "vitest";
import * as route from "./route";

describe("GET /api/oauth/workstudio-access", () => {
  it("est toujours rendue à la demande (jamais préparée au build, où l'environnement OIDC est absent et ferait figer un 404)", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});
