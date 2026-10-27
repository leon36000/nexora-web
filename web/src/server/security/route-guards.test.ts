import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTE_GUARDS } from "./route-guards";

const appDir = fileURLToPath(new URL("../../app", import.meta.url));

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return /^route\.tsx?$/.test(name) ? [relative(appDir, dir)] : [];
  });
}

describe("registre des gardes d'accès", () => {
  const onDisk = routeFiles(appDir).sort();
  const declared = ROUTE_GUARDS.map((g) => g.route).sort();

  it("chaque route.ts du dossier app a une garde déclarée (et l'inverse)", () => {
    const undeclared = onDisk.filter((r) => !declared.includes(r));
    const stale = declared.filter((r) => !onDisk.includes(r));
    expect(undeclared, "routes sans garde déclarée").toEqual([]);
    expect(stale, "gardes déclarées pour une route absente").toEqual([]);
  });

  it("aucune route sensible n'est déclarée « public »", () => {
    for (const g of ROUTE_GUARDS.filter((x) => x.kind === "public"))
      expect(g.route, g.why).not.toMatch(
        /admin|account|billing|vault|revalidate/,
      );
  });

  it("toute route d'administration, de compte, de paiement ou de passerelle facturée a au moins une sonde sans identification", () => {
    for (const g of ROUTE_GUARDS.filter((x) =>
      ["admin-token", "session", "api-key", "signature"].includes(x.kind),
    ))
      expect(g.probes.length, g.route).toBeGreaterThan(0);
  });

  it("les sondes des routes protégées n'attendent jamais un succès", () => {
    for (const g of ROUTE_GUARDS.filter((x) => x.kind !== "public"))
      for (const p of g.probes)
        expect(
          p.expect.every((s) => s >= 400),
          `${g.route} ${p.label}`,
        ).toBe(true);
  });
});
