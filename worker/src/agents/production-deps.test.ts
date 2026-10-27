import type { Database } from "@nexora/db";
import { createLogger } from "@nexora/log";
import { describe, expect, it } from "vitest";
import { productionRunnerDeps } from "./index.ts";

const db = {} as Database;
const log = createLogger({ name: "test", sink: () => {} });

describe("dépendances de production des agents : adresses explicites", () => {
  it("en production, NEXORA_APP_INTERNAL_URL est obligatoire (aucun repli sur 127.0.0.1:3500)", () => {
    expect(() =>
      productionRunnerDeps(db, log, { NODE_ENV: "production" }),
    ).toThrow(/NEXORA_APP_INTERNAL_URL/);
    expect(() =>
      productionRunnerDeps(db, log, {
        NODE_ENV: "production",
        NEXORA_APP_INTERNAL_URL: "http://site.interne:3500",
        DIRECTUS_URL: "http://directus.interne:8055",
      }),
    ).not.toThrow();
  });

  it("en production, DIRECTUS_URL est obligatoire aussi", () => {
    expect(() =>
      productionRunnerDeps(db, log, {
        NODE_ENV: "production",
        NEXORA_APP_INTERNAL_URL: "http://site.interne:3500",
      }),
    ).toThrow(/DIRECTUS_URL/);
  });

  it("hors production, les valeurs de développement servent de repli", () => {
    expect(() => productionRunnerDeps(db, log, {})).not.toThrow();
  });
});
