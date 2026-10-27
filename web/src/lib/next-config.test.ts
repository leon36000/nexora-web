import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config : redirections", () => {
  it("/favicon.ico est un vrai fichier .ico du site (les navigateurs le demandent d'office) : aucune redirection ne le masque", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules.find((r) => r.source === "/favicon.ico")).toBeUndefined();
    const ico = readFileSync(
      fileURLToPath(new URL("../app/favicon.ico", import.meta.url)),
    );
    // En-tête ICO : réservé 0, type 1 (icône), au moins trois tailles (16, 32 et 48 px).
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2)]).toEqual([0, 1]);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(3);
  });
});
