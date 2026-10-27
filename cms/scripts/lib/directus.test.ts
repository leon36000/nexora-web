import { describe, expect, test } from "bun:test";
import { loginFailure } from "./directus";

const answer = (status: number, code?: string) =>
  new Response(
    JSON.stringify(code ? { errors: [{ extensions: { code } }] } : {}),
    { status },
  );

describe("loginFailure (connexion administrateur)", () => {
  test("2FA requise : le message conseille le jeton statique ou DIRECTUS_ADMIN_OTP", async () => {
    const m = await loginFailure(answer(401, "INVALID_OTP"), false);
    expect(m).toContain("2FA");
    expect(m).toContain("DIRECTUS_ADMIN_TOKEN");
    expect(m).toContain("DIRECTUS_ADMIN_OTP");
  });

  test("code à usage unique fourni mais faux : on le dit sans conseiller le jeton", async () => {
    const m = await loginFailure(answer(401, "INVALID_OTP"), true);
    expect(m).toContain("invalide ou expiré");
  });

  test("mot de passe refusé ou corps illisible : message neutre, sans détail", async () => {
    expect(await loginFailure(answer(401, "INVALID_CREDENTIALS"), false)).toBe(
      "Connexion administrateur refusée (401)",
    );
    expect(
      await loginFailure(new Response("pas du json", { status: 500 }), false),
    ).toBe("Connexion administrateur refusée (500)");
  });
});
