import { describe, expect, it } from "vitest";
import {
  hashClientSecret,
  resolveWorkstudioOidc,
  WORKSTUDIO_CALLBACK_PATH,
  WORKSTUDIO_SCOPES,
} from "./workstudio-oidc";

const SECRET = "s".repeat(40);
const base = {
  WORKSTUDIO_OIDC_CLIENT_ID: "workstudio-site-01",
  WORKSTUDIO_OIDC_CLIENT_SECRET: SECRET,
  WORKSTUDIO_PUBLIC_URL: "https://studio.nexora.example",
};

describe("lecture de l'environnement du fournisseur OIDC", () => {
  it("variables complètes : le client est configuré, l'adresse de retour est dérivée de WORKSTUDIO_PUBLIC_URL", () => {
    const r = resolveWorkstudioOidc(base);
    expect(r.config).toEqual({
      clientId: "workstudio-site-01",
      clientSecret: SECRET,
      publicUrl: "https://studio.nexora.example",
      callbackUrl:
        "https://studio.nexora.example/api/auth/oauth2/callback/nexora-oidc",
      tokenEndpointAuthMethod: "client_secret_post",
    });
    expect(WORKSTUDIO_CALLBACK_PATH).toBe(
      "/api/auth/oauth2/callback/nexora-oidc",
    );
  });

  it("ôte les barres finales, la requête et le fragment de l'adresse publique, garde un préfixe de chemin", () => {
    const r = resolveWorkstudioOidc({
      ...base,
      WORKSTUDIO_PUBLIC_URL: "https://nexora.example/studio///?a=1#x",
    });
    expect(r.config?.callbackUrl).toBe(
      "https://nexora.example/studio/api/auth/oauth2/callback/nexora-oidc",
    );
    expect(r.config?.publicUrl).toBe("https://nexora.example/studio");
  });

  it("l'authentification au point de jeton se choisit (post par défaut, basic sur demande)", () => {
    expect(
      resolveWorkstudioOidc({ ...base, WORKSTUDIO_OIDC_TOKEN_AUTH: "basic" })
        .config?.tokenEndpointAuthMethod,
    ).toBe("client_secret_basic");
    expect(
      resolveWorkstudioOidc({ ...base, WORKSTUDIO_OIDC_TOKEN_AUTH: "xyz" })
        .config,
    ).toBeNull();
  });

  it("échec fermé : variables absentes, vides ou incomplètes = fournisseur inactif", () => {
    expect(resolveWorkstudioOidc({})).toEqual({
      config: null,
      problem: "absent",
    });
    // L'adresse publique seule (bouton « Ouvrir WorkStudio ») n'active pas le fournisseur, sans avertissement.
    expect(
      resolveWorkstudioOidc({
        WORKSTUDIO_PUBLIC_URL: base.WORKSTUDIO_PUBLIC_URL,
      }),
    ).toEqual({ config: null, problem: "absent" });
    expect(
      resolveWorkstudioOidc({ ...base, WORKSTUDIO_OIDC_CLIENT_SECRET: "  " })
        .problem,
    ).toMatch(/WORKSTUDIO_OIDC_CLIENT_SECRET/);
    for (const key of Object.keys(base)) {
      const partial: Record<string, string> = { ...base };
      delete partial[key];
      const r = resolveWorkstudioOidc(partial);
      expect(r.config, key).toBeNull();
    }
  });

  it("refuse un secret trop court, un identifiant mal formé et une adresse non sûre, sans jamais citer les valeurs", () => {
    const cases: Array<[Record<string, string>, RegExp]> = [
      [{ WORKSTUDIO_OIDC_CLIENT_SECRET: "court" }, /SECRET/],
      [{ WORKSTUDIO_OIDC_CLIENT_SECRET: `${SECRET} avec espace` }, /SECRET/],
      [{ WORKSTUDIO_OIDC_CLIENT_ID: "a b" }, /CLIENT_ID/],
      [{ WORKSTUDIO_OIDC_CLIENT_ID: "court" }, /CLIENT_ID/],
      [{ WORKSTUDIO_PUBLIC_URL: "http://studio.nexora.example" }, /PUBLIC_URL/],
      [{ WORKSTUDIO_PUBLIC_URL: "pas une adresse" }, /PUBLIC_URL/],
      [{ WORKSTUDIO_PUBLIC_URL: "javascript:alert(1)" }, /PUBLIC_URL/],
      [
        { WORKSTUDIO_PUBLIC_URL: "https://u:p@studio.nexora.example" },
        /PUBLIC_URL/,
      ],
    ];
    for (const [over, pattern] of cases) {
      const r = resolveWorkstudioOidc({ ...base, ...over });
      expect(r.config, JSON.stringify(over)).toBeNull();
      expect(r.problem).toMatch(pattern);
      expect(r.problem).not.toContain(SECRET);
      expect(r.problem).not.toContain("studio.nexora.example");
    }
  });

  it("la boucle locale en http n'est admise que si on l'autorise (développement)", () => {
    const local = { ...base, WORKSTUDIO_PUBLIC_URL: "http://localhost:3200" };
    expect(resolveWorkstudioOidc(local).config).toBeNull();
    const r = resolveWorkstudioOidc(local, { allowLoopback: true });
    expect(r.config?.callbackUrl).toBe(
      "http://localhost:3200/api/auth/oauth2/callback/nexora-oidc",
    );
    // Seule la boucle locale : pas un autre hôte en http.
    expect(
      resolveWorkstudioOidc(
        { ...base, WORKSTUDIO_PUBLIC_URL: "http://studio.interne" },
        { allowLoopback: true },
      ).config,
    ).toBeNull();
  });
});

describe("portées et empreinte du secret", () => {
  it("les portées sont openid, profile, email et workstudio:model", () => {
    expect([...WORKSTUDIO_SCOPES]).toEqual([
      "openid",
      "profile",
      "email",
      "workstudio:model",
    ]);
  });

  it("l'empreinte du secret est stable, ne contient pas le secret et change avec lui", () => {
    const a = hashClientSecret(SECRET);
    expect(a).toBe(hashClientSecret(SECRET));
    expect(a).not.toContain(SECRET);
    expect(a).not.toBe(hashClientSecret(`${SECRET}x`));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
