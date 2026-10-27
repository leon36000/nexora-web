import {
  ensureSiteAgents,
  eq,
  jobs,
  siteAgentRuns,
  siteAgents,
} from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CmsClient } from "../cms/client";
import { afterPublished } from "./after-publish";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.delete(jobs);
  await t.db.delete(siteAgentRuns);
  await t.db.delete(siteAgents);
  await ensureSiteAgents(t.db);
});
const silent = createLogger({ name: "test", sink: () => {} });
const reader =
  (page: unknown): (() => CmsClient) =>
  () =>
    ({ get: async () => page }) as unknown as CmsClient;
const fr = { status: "published", translations: [{ languages_code: "fr-CA" }] };
const both = {
  status: "published",
  translations: [{ languages_code: "fr-CA" }, { languages_code: "en-CA" }],
};
const NOW = new Date("2026-10-27T12:00:00Z");
const deps = (page: unknown) => ({
  db: t.db,
  log: silent,
  reader: reader(page),
  now: () => NOW,
});
const enableTranslator = () =>
  t.db
    .update(siteAgents)
    .set({ enabled: true, state: "idle" })
    .where(eq(siteAgents.key, "traducteur"));

describe("après une publication", () => {
  it("met l'indexation en file (différée, une par fenêtre de 2 minutes) et ne fait rien pour une autre collection", async () => {
    await afterPublished({ collection: "navigation", id: "x" }, deps(fr));
    expect(await t.db.select().from(jobs)).toHaveLength(0);
    await afterPublished({ collection: "pages", id: "p1" }, deps(fr));
    await afterPublished({ collection: "pages", id: "p2" }, deps(fr));
    const idx = (await t.db.select().from(jobs)).filter(
      (j) => j.type === "seo.index",
    );
    expect(idx).toHaveLength(1);
    expect(idx[0]?.payload).toEqual({ trigger: "publish" });
    expect(idx[0]?.availableAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("Traducteur : mis en file seulement si activé ET si la page publiée n'a pas d'anglais", async () => {
    await afterPublished({ collection: "pages", id: "p1" }, deps(fr));
    expect(await t.db.select().from(siteAgentRuns)).toHaveLength(0); // désactivé
    await enableTranslator();
    await afterPublished({ collection: "pages", id: "p2" }, deps(both));
    expect(await t.db.select().from(siteAgentRuns)).toHaveLength(0); // anglais déjà là
    await afterPublished({ collection: "pages", id: "p3" }, deps(fr));
    await afterPublished({ collection: "pages", id: "p3" }, deps(fr)); // rejeu : pas de doublon
    const runs = await t.db.select().from(siteAgentRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      agentKey: "traducteur",
      trigger: "event",
      status: "queued",
      input: { pageId: "p3" },
    });
    const j = (await t.db.select().from(jobs)).filter(
      (x) => x.type === "site-agent.run",
    );
    expect(j).toHaveLength(1);
    expect(j[0]?.payload).toEqual({ runId: runs[0]?.id });
  });

  it("une panne de Directus ne casse pas la suite (l'indexation reste planifiée)", async () => {
    await enableTranslator();
    const broken = {
      db: t.db,
      log: silent,
      now: () => NOW,
      reader: () =>
        ({
          get: async () => {
            throw new Error("Directus injoignable");
          },
        }) as unknown as CmsClient,
    };
    await expect(
      afterPublished({ collection: "pages", id: "p9" }, broken),
    ).resolves.toBeUndefined();
    expect(
      (await t.db.select().from(jobs)).some((x) => x.type === "seo.index"),
    ).toBe(true);
  });
});
