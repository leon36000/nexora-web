import { describe, expect, it } from "vitest";
import { checkAdminAuth, safeEqual } from "./auth";

const req = (authorization?: string) =>
  new Request("http://localhost/x", {
    headers: authorization ? { authorization } : {},
  });

describe("safeEqual (comparaison en temps constant)", () => {
  it("compare des chaînes de longueurs différentes sans lever d'erreur", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("checkAdminAuth", () => {
  const token = "j".repeat(40);
  it("accepte le jeton Bearer exact", () => {
    expect(checkAdminAuth(req(`Bearer ${token}`), token)).toBe("ok");
  });
  it("refuse tout le reste", () => {
    expect(checkAdminAuth(req(), token)).toBe("unauthorized");
    expect(checkAdminAuth(req("Bearer "), token)).toBe("unauthorized");
    expect(checkAdminAuth(req(`bearer ${token}`), token)).toBe("ok"); // schéma insensible à la casse (RFC 7235)
    expect(checkAdminAuth(req(token), token)).toBe("unauthorized");
    expect(checkAdminAuth(req(`Bearer ${token}x`), token)).toBe("unauthorized");
  });
  it("échoue fermé si le jeton attendu est absent ou trop court pour être sûr", () => {
    expect(checkAdminAuth(req("Bearer abc"), undefined)).toBe("not_configured");
    expect(checkAdminAuth(req("Bearer abc"), "abc")).toBe("not_configured");
    expect(checkAdminAuth(req("Bearer "), "")).toBe("not_configured");
  });
});
