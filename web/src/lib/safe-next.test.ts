import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

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
