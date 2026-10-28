import { describe, expect, it } from "vitest";
import { validateEmail, validateSignup } from "./validation";

describe("validation des formulaires de compte (avant tout appel au serveur)", () => {
  it("courriel : refuse le vide, les espaces et les formes impossibles ; accepte une adresse ordinaire", () => {
    for (const bad of ["", "   ", "abc", "a@b", "a b@c.d", "@c.d", "a@.d"])
      expect(validateEmail(bad), JSON.stringify(bad)).toBe("invalidEmail");
    for (const good of [
      "a@b.co",
      " recette-1@exemple.test ",
      "x.y+z@sub.exemple.ca",
    ])
      expect(validateEmail(good), good).toBeNull();
  });

  it("inscription : le nom, puis le courriel, puis la longueur du mot de passe", () => {
    const ok = { name: "Ana", email: "a@b.co", password: "0123456789ab" };
    expect(validateSignup(ok)).toBeNull();
    expect(validateSignup({ ...ok, name: "   " })).toBe("nameRequired");
    expect(validateSignup({ ...ok, name: "", email: "" })).toBe("nameRequired");
    expect(validateSignup({ ...ok, email: "pas-un-courriel" })).toBe(
      "invalidEmail",
    );
    expect(validateSignup({ ...ok, password: "0123456789a" })).toBe("weak");
    expect(validateSignup({ ...ok, password: "" })).toBe("weak");
  });
});
