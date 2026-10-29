import { randomBytes } from "node:crypto";
import { organizations } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { savePolicy } from "@nexora/privacy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerPrivacyRouter } from "./privacy.ts";

const silent = createLogger({ name: "test", sink: () => {} });
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

async function organization(): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await t.db.insert(organizations).values({ id, name: id, slug: id });
  return id;
}

const intent = (organizationId: string, host: string) =>
  ({
    organizationId,
    apiKeyId: null,
    product: "webpilot",
    operation: "crawl",
    destination: { host },
    kinds: ["url"],
  }) as const;

describe("Privacy Router du worker (exploration WebPilot)", () => {
  it("applique la politique de l'organisation : un hôte hors de sa liste permise est refusé", async () => {
    const org = await organization();
    await savePolicy(t.db, {
      organizationId: org,
      level: "souverain",
      config: { allowedHosts: ["intranet.exemple.ca"] },
      createdBy: null,
    });
    const router = workerPrivacyRouter(t.db, silent);
    const refused = await router.evaluate(intent(org, "exemple.com"));
    expect(refused.decision).toBe("deny");
    const allowed = await router.evaluate(intent(org, "intranet.exemple.ca"));
    expect(allowed.decision).toBe("allow");
  });

  it("sans politique enregistrée : la politique standard par défaut laisse passer un site public", async () => {
    const org = await organization();
    const router = workerPrivacyRouter(t.db, silent);
    const verdict = await router.evaluate(intent(org, "exemple.com"));
    expect(verdict.decision).toBe("allow");
  });

  it("échec fermé : une base illisible ne laisse rien sortir", async () => {
    const org = await organization();
    const broken = {
      select: () => {
        throw new Error("base indisponible");
      },
    } as never;
    const router = workerPrivacyRouter(broken, silent);
    await expect(router.evaluate(intent(org, "exemple.com"))).rejects.toThrow(
      /indisponible/i,
    );
  });
});
