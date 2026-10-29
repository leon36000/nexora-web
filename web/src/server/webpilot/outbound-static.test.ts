import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrivacyGate } from "@nexora/webpilot";
import { describe, expect, it } from "vitest";
import type { PrivacyRouter } from "../privacy/types";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HTTP_MODULE = "packages/webpilot/src/http.ts";
/** Tout le code de WebPilot : moteur partagé, couche du site, routes, gestionnaires du worker. */
const ROOTS = [
  "packages/webpilot/src",
  "web/src/server/webpilot",
  "web/src/app/v1/webpilot",
  "worker/src/webpilot",
];

function sources(dir: string): string[] {
  const abs = join(REPO, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((name) => {
    const full = join(abs, name);
    const rel = relative(REPO, full);
    if (statSync(full).isDirectory()) return sources(rel);
    return /\.(ts|tsx)$/.test(name) &&
      !/\.test\.ts$/.test(name) &&
      name !== "test-support.ts"
      ? [rel]
      : [];
  });
}
const FILES = ROOTS.flatMap(sources);

describe("sortie vers le Web : un seul client", () => {
  it("le code de WebPilot est bien trouvé", () => {
    expect(FILES).toContain(HTTP_MODULE);
    expect(FILES.length).toBeGreaterThan(15);
  });

  it("aucun module sauf le client HTTP de sortie n'ouvre de connexion (fetch, http, https, net, tls, undici, WebSocket)", () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bglobalThis\.fetch\b/,
      /from\s+["']node:(http|https|http2|net|tls|dgram)["']/,
      /from\s+["'](http|https|http2|net|tls)["']/,
      /\brequire\(\s*["'](node:)?(http|https|net|tls)["']/,
      /\bundici\b/,
      /\bXMLHttpRequest\b/,
      /\bnew\s+WebSocket\b/,
      /\bnode-fetch\b|\baxios\b|\bgot\(/,
    ];
    const offenders: string[] = [];
    for (const file of FILES) {
      if (file === HTTP_MODULE) continue;
      const text = readFileSync(join(REPO, file), "utf8");
      for (const re of forbidden)
        if (re.test(text)) offenders.push(`${file} : ${re}`);
    }
    expect(offenders).toEqual([]);
  });

  it("le client HTTP de sortie ne se construit que dans les deux configurations de production (site et worker)", () => {
    const users = FILES.filter(
      (f) =>
        f !== HTTP_MODULE &&
        f !== "packages/webpilot/src/index.ts" &&
        readFileSync(join(REPO, f), "utf8").includes("createSafeHttpClient("),
    );
    expect(users.sort()).toEqual([
      "web/src/server/webpilot/deps.ts",
      "worker/src/webpilot/handlers.ts",
    ]);
  });

  it("la couche de confidentialité du site est acceptée telle quelle par le moteur partagé", () => {
    const gate: PrivacyGate = {} as PrivacyRouter;
    expect(gate).toBeDefined();
  });
});
