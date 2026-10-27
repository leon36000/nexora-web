import { describe, expect, it } from "vitest";
import { isExternalHref, normalizeSlug, safeHref } from "./safe-href";

describe("safeHref", () => {
  it("accepte les chemins internes et retire la barre oblique finale", () => {
    expect(safeHref("/souverainete/")).toBe("/souverainete");
    expect(safeHref("/en/sovereignty/")).toBe("/en/sovereignty");
    expect(safeHref("/")).toBe("/");
    expect(safeHref("/solutions/courriels?a=1#x")).toBe(
      "/solutions/courriels?a=1#x",
    );
  });

  it("accepte les ancres, http(s), mailto et tel", () => {
    expect(safeHref("#contact")).toBe("#contact");
    expect(safeHref("https://exemple.ca/page")).toBe("https://exemple.ca/page");
    expect(safeHref("http://exemple.ca")).toBe("http://exemple.ca/");
    expect(safeHref("mailto:info@exemple.ca")).toBe("mailto:info@exemple.ca");
    expect(safeHref("tel:+15145550100")).toBe("tel:+15145550100");
  });

  it("refuse les schémas dangereux, y compris déguisés", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
    ]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });

  it("renvoie null pour une valeur vide ou absente", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe("isExternalHref", () => {
  it("distingue les liens sortants des liens du site", () => {
    expect(isExternalHref("https://exemple.ca")).toBe(true);
    expect(isExternalHref("/solutions")).toBe(false);
    expect(isExternalHref("#x")).toBe(false);
    expect(isExternalHref("mailto:a@b.ca")).toBe(false);
  });
});

describe("normalizeSlug", () => {
  it("assemble les segments et refuse tout ce qui n'est pas un slug propre", () => {
    expect(normalizeSlug(["opsys-ai"])).toBe("opsys-ai");
    expect(normalizeSlug(["solutions", "courriels"])).toBe(
      "solutions/courriels",
    );
    expect(normalizeSlug([])).toBe("");
    expect(normalizeSlug(undefined)).toBe("");
    expect(normalizeSlug([".."])).toBeNull();
    expect(normalizeSlug(["a b"])).toBeNull();
    expect(normalizeSlug(["Majuscule"])).toBeNull();
    expect(normalizeSlug(["a", ""])).toBeNull();
    expect(normalizeSlug(["a%2Fb"])).toBeNull();
    expect(normalizeSlug(['x"],"y'])).toBeNull();
  });
});
