import { describe, expect, test } from "bun:test";
import { relayToVault, validateVaultInput } from "./contract";

const WITNESS = "TEMOIN-factice-9f3a1c77-ne-pas-utiliser";
const env = {
  NEXORA_APP_INTERNAL_URL: "http://app.interne:3500",
  NEXORA_APP_ADMIN_TOKEN: "jeton-admin-app",
};

describe("validateVaultInput", () => {
  test("accepte une entrée conforme au contrat", () => {
    expect(
      validateVaultInput({
        ref: "openrouter.principal",
        value: "x",
        kind: "llm_provider",
      }),
    ).toEqual({
      ok: true,
      input: { ref: "openrouter.principal", value: "x", kind: "llm_provider" },
    });
  });

  test("refuse une référence hors de ^[a-z0-9._-]{3,64}$", () => {
    for (const ref of [
      "ab",
      "A-majuscule",
      "espace interdit",
      "é-accent",
      "x".repeat(65),
      12,
      null,
    ]) {
      const r = validateVaultInput({ ref, value: "v", kind: "other" });
      expect(r.ok).toBe(false);
    }
  });

  test("refuse une valeur vide ou de plus de 4096 caractères, et un type inconnu", () => {
    expect(
      validateVaultInput({ ref: "abc", value: "", kind: "other" }).ok,
    ).toBe(false);
    expect(
      validateVaultInput({ ref: "abc", value: "v".repeat(4097), kind: "other" })
        .ok,
    ).toBe(false);
    expect(
      validateVaultInput({ ref: "abc", value: "v".repeat(4096), kind: "other" })
        .ok,
    ).toBe(true);
    expect(
      validateVaultInput({ ref: "abc", value: "v", kind: "inconnu" }).ok,
    ).toBe(false);
  });

  test("la liste des champs fautifs ne contient jamais la valeur", () => {
    const r = validateVaultInput({ ref: "AB", value: WITNESS, kind: "zzz" });
    expect(JSON.stringify(r)).not.toContain(WITNESS);
    expect(r.ok === false && r.fields.sort()).toEqual(["kind", "ref"]);
  });

  test("refuse les clés supplémentaires inattendues dans le corps", () => {
    expect(
      validateVaultInput({ ref: "abc", value: "v", kind: "other", extra: 1 })
        .ok,
    ).toBe(false);
  });
});

describe("relayToVault", () => {
  const input = {
    ref: "openrouter.principal",
    value: WITNESS,
    kind: "llm_provider" as const,
  };

  test("relaie au service de l’app avec le jeton et ne renvoie que {ref,last4,kind,updatedAt}", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          ref: "openrouter.principal",
          last4: "ser.",
          kind: "llm_provider",
          updatedAt: "2026-10-26T00:00:00Z",
          value: WITNESS,
          ciphertext: "abc",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await relayToVault(input, { env, fetchFn });
    const seen = calls[0];
    if (!seen) throw new Error("fetch n'a pas été appelé");
    expect(seen.url).toBe("http://app.interne:3500/api/admin/vault");
    expect((seen.init.headers as Record<string, string>).authorization).toBe(
      "Bearer jeton-admin-app",
    );
    expect(JSON.parse(seen.init.body as string)).toEqual(input);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      ref: "openrouter.principal",
      last4: "ser.",
      kind: "llm_provider",
      updatedAt: "2026-10-26T00:00:00Z",
    });
    expect(JSON.stringify(r)).not.toContain(WITNESS);
  });

  test("une réponse 200 mal formée donne 502 sans rien recopier", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ oups: WITNESS }), {
        status: 200,
      })) as unknown as typeof fetch;
    const r = await relayToVault(input, { env, fetchFn });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain(WITNESS);
  });

  test("422 du coffre -> 422 générique ; 401 du coffre -> 502 (jeton de service mal configuré)", async () => {
    const mk = (status: number) =>
      (async () =>
        new Response(`erreur ${WITNESS}`, {
          status,
        })) as unknown as typeof fetch;
    const r422 = await relayToVault(input, { env, fetchFn: mk(422) });
    expect(r422.status).toBe(422);
    expect(JSON.stringify(r422)).not.toContain(WITNESS);
    const r401 = await relayToVault(input, { env, fetchFn: mk(401) });
    expect(r401.status).toBe(502);
    expect(r401.code).toBe("COFFRE_NON_AUTORISE");
    expect(JSON.stringify(r401)).not.toContain(WITNESS);
  });

  test("une panne réseau donne 502 sans divulguer la valeur", async () => {
    const fetchFn = (async () => {
      throw new Error(`échec avec ${WITNESS}`);
    }) as unknown as typeof fetch;
    const r = await relayToVault(input, { env, fetchFn });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r)).not.toContain(WITNESS);
  });

  test("sans configuration de l’app : 503", async () => {
    const r = await relayToVault(input, {
      env: {},
      fetchFn: (async () => new Response("{}")) as unknown as typeof fetch,
    });
    expect(r.status).toBe(503);
  });
});
