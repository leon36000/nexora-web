import { describe, expect, test } from "bun:test";
import { loginFailure, withRateLimitRetry } from "./directus";

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

describe("withRateLimitRetry (limitation de débit de Directus : 429)", () => {
  const limited = (retryAfter?: string) =>
    new Response("{}", {
      status: 429,
      headers: retryAfter ? { "retry-after": retryAfter } : {},
    });

  test("réessaie après le délai Retry-After puis rend la réponse réussie", async () => {
    const waits: number[] = [];
    const calls = [
      limited("1"),
      limited("2"),
      new Response("{}", { status: 200 }),
    ];
    const res = await withRateLimitRetry(
      async () => calls.shift() as Response,
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(res.status).toBe(200);
    expect(waits).toEqual([1000, 2000]);
  });

  test("sans Retry-After, attend un délai court par défaut et croissant", async () => {
    const waits: number[] = [];
    const calls = [limited(), limited(), new Response("{}", { status: 200 })];
    await withRateLimitRetry(
      async () => calls.shift() as Response,
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(waits.length).toBe(2);
    expect(waits[1] as number).toBeGreaterThan(waits[0] as number);
  });

  test("Retry-After: 0 (réponse réelle de Directus) : le délai ne descend pas sous un plancher croissant", async () => {
    const waits: number[] = [];
    const calls = [
      limited("0"),
      limited("0"),
      new Response("{}", { status: 200 }),
    ];
    await withRateLimitRetry(
      async () => calls.shift() as Response,
      async (ms) => {
        waits.push(ms);
      },
    );
    expect(waits).toEqual([250, 500]);
  });

  test("n'insiste pas indéfiniment : rend le dernier 429 après le nombre maximal d'essais", async () => {
    let n = 0;
    const res = await withRateLimitRetry(
      async () => {
        n++;
        return limited("0");
      },
      async () => {},
      3,
    );
    expect(res.status).toBe(429);
    expect(n).toBe(4);
  });

  test("ne réessaie pas les autres erreurs", async () => {
    let n = 0;
    const res = await withRateLimitRetry(
      async () => {
        n++;
        return new Response("{}", { status: 500 });
      },
      async () => {},
    );
    expect(res.status).toBe(500);
    expect(n).toBe(1);
  });
});
