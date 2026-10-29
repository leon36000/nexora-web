import { describe, expect, test } from "bun:test";
import { createCatalogClient, parseApiError } from "./errors";

describe("lecture des erreurs de l'API", () => {
  test("erreur de l'app : code, message français du serveur et problèmes de publication", () => {
    const e = parseApiError({
      response: {
        status: 422,
        data: {
          error: "secret_host",
          message:
            "hôte « x » non autorisé pour la clé d'un fournisseur de modèles",
          field: "baseUrl",
        },
      },
    });
    expect(e.code).toBe("secret_host");
    expect(e.status).toBe(422);
    expect(e.text).toContain("hôte « x » non autorisé");
    expect(e.text).toContain("NEXORA_SECRET_HOSTS_MODEL_PROVIDER");
  });
  test("publication refusée : la liste des problèmes est lisible", () => {
    const e = parseApiError({
      response: {
        status: 422,
        data: {
          error: "publication_refused",
          issues: [
            { code: "price_missing", model: "nexora/x" },
            {
              code: "secret_missing",
              model: "nexora/x",
              provider: "deepinfra",
            },
          ],
        },
      },
    });
    expect(e.issues).toHaveLength(2);
    expect(e.text).toContain("garde de publication");
  });
  test("valeurs refusées : nomme les champs en français", () => {
    const e = parseApiError({
      response: {
        status: 422,
        data: {
          error: "invalid_request",
          issues: [
            { path: "baseUrl", code: "custom" },
            { path: "sheet.releasedAt", code: "invalid_format" },
          ],
        },
      },
    });
    expect(e.text).toContain("adresse de base");
    expect(e.text).toContain("date de sortie");
  });
  test("erreur du relais Directus (app non configurée, injoignable)", () => {
    const e = parseApiError({
      response: {
        status: 503,
        data: {
          errors: [
            { message: "x", extensions: { code: "CATALOGUE_NON_CONFIGURE" } },
          ],
        },
      },
    });
    expect(e.code).toBe("CATALOGUE_NON_CONFIGURE");
    expect(e.text).toContain("NEXORA_APP_ADMIN_TOKEN");
  });
  test("code inconnu : ne montre jamais le corps brut de la réponse", () => {
    const e = parseApiError({
      response: { status: 500, data: { error: "boum", secret: "sk-123" } },
    });
    expect(e.text).toContain("boum");
    expect(e.text).not.toContain("sk-123");
    expect(parseApiError(new Error("réseau")).text).toContain("Échec");
  });
});

describe("client du catalogue", () => {
  test("relaie par /nexora-catalog et rend données ou erreur lisible", async () => {
    const seen: { method: string; url: string; data?: unknown }[] = [];
    const client = createCatalogClient(async (cfg) => {
      seen.push(cfg);
      if (cfg.url.endsWith("/boom"))
        throw { response: { status: 409, data: { error: "conflict" } } };
      return { data: { ok: 1 } };
    });
    const ok = await client.call("POST", "providers", { code: "a" });
    expect(ok).toEqual({ ok: true, data: { ok: 1 } });
    expect(seen[0]).toEqual({
      method: "POST",
      url: "/nexora-catalog/providers",
      data: { code: "a" },
    });
    const bad = await client.call("GET", "boom");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.text).toContain("existe déjà");
    expect((await client.call("GET", "")).ok).toBe(true);
    expect(seen[2]?.url).toBe("/nexora-catalog/");
  });
});
