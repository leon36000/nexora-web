import { describe, expect, it } from "vitest";
import {
  PREVIEW_SESSION_SECONDS,
  signPreviewLink,
  signPreviewSession,
  verifyPreviewLink,
  verifyPreviewSession,
} from "./preview-link";

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

describe("session d'aperçu (cookie signé de 30 minutes)", () => {
  it("dure 30 minutes puis expire, même si le cookie du Draft Mode (constant) reste dans le navigateur", () => {
    expect(PREVIEW_SESSION_SECONDS).toBe(30 * 60);
    const { value, maxAge } = signPreviewSession({ secret: SECRET, now: NOW });
    expect(maxAge).toBe(1800);
    expect(
      verifyPreviewSession({ secret: SECRET, value, now: NOW + 29 * 60_000 }),
    ).toBe(true);
    expect(
      verifyPreviewSession({ secret: SECRET, value, now: NOW + 31 * 60_000 }),
    ).toBe(false);
  });

  it("refuse une valeur altérée, une échéance prolongée, un autre secret, un secret absent ou du bruit", () => {
    const { value } = signPreviewSession({ secret: SECRET, now: NOW });
    const [exp, sig] = value.split(".") as [string, string];
    for (const bad of [
      `${Number(exp) + 3_600_000}.${sig}`,
      `${exp}.${sig.slice(0, -2)}xx`,
      exp,
      "",
      ".",
      "abc.def",
      `${exp}.${sig}.extra`,
    ])
      expect(
        verifyPreviewSession({ secret: SECRET, value: bad, now: NOW }),
        bad,
      ).toBe(false);
    expect(
      verifyPreviewSession({ secret: "t".repeat(48), value, now: NOW }),
    ).toBe(false);
    expect(verifyPreviewSession({ secret: undefined, value, now: NOW })).toBe(
      false,
    );
    expect(
      verifyPreviewSession({ secret: SECRET, value: undefined, now: NOW }),
    ).toBe(false);
    expect(() => signPreviewSession({ secret: "court", now: NOW })).toThrow();
  });

  it("une signature de lien d'aperçu ne vaut pas session (domaines de signature distincts)", () => {
    const link = signPreviewLink({
      secret: SECRET,
      lang: "fr",
      path: "/",
      now: NOW,
    });
    expect(
      verifyPreviewSession({
        secret: SECRET,
        value: `${link.exp}.${link.sig}`,
        now: NOW,
      }),
    ).toBe(false);
  });
});
