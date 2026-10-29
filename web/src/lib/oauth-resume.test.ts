import { describe, expect, it } from "vitest";
import { resumesOAuth } from "./oauth-resume";

describe("reprise de l'autorisation après la connexion", () => {
  it("reconnaît la réponse du fournisseur qui renvoie vers WorkStudio", () => {
    expect(
      resumesOAuth({
        redirect: true,
        url: "https://workstudio.example/cb?code=x",
      }),
    ).toBe(true);
  });

  it("ignore une connexion ordinaire (aucune redirection demandée)", () => {
    expect(resumesOAuth({ redirect: false, user: { id: "u1" } })).toBe(false);
    expect(resumesOAuth({ token: "t", user: { id: "u1" } })).toBe(false);
  });

  it("n'agit pas sans adresse de retour, ni sur une réponse vide", () => {
    expect(resumesOAuth({ redirect: true })).toBe(false);
    expect(resumesOAuth({ redirect: true, url: 42 })).toBe(false);
    expect(resumesOAuth(null)).toBe(false);
    expect(resumesOAuth(undefined)).toBe(false);
    expect(resumesOAuth("redirect")).toBe(false);
  });
});
