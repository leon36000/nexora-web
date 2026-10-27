import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config : redirections", () => {
  it("/favicon.ico mène à l'icône SVG du site (les navigateurs le demandent d'office)", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    const rule = rules.find((r) => r.source === "/favicon.ico");
    expect(rule?.destination).toBe("/icon.svg");
    expect(rule?.permanent).toBe(true);
  });
});
