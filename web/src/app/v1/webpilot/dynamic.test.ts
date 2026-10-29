import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(fileURLToPath(import.meta.url));

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

describe("routes /v1/webpilot/*", () => {
  const files = routes(ROOT);

  it("les huit routes sont là", () => {
    expect(files).toHaveLength(8);
  });

  for (const file of files) {
    it(`est toujours rendue à la demande (jamais préparée au build) : ${file.slice(ROOT.length + 1)}`, async () => {
      const route = await import(/* @vite-ignore */ file);
      expect(route.dynamic).toBe("force-dynamic");
    });
  }
});
