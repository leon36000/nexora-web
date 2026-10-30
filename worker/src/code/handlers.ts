import type { WorkspaceDriver } from "@nexora/code";
import { and, codeWorkspaces, type Database, eq, or, sql } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { HandlerRegistry } from "../registry.ts";

/**
 * Tâche périodique de l'environnement Nexora Code hébergé : `code.sweep`, déclarée toutes les 5 minutes par le
 * planificateur (seulement si le pilote est configuré). Deux gestes, chacun idempotent :
 *
 * 1. **Arrêt après inactivité** : un environnement « en marche » dont la dernière activité (le mandataire du site la note)
 *    remonte à plus de `NEXORA_CODE_IDLE_MINUTES` est arrêté ; ses données restent.
 * 2. **Espace** : le volume de chaque environnement en marche (au plus toutes les 10 minutes), et de chaque environnement
 *    arrêté (une fois après son arrêt), est mesuré par le pilote ; l'écart avec l'espace déjà compté est transmis au
 *    site (`POST /api/admin/code/usage`, qui tient le quota). Un dépassement bloque l'environnement et l'arrête.
 *
 * Un échec sur un environnement n'empêche pas les autres ; la tâche rejouée reprend là où elle en était.
 */

const MEASURE_EVERY_MS = 10 * 60_000;

/** Ce que le worker sait demander au site : compter (ou libérer) de l'espace du produit `code` pour une organisation. */
export interface UsageClient {
  apply(
    organizationId: string,
    deltaBytes: number,
  ): Promise<{ overQuota: boolean }>;
}

export function usageClientFromEnv(
  env: Record<string, string | undefined>,
  doFetch: typeof fetch = fetch,
): UsageClient | null {
  const base = env.NEXORA_APP_INTERNAL_URL?.trim().replace(/\/+$/, "");
  const token = env.NEXORA_APP_ADMIN_TOKEN?.trim();
  if (!base || !token || token.length < 32) return null;
  return {
    async apply(organizationId, deltaBytes) {
      const res = await doFetch(`${base}/api/admin/code/usage`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ organizationId, deltaBytes }),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok)
        throw new Error(`code.usage : le site a répondu ${res.status}`);
      const body = (await res.json()) as { overQuota?: unknown };
      return { overQuota: body.overQuota === true };
    },
  };
}

export interface CodeSweepDeps {
  db: Database;
  log: Logger;
  driver: WorkspaceDriver;
  usage: UsageClient;
  /** Image de l'environnement (sert à mesurer les volumes). */
  image: string;
  idleMinutes: number;
  now?: () => Date;
}

export interface CodeSweepResult {
  stopped: number;
  measured: number;
  blocked: number;
  failed: number;
}

export async function runCodeSweep(
  deps: CodeSweepDeps,
): Promise<CodeSweepResult> {
  const { db, log, driver } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const result: CodeSweepResult = {
    stopped: 0,
    measured: 0,
    blocked: 0,
    failed: 0,
  };
  const fail = (what: string, id: string, error: unknown) => {
    result.failed += 1;
    log.error(`code.sweep : ${what}`, {
      workspaceId: id,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  };

  // 1. Inactivité.
  const idleBefore = new Date(now.getTime() - deps.idleMinutes * 60_000);
  const idle = await db
    .select()
    .from(codeWorkspaces)
    .where(
      and(
        eq(codeWorkspaces.desiredStatus, "running"),
        sql`COALESCE(${codeWorkspaces.lastActivityAt}, ${codeWorkspaces.lastStartedAt}, ${codeWorkspaces.createdAt}) < ${idleBefore.toISOString()}::timestamptz`,
      ),
    );
  for (const row of idle) {
    try {
      await driver.stop(row.containerName);
      await db
        .update(codeWorkspaces)
        .set({ desiredStatus: "stopped", lastStoppedAt: now, updatedAt: now })
        .where(eq(codeWorkspaces.id, row.id));
      result.stopped += 1;
      log.info("environnement Nexora Code arrêté (inactivité)", {
        workspaceId: row.id,
      });
    } catch (error) {
      fail("arrêt impossible", row.id, error);
    }
  }

  // 2. Espace : en marche (périodique) ou arrêté depuis la dernière mesure.
  const staleBefore = new Date(now.getTime() - MEASURE_EVERY_MS);
  const candidates = await db
    .select()
    .from(codeWorkspaces)
    .where(
      or(
        and(
          eq(codeWorkspaces.desiredStatus, "running"),
          or(
            sql`${codeWorkspaces.sizeMeasuredAt} IS NULL`,
            sql`${codeWorkspaces.sizeMeasuredAt} < ${staleBefore.toISOString()}::timestamptz`,
          ),
        ),
        and(
          eq(codeWorkspaces.desiredStatus, "stopped"),
          sql`${codeWorkspaces.lastStoppedAt} IS NOT NULL`,
          or(
            sql`${codeWorkspaces.sizeMeasuredAt} IS NULL`,
            sql`${codeWorkspaces.sizeMeasuredAt} < ${codeWorkspaces.lastStoppedAt}`,
          ),
        ),
      ),
    );
  for (const row of candidates) {
    let bytes: number;
    try {
      bytes = await driver.volumeBytes({
        volumeName: row.volumeName,
        image: deps.image,
      });
    } catch (error) {
      fail("mesure impossible", row.id, error);
      continue;
    }
    const delta = bytes - Number(row.accountedBytes);
    // On note d'abord la nouvelle valeur (si personne ne l'a changée entre-temps), puis on prévient le site ; un
    // échec rend l'ancienne valeur, et le prochain tour refait le même écart.
    const claimed = await db
      .update(codeWorkspaces)
      .set({
        accountedBytes: BigInt(bytes),
        sizeMeasuredAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(codeWorkspaces.id, row.id),
          eq(codeWorkspaces.accountedBytes, row.accountedBytes),
        ),
      )
      .returning({ id: codeWorkspaces.id });
    if (claimed.length === 0) continue;
    let overQuota = false;
    if (delta !== 0) {
      try {
        overQuota = (await deps.usage.apply(row.organizationId, delta))
          .overQuota;
      } catch (error) {
        await db
          .update(codeWorkspaces)
          .set({
            accountedBytes: row.accountedBytes,
            sizeMeasuredAt: row.sizeMeasuredAt,
          })
          .where(
            and(
              eq(codeWorkspaces.id, row.id),
              eq(codeWorkspaces.accountedBytes, BigInt(bytes)),
            ),
          );
        fail("comptage de l'espace impossible", row.id, error);
        continue;
      }
    }
    result.measured += 1;
    if (!overQuota) {
      if (row.quotaBlocked)
        await db
          .update(codeWorkspaces)
          .set({ quotaBlocked: false })
          .where(eq(codeWorkspaces.id, row.id));
      continue;
    }
    result.blocked += 1;
    await db
      .update(codeWorkspaces)
      .set({ quotaBlocked: true })
      .where(eq(codeWorkspaces.id, row.id));
    if (row.desiredStatus === "running") {
      try {
        await driver.stop(row.containerName);
        await db
          .update(codeWorkspaces)
          .set({ desiredStatus: "stopped", lastStoppedAt: now })
          .where(eq(codeWorkspaces.id, row.id));
      } catch (error) {
        fail("arrêt impossible (espace dépassé)", row.id, error);
      }
    }
    log.warn("environnement Nexora Code bloqué : espace dépassé", {
      workspaceId: row.id,
      organizationId: row.organizationId,
    });
  }
  return result;
}

export function registerCodeHandlers(
  registry: HandlerRegistry,
  deps: CodeSweepDeps,
): void {
  registry.register("code.sweep", async (_job, ctx) => {
    const result = await runCodeSweep({ ...deps, log: ctx.log });
    ctx.log.info("code.sweep", { ...result });
  });
}
