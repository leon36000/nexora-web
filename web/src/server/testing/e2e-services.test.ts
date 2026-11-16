import { describe, expect, it } from "vitest";
import { e2eLocalUrl } from "./e2e-services";

const mailpitHosts = ["127.0.0.1", "localhost", "mailpit"] as const;

describe("validation des URL de services E2E locaux", () => {
  it.each([
    "http://127.0.0.1:32778",
    "http://localhost:8025/",
    "http://mailpit:8025",
  ])("accepte Mailpit HTTP local: %s", (url) => {
    expect(e2eLocalUrl(url, "http:", mailpitHosts, "Mailpit").hostname).toMatch(
      /^(127\.0\.0\.1|localhost|mailpit)$/u,
    );
  });

  it.each([
    ["hôte externe", "http://example.com:8025"],
    ["identifiants", "http://user:password@127.0.0.1:8025"],
    ["chemin", "http://127.0.0.1:8025/admin"],
    ["paramètre", "http://127.0.0.1:8025/?token=dummy"],
    ["fragment", "http://127.0.0.1:8025/#section"],
    ["schéma TLS non prévu", "https://127.0.0.1:8025"],
    ["port implicite", "http://127.0.0.1"],
  ])("refuse une URL avec %s", (_reason, url) => {
    expect(() => e2eLocalUrl(url, "http:", mailpitHosts, "Mailpit")).toThrow(
      "cible E2E refusée",
    );
  });

  it("isole les alias de service: Mailpit n'accepte pas stripe-mock", () => {
    expect(() =>
      e2eLocalUrl("http://stripe-mock:8025", "http:", mailpitHosts, "Mailpit"),
    ).toThrow("cible E2E refusée");
  });

  it("n'accepte que SMTP clair pour Mailpit", () => {
    expect(
      e2eLocalUrl("smtp://mailpit:1025", "smtp:", mailpitHosts, "Mailpit SMTP")
        .protocol,
    ).toBe("smtp:");
    expect(() =>
      e2eLocalUrl(
        "smtps://mailpit:1025",
        "smtp:",
        mailpitHosts,
        "Mailpit SMTP",
      ),
    ).toThrow("cible E2E refusée");
  });
});
