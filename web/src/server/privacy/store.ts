import {
  and,
  count,
  type Database,
  desc,
  eq,
  gte,
  lt,
  type PrivacyDecisionValue,
  type PrivacyLevel,
  privacyEvents,
  privacyPolicies,
  sql,
} from "@nexora/db";
import { type PrivacyConfigInput, parsePolicyConfig } from "./policy";

/**
 * Accès à la base du Privacy Router : politique courante et historique des versions, compteurs de décisions et
 * rapport mensuel. Aucune lecture de contenu : le journal n'en contient pas.
 */

export interface StoredPolicy {
  version: number;
  level: PrivacyLevel;
  /** Configuration telle qu'enregistrée (validée à l'écriture, revalidée à la lecture par le routeur). */
  config: unknown;
  createdAt: Date;
}

export async function loadCurrentPolicy(
  db: Database,
  organizationId: string,
): Promise<StoredPolicy | null> {
  const [row] = await db
    .select({
      version: privacyPolicies.version,
      level: privacyPolicies.level,
      config: privacyPolicies.config,
      createdAt: privacyPolicies.createdAt,
    })
    .from(privacyPolicies)
    .where(
      and(
        eq(privacyPolicies.organizationId, organizationId),
        eq(privacyPolicies.current, true),
      ),
    );
  return row ?? null;
}

export interface PolicyVersionRow {
  version: number;
  level: PrivacyLevel;
  current: boolean;
  createdBy: string | null;
  createdAt: Date;
}

/** Historique des versions, de la plus récente à la plus ancienne. */
export async function listPolicyVersions(
  db: Database,
  organizationId: string,
  limit: number,
): Promise<PolicyVersionRow[]> {
  return db
    .select({
      version: privacyPolicies.version,
      level: privacyPolicies.level,
      current: privacyPolicies.current,
      createdBy: privacyPolicies.createdBy,
      createdAt: privacyPolicies.createdAt,
    })
    .from(privacyPolicies)
    .where(eq(privacyPolicies.organizationId, organizationId))
    .orderBy(desc(privacyPolicies.version))
    .limit(limit);
}

/** Sérialisation à clés triées : compare deux configurations sans dépendre de l'ordre des clés de jsonb. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export class InvalidPolicyError extends Error {
  constructor() {
    super("Configuration de confidentialité invalide");
    this.name = "InvalidPolicyError";
  }
}

/**
 * Enregistre une politique : la configuration est validée (zod) puis normalisée ; une nouvelle version devient
 * la version courante (l'ancienne reste dans l'historique). Rien ne change si le niveau et la configuration sont
 * identiques à la version courante. Verrou consultatif par organisation : des enregistrements simultanés donnent
 * des versions distinctes.
 */
export async function savePolicy(
  db: Database,
  input: {
    organizationId: string;
    level: PrivacyLevel;
    config: PrivacyConfigInput;
    createdBy: string | null;
  },
): Promise<{ version: number; changed: boolean }> {
  const parsed = parsePolicyConfig(input.config);
  if (!parsed.success) throw new InvalidPolicyError();
  const config = parsed.data;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`privacy-policy:${input.organizationId}`}, 0))`,
    );
    const [current] = await tx
      .select()
      .from(privacyPolicies)
      .where(
        and(
          eq(privacyPolicies.organizationId, input.organizationId),
          eq(privacyPolicies.current, true),
        ),
      );
    if (
      current &&
      current.level === input.level &&
      stable(current.config) === stable(config)
    )
      return { version: current.version, changed: false };
    const [latest] = await tx
      .select({
        max: sql<number>`coalesce(max(${privacyPolicies.version}), 0)`,
      })
      .from(privacyPolicies)
      .where(eq(privacyPolicies.organizationId, input.organizationId));
    const version = (latest?.max ?? 0) + 1;
    await tx
      .update(privacyPolicies)
      .set({ current: false })
      .where(
        and(
          eq(privacyPolicies.organizationId, input.organizationId),
          eq(privacyPolicies.current, true),
        ),
      );
    await tx.insert(privacyPolicies).values({
      organizationId: input.organizationId,
      version,
      level: input.level,
      config,
      current: true,
      createdBy: input.createdBy,
    });
    return { version, changed: true };
  });
}

export type DecisionCounts = Record<PrivacyDecisionValue, number>;

/** Nombre de décisions par type sur la période [from, to[. */
export async function decisionCounts(
  db: Database,
  organizationId: string,
  from: Date,
  to: Date,
): Promise<DecisionCounts> {
  const rows = await db
    .select({ decision: privacyEvents.decision, n: count() })
    .from(privacyEvents)
    .where(
      and(
        eq(privacyEvents.organizationId, organizationId),
        gte(privacyEvents.createdAt, from),
        lt(privacyEvents.createdAt, to),
      ),
    )
    .groupBy(privacyEvents.decision);
  const out: DecisionCounts = { allow: 0, mask: 0, deny: 0 };
  for (const r of rows) out[r.decision] = Number(r.n);
  return out;
}

export interface MonthlyReportRow {
  day: string;
  product: string;
  operation: string;
  decision: string;
  destination: string;
  rules: string;
  count: number;
  maskedItems: number;
}

/** Décisions d'un mois civil (UTC), regroupées par jour, produit, opération, décision, destination et règles. */
export async function monthlyReportRows(
  db: Database,
  organizationId: string,
  year: number,
  month: number,
): Promise<MonthlyReportRow[]> {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  const rows = await db.execute<{
    day: string;
    product: string;
    operation: string;
    decision: string;
    destination: string;
    rules: string;
    count: number;
    masked_items: number;
  }>(sql`
    SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
           product, operation, decision,
           coalesce(destination, '') AS destination,
           array_to_string(rule_ids, ' ') AS rules,
           count(*)::int AS count,
           coalesce(sum(masked_count), 0)::int AS masked_items
    FROM privacy_events
    WHERE organization_id = ${organizationId}
      AND created_at >= ${from.toISOString()}::timestamptz
      AND created_at < ${to.toISOString()}::timestamptz
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY 1, 2, 3, 4, 5, 6`);
  return [...rows].map((r) => ({
    day: r.day,
    product: r.product,
    operation: r.operation,
    decision: r.decision,
    destination: r.destination,
    rules: r.rules,
    count: Number(r.count),
    maskedItems: Number(r.masked_items),
  }));
}
