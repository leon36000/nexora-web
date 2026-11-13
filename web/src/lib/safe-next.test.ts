import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

const OAUTH =
  "/oauth/authorize?client_id=lifecode-desktop&redirect_uri=http%3A%2F%2F127.0.0.1%3A47381%2Fcallback" +
  "&response_type=code&scope=openid%20device%3Agrant" +
  "&code_challenge=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG" +
  "&code_challenge_method=S256&state=xyz";
const CHALLENGE = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

describe("safeNextPath (retour après connexion)", () => {
  it("admet la page d'autorisation d'un appareil, dans les deux langues, avec son code", () => {
    expect(safeNextPath("/code/device")).toBe("/code/device");
    expect(safeNextPath("/code/device?user_code=NXC-ABCD-2345")).toBe(
      "/code/device?user_code=NXC-ABCD-2345",
    );
    expect(safeNextPath("/en/code/device?user_code=NXC-ABCD-2345")).toBe(
      "/en/code/device?user_code=NXC-ABCD-2345",
    );
  });

  it("admet l'autorisation OIDC d'un client natif (query revalidée)", () => {
    expect(safeNextPath(OAUTH)).toBe(OAUTH);
    expect(
      safeNextPath(
        `/oauth/authorize?client_id=creative-studio-desktop&redirect_uri=http%3A%2F%2Flocalhost%3A52000%2Fcallback&response_type=code&scope=openid%20profile%20device%3Agrant&code_challenge=${CHALLENGE}&code_challenge_method=S256`,
      ),
    ).not.toBeNull();
  });

  it("refuse une autorisation OIDC dont un champ a été altéré", () => {
    const variants = [
      // client inconnu
      OAUTH.replace("lifecode-desktop", "evil-client"),
      // redirection non locale
      OAUTH.replace(
        "http%3A%2F%2F127.0.0.1%3A47381%2Fcallback",
        "https%3A%2F%2Fevil.example%2Fcallback",
      ),
      // sans port explicite
      OAUTH.replace(
        "http%3A%2F%2F127.0.0.1%3A47381%2Fcallback",
        "http%3A%2F%2F127.0.0.1%2Fcallback",
      ),
      // PKCE en clair
      OAUTH.replace("S256", "plain"),
      // défi trop court
      OAUTH.replace(CHALLENGE, "short"),
      // sans device:grant
      OAUTH.replace("openid%20device%3Agrant", "openid"),
      // paramètre inconnu (tentative d'écrasement)
      `${OAUTH}&next=%2F%2Fevil.example`,
      // tentative d'évasion d'origine
      `${OAUTH}&redirect=https://evil.example`,
    ];
    for (const bad of variants) expect(safeNextPath(bad)).toBeNull();
    expect(safeNextPath("/oauth/authorize")).toBeNull();
    expect(safeNextPath("/oauth/token?code=x")).toBeNull();
    expect(
      safeNextPath(`${OAUTH}&client_id=lifecode-desktop`),
    ).toBeNull();
  });

  it("refuse tout le reste : autre page, autre origine, schéma, évasions", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "/compte",
      "https://evil.example/code/device",
      "//evil.example/code/device",
      "/\\evil.example",
      "/code/device/../../compte",
      "/code/device?user_code=NXC-ABCD-2345&next=//evil.example",
      "/code/device?user_code=<script>",
      "/code/deviceX",
      "javascript:alert(1)",
      "/code/device#x",
      `/code/device?user_code=${"A".repeat(200)}`,
    ])
      expect(safeNextPath(bad)).toBeNull();
  });
});
