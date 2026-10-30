import {
  type Database,
  eq,
  organizationStorage,
  organizations,
  sql,
  storageUsage,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import { z } from "zod";
import { checkAdminAuth } from "../auth";

/**
 * `POST /api/admin/code/usage` : appelé par la tâche `code.sweep` du worker avec le jeton d'administration. Le worker
 * mesure les volumes des environnements ; le site tient le quota (`recordStorageUsage`). Un ajout qui rentre dans le
 * quota est compté normalement ; un ajout qui le dépasse est compté QUAND MÊME (l'espace est déjà occupé : ne pas le
 * compter fausserait le quota) et signalé par `overQuota`, pour que le worker arrête l'environnement et que le service
 * refuse de le redémarrer tant que l'espace n'est pas libéré.
 */

export interface UsageDeps {
  db: () => Database;
  adminToken: string | undefined;
  record: (
    organizationId: string,
    deltaBytes: number,
  ) => Promise<{ ok: true } | { ok: false; reason: "quota_exceeded" }>;
  log: Logger;
}

const body = z
  .object({
    organizationId: z.string().min(1).max(100),
    deltaBytes: z.number().int().min(-1e13).max(1e13),
  })
  .strict();

const HEADERS = { "cache-control": "no-store" };
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: HEADERS });

/** Ajoute `deltaBytes` à l'espace du produit `code` sans contrôle de quota (verrou de l'organisation comme `recordStorageUsage`). */
async function addOverage(
  db: Database,
  organizationId: string,
  deltaBytes: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const d = tx as unknown as Database;
    await d
      .insert(organizationStorage)
      .values({ organizationId })
      .onConflictDoNothing();
    await d
      .select({ extra: organizationStorage.extraBytes })
      .from(organizationStorage)
      .where(eq(organizationStorage.organizationId, organizationId))
      .for("update");
    await d
      .insert(storageUsage)
      .values({
        organizationId,
        product: "code",
        usedBytes: BigInt(deltaBytes),
      })
      .onConflictDoUpdate({
        target: [storageUsage.organizationId, storageUsage.product],
        set: {
          usedBytes: sql`GREATEST(${storageUsage.usedBytes} + ${deltaBytes.toString()}::bigint, 0)`,
          updatedAt: sql`now()`,
        },
      });
  });
}

export async function handleCodeUsage(
  request: Request,
  deps: UsageDeps,
): Promise<Response> {
  const auth = checkAdminAuth(request, deps.adminToken);
  if (auth === "not_configured")
    return json({ error: "admin_not_configured" }, 503);
  if (auth !== "ok") return json({ error: "unauthorized" }, 401);
  let parsed: z.infer<typeof body>;
  try {
    const result = body.safeParse(await request.json());
    if (!result.success) return json({ error: "invalid_request" }, 422);
    parsed = result.data;
  } catch {
    return json({ error: "invalid_json" }, 422);
  }
  try {
    const db = deps.db();
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, parsed.organizationId));
    if (!org) return json({ error: "invalid_request" }, 422);
    const result = await deps.record(parsed.organizationId, parsed.deltaBytes);
    if (result.ok) return json({ ok: true, overQuota: false });
    await addOverage(db, parsed.organizationId, parsed.deltaBytes);
    deps.log.warn("Nexora Code : espace dépassé par un environnement", {
      organizationId: parsed.organizationId,
    });
    return json({ ok: true, overQuota: true });
  } catch (error) {
    deps.log.error("Nexora Code : comptage de l'espace impossible", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return json({ error: "internal_error" }, 500);
  }
}
