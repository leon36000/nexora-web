import { randomBytes } from "node:crypto";
import {
  apiKeys,
  credit,
  type Database,
  organizationBilling,
  organizations,
  type WebpilotUnit,
  webpilotPriceItems,
  webpilotPriceSheets,
} from "@nexora/db";

/** Outils d'essai : organisation, clé, solde et feuille de prix publiée. Importés par les tests seulement. */
export async function newOrg(db: Database, house = false): Promise<string> {
  const id = `org_${randomBytes(6).toString("hex")}`;
  await db.insert(organizations).values({ id, name: id, slug: id });
  if (house)
    await db
      .insert(organizationBilling)
      .values({ organizationId: id, mode: "house" });
  return id;
}

export async function newKey(
  db: Database,
  organizationId: string,
  extra: { spendCapMicro?: bigint; webpilotOperations?: string[] | null } = {},
): Promise<string> {
  const [key] = await db
    .insert(apiKeys)
    .values({
      organizationId,
      name: "essai",
      prefix: "nxk_essai00",
      keyHash: randomBytes(16).toString("hex"),
      spendCapMicro: extra.spendCapMicro ?? null,
      webpilotOperations: extra.webpilotOperations ?? null,
    })
    .returning({ id: apiKeys.id });
  if (!key) throw new Error("clé non créée");
  return key.id;
}

export async function fund(
  db: Database,
  organizationId: string,
  micro: bigint,
): Promise<void> {
  await credit(db, {
    organizationId,
    amountMicro: micro,
    idempotencyKey: `fund:${randomBytes(6).toString("hex")}`,
    configVersion: "cfg_test",
    source: "purchase",
  });
}

export async function publishSheet(
  db: Database,
  prices: Partial<Record<WebpilotUnit, { sell: bigint; upstream?: bigint }>>,
  effectiveAt: Date = new Date(Date.now() - 60_000),
): Promise<string> {
  const [sheet] = await db
    .insert(webpilotPriceSheets)
    .values({ effectiveAt })
    .returning();
  if (!sheet) throw new Error("feuille non créée");
  for (const [unit, p] of Object.entries(prices))
    await db.insert(webpilotPriceItems).values({
      sheetId: sheet.id,
      unit: unit as WebpilotUnit,
      sellCadMicro: p.sell,
      upstreamUsdMicro: p.upstream ?? 0n,
    });
  await db
    .update(webpilotPriceSheets)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(webpilotPriceSheets.id, sheet.id));
  return sheet.id;
}

import { eq } from "@nexora/db";
