import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq, organizationBilling, users } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserOrganization } from "../auth/organization";
import { handleSetBalanceAlert } from "../billing/alert-handlers";
import { loadKeyring } from "../vault/crypto";
import { type AccountContext, handleCreateKey } from "./account-handlers";
import { billingModeOf } from "./house";
import { ensureModelAccess } from "./provision";

/**
 * L'accès gratuit est réservé à l'organisation « maison » de l'administrateur : un client ordinaire ne l'obtient ni à
 * l'inscription, ni par WorkStudio, ni par une route de l'espace client, et aucun code du site ne le pose.
 */
let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const SITE = "http://localhost:3500";
const log = createLogger({ name: "test", sink: () => {} });
const deps = (ctx: AccountContext) => ({
  db: () => t.db,
  siteUrl: SITE,
  getContext: async () => ctx,
  log,
  now: () => new Date(),
});
const call = (url: string, method: string, body: unknown) =>
  new Request(`${SITE}${url}`, {
    method,
    headers: { origin: SITE, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function newCustomer() {
  const id = `u_${randomBytes(6).toString("hex")}`;
  await t.db.insert(users).values({
    id,
    name: "Cliente Ordinaire",
    email: `${id}@exemple.ca`,
    emailVerified: true,
  });
  const org = await ensureUserOrganization(t.db, id);
  return { userId: id, organizationId: org.id };
}

describe("accès gratuit réservé à l'administrateur", () => {
  it("un client qui s'inscrit a une organisation ordinaire, sans ligne de gratuité et sans crédit offert", async () => {
    const c = await newCustomer();
    expect(await billingModeOf(t.db, c.organizationId)).toBe("standard");
    expect(
      await t.db
        .select()
        .from(organizationBilling)
        .where(eq(organizationBilling.organizationId, c.organizationId)),
    ).toHaveLength(0);
  });

  it("la clé automatique de WorkStudio ne rend pas l'organisation gratuite", async () => {
    const c = await newCustomer();
    await ensureModelAccess(
      t.db,
      loadKeyring({
        NEXORA_VAULT_MASTER_KEY: randomBytes(32).toString("base64"),
      }),
      {
        organizationId: c.organizationId,
        gatewayUrl: "https://passerelle.exemple.ca/v1",
        defaultModel: "nexora/deepseek-v4.1-flash-1017",
      },
    );
    expect(await billingModeOf(t.db, c.organizationId)).toBe("standard");
  });

  it("les routes de l'espace client refusent un champ de mode de facturation (corps strict)", async () => {
    const c = await newCustomer();
    const owner: AccountContext = { ...c, role: "owner" };
    for (const extra of [
      { billingMode: "house" },
      { mode: "house" },
      { free: true },
    ]) {
      expect(
        (
          await handleCreateKey(
            call("/api/account/api-keys", "POST", { name: "k", ...extra }),
            deps(owner),
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await handleSetBalanceAlert(
            call("/api/account/balance-alert", "PUT", {
              enabled: true,
              thresholdCad: "5",
              ...extra,
            }),
            deps(owner),
          )
        ).status,
      ).toBe(422);
    }
    expect(await billingModeOf(t.db, c.organizationId)).toBe("standard");
  });

  it("aucun code du site, hors le module de la maison et son script, ne pose le mode gratuit", () => {
    const root = fileURLToPath(new URL("../..", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name))
          files.push(path);
      }
    };
    walk(root);
    const offenders = files
      .filter((f) => !f.endsWith(join("server", "gateway", "house.ts")))
      .filter((f) => !f.endsWith(join("server", "webpilot", "test-support.ts")))
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return (
          /\bsetBillingMode\s*\(/.test(text) ||
          /insert\(\s*organizationBilling\s*\)/.test(text)
        );
      });
    expect(offenders).toEqual([]);
  });
});
