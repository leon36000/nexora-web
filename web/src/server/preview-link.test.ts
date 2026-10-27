import { describe, expect, it } from "vitest";
import { signPreviewLink, verifyPreviewLink } from "./preview-link";

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000_000;

describe("lien d'aperçu signé", () => {
  it("accepte un lien valide et rend la langue et le chemin signés", () => {
    const link = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/opsys-ai",
      now: NOW,
    });
    const v = verifyPreviewLink({ secret: SECRET, ...link, now: NOW + 1000 });
    expect(v).toEqual({ ok: true, lang: "fr", path: "/opsys-ai" });
  });

  it("accepte l'accueil", () => {
    const link = signPreviewLink({
      secret: SECRET,
      lang: "en",
      path: "/",
      now: NOW,
    });
    expect(verifyPreviewLink({ secret: SECRET, ...link, now: NOW })).toEqual({
      ok: true,
      lang: "en",
      path: "/",
    });
  });

  it("refuse un lien expiré", () => {
    const link = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/x",
      now: NOW,
      ttlSeconds: 60,
    });
    expect(
      verifyPreviewLink({ secret: SECRET, ...link, now: NOW + 61_000 }),
    ).toMatchObject({ ok: false, reason: "expired" });
  });

  it("refuse toute modification du chemin, de la langue ou de l'échéance", () => {
    const link = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/x",
      now: NOW,
    });
    expect(
      verifyPreviewLink({ secret: SECRET, ...link, path: "/autre", now: NOW }),
    ).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(
      verifyPreviewLink({ secret: SECRET, ...link, lang: "en", now: NOW }),
    ).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(
      verifyPreviewLink({
        secret: SECRET,
        ...link,
        exp: link.exp + 999,
        now: NOW,
      }),
    ).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("refuse une signature produite avec un autre secret ou absente", () => {
    const link = signPreviewLink({
      secret: "x".repeat(48),
      lang: "fr",
      path: "/x",
      now: NOW,
    });
    expect(
      verifyPreviewLink({ secret: SECRET, ...link, now: NOW }),
    ).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(
      verifyPreviewLink({
        secret: SECRET,
        lang: "fr",
        path: "/x",
        exp: NOW + 1,
        sig: "",
        now: NOW,
      }),
    ).toMatchObject({ ok: false });
  });

  it("échoue fermé si le secret est absent ou trop court", () => {
    expect(() =>
      signPreviewLink({ secret: "", lang: "fr", path: "/x", now: NOW }),
    ).toThrow();
    const link = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/x",
      now: NOW,
    });
    expect(
      verifyPreviewLink({ secret: undefined, ...link, now: NOW }),
    ).toMatchObject({ ok: false, reason: "not_configured" });
    expect(
      verifyPreviewLink({ secret: "court", ...link, now: NOW }),
    ).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("refuse une redirection hors du site, même signée (anti-redirection ouverte)", () => {
    for (const path of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
    ]) {
      expect(() =>
        signPreviewLink({ secret: SECRET, lang: "fr", path, now: NOW }),
      ).toThrow();
    }
    // signature valide fabriquée pour un chemin dangereux : la vérification refuse aussi
    const ok = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/x",
      now: NOW,
    });
    expect(
      verifyPreviewLink({
        secret: SECRET,
        ...ok,
        path: "//evil.example",
        now: NOW,
      }),
    ).toMatchObject({ ok: false });
  });
});
