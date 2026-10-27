import { credit, type Database } from "@nexora/db";

/**
 * Crédit de TEST du grand livre (développement et démonstrations) : une écriture `credit` de source
 * `dev_test_credit`, SANS paiement ni faux paiement. Refusé en production.
 */
export async function grantTestCredit(
  db: Database,
  input: { organizationId: string; amountMicro: bigint; label: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV === "production")
    throw new Error("crédit de test interdit en production");
  return credit(db, {
    organizationId: input.organizationId,
    amountMicro: input.amountMicro,
    idempotencyKey: `dev-test-credit:${input.label}`,
    configVersion: "dev_test_credit",
    source: "dev_test_credit",
    metadata: { note: "crédit de test, aucun paiement" },
  });
}
