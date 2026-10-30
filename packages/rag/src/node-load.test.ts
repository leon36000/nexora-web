import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("chargement sous Node nu (comme le worker)", () => {
  it("le paquet se charge sans transpileur : tous les imports relatifs portent leur extension .ts", () => {
    const index = fileURLToPath(new URL("./index.ts", import.meta.url));
    const out = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(index)}); console.log(typeof m.chunkText, typeof m.extractText, typeof m.vectorSearchQuery);`,
      ],
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("function function function");
  });
});
