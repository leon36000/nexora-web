import { describe, expect, test } from "bun:test";
import { adminOnly } from "./access";

describe("modules réservés aux administrateurs", () => {
  test("seul un utilisateur avec l'accès administrateur voit le module", () => {
    expect(adminOnly({ admin_access: true })).toBe(true);
    expect(adminOnly({ admin_access: false })).toBe(false);
    expect(adminOnly({})).toBe(false);
    expect(adminOnly(null)).toBe(false);
    // un accès à l'application ne suffit pas (Éditeur, Relecteur)
    expect(adminOnly({ app_access: true } as never)).toBe(false);
  });
});
