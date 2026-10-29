import {
  type Database,
  enqueue,
  eq,
  getAgentDefinition,
  type SiteAgentKey,
  seoAudits,
  siteAgentRuns,
  siteAgents,
  sql,
} from "@nexora/db";
import type { Logger } from "@nexora/log";

/**
 * Planificateur du worker (S8) : toutes les minutes, déclare ce qui est dû et le met dans la file `jobs`.
 * Chaque occurrence a une CLÉ D'IDEMPOTENCE (jour, heure…) : plusieurs workers ou un redémarrage n'en créent jamais deux.
 * Heures en America/Toronto. Tout ce qui touche à un agent respecte son activation et son budget (le coureur re-vérifie).
 *
 *   03:00 chaque jour     audit complet (liens, accessibilité, performance, structure)
 *   04:00 chaque jour     filet de sécurité de l'indexation (le diff du sitemap) et vérification des adaptateurs
 *   chaque heure          Santé des modèles (si l'agent est activé)
 *   lundi 07:00           Veille (si activée et si une source est configurée dans l'agent)
 *   toutes les 10 minutes libération des réservations de crédits perdues (grand livre, voir ledger-handlers.ts)
 *   toutes les 30 minutes alertes de solde bas (courriel aux propriétaires, voir balance-alerts.ts)
 *   chaque heure          versement des douzièmes mensuels des crédits inclus des offres annuelles
 *   02:00 chaque jour     expiration des crédits échus (12 mois)
 */
const TZ = "America/Toronto";
/** Tranche de la libération des réservations perdues. */
const LEDGER_RELEASE_EVERY_MS = 10 * 60_000;
/** Versement des douzièmes mensuels des offres annuelles : une occurrence par heure. */
const LEDGER_GRANT_EVERY_MS = 60 * 60_000;
const BALANCE_ALERT_EVERY_MS = 30 * 60_000;

export interface LocalClock {
  date: string; // YYYY-MM-DD
  hour: number;
  weekday: string; // Mon..Sun
  hourKey: string; // YYYY-MM-DDTHH
}

export function localClock(now: Date, timeZone = TZ): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  return {
    date,
    hour,
    weekday: String(parts.weekday),
    hourKey: `${date}T${String(hour).padStart(2, "0")}`,
  };
}

export interface SchedulerDeps {
  db: Database;
  log: Logger;
  now?: () => Date;
}

/** Crée l'exécution d'un agent ET sa tâche, une seule fois par clé (verrou consultatif + clé de tâche). */
async function scheduleAgentRun(
  db: Database,
  key: SiteAgentKey,
  occurrence: string,
  input: Record<string, unknown> = {},
): Promise<string | null> {
  const idem = `site-agent-run:schedule:${key}:${occurrence}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idem}))`);
    const dup = await tx.execute(
      sql`SELECT 1 FROM jobs WHERE idempotency_key = ${idem}`,
    );
    if ((dup as unknown as unknown[]).length > 0) return null;
    const [agent] = await tx
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, key));
    if (!agent?.enabled) return null;
    const [run] = await tx
      .insert(siteAgentRuns)
      .values({
        agentKey: key,
        trigger: "schedule",
        status: "queued",
        input,
        model: agent.model,
      })
      .returning();
    if (!run) return null;
    const job = await enqueue(tx as unknown as Database, {
      type: "site-agent.run",
      payload: { runId: run.id },
      idempotencyKey: idem,
      maxAttempts: 1,
    });
    await tx
      .update(siteAgentRuns)
      .set({ jobId: job.id })
      .where(eq(siteAgentRuns.id, run.id));
    return run.id;
  });
}

async function scheduleNightlyAudit(
  db: Database,
  date: string,
): Promise<string | null> {
  const idem = `seo-audit:nightly:${date}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${idem}))`);
    const dup = await tx.execute(
      sql`SELECT 1 FROM jobs WHERE idempotency_key = ${idem}`,
    );
    if ((dup as unknown as unknown[]).length > 0) return null;
    const [audit] = await tx
      .insert(seoAudits)
      .values({ kind: "all", trigger: "schedule" })
      .returning();
    if (!audit) return null;
    await enqueue(tx as unknown as Database, {
      type: "seo.audit",
      payload: { auditId: audit.id },
      idempotencyKey: idem,
      maxAttempts: 1,
    });
    return audit.id;
  });
}

/** Ce qui est dû à cet instant. Idempotent : peut être appelée à chaque minute. */
export async function tickScheduler(deps: SchedulerDeps): Promise<string[]> {
  const { db } = deps;
  const clock = localClock((deps.now ?? (() => new Date()))());
  const done: string[] = [];

  // Grand livre : une occurrence par tranche de 10 minutes (libération) et par jour (expiration). Les clés
  // d'idempotence rendent l'appel répété, ou plusieurs workers, sans effet.
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  await enqueue(db, {
    type: "ledger.release-stale",
    idempotencyKey: `ledger-release-stale:${Math.floor(nowMs / LEDGER_RELEASE_EVERY_MS)}`,
    maxAttempts: 1,
  });
  // WebPilot : effacement horaire des explorations dont la conservation est échue.
  await enqueue(db, {
    type: "webpilot.purge",
    idempotencyKey: `webpilot-purge:${Math.floor(nowMs / LEDGER_GRANT_EVERY_MS)}`,
    maxAttempts: 2,
  });
  // WebPilot : balayage des sessions de navigateur, une occurrence par minute (minutes échues, échéances, inactivité).
  await enqueue(db, {
    type: "webpilot.sessions.sweep",
    idempotencyKey: `webpilot-sessions:${Math.floor(nowMs / 60_000)}`,
    maxAttempts: 1,
  });
  // Alertes de solde bas : une occurrence par demi-heure.
  await enqueue(db, {
    type: "billing.balance-alerts",
    idempotencyKey: `billing-balance-alerts:${Math.floor(nowMs / BALANCE_ALERT_EVERY_MS)}`,
    maxAttempts: 2,
  });
  await enqueue(db, {
    type: "ledger.grant-tranches",
    idempotencyKey: `ledger-grant-tranches:${Math.floor(nowMs / LEDGER_GRANT_EVERY_MS)}`,
    maxAttempts: 3,
  });
  if (clock.hour >= 2)
    await enqueue(db, {
      type: "ledger.expire",
      idempotencyKey: `ledger-expire:${clock.date}`,
      maxAttempts: 3,
    });

  if (clock.hour >= 3 && (await scheduleNightlyAudit(db, clock.date)))
    done.push("audit nocturne");

  if (clock.hour >= 4) {
    const idx = `seo-index:schedule:${clock.date}`;
    const before = await db.execute(
      sql`SELECT 1 FROM jobs WHERE idempotency_key = ${idx}`,
    );
    if ((before as unknown as unknown[]).length === 0) {
      await enqueue(db, {
        type: "seo.index",
        payload: { trigger: "schedule" },
        idempotencyKey: idx,
        maxAttempts: 1,
      });
      done.push("indexation (filet)");
    }
    for (const key of [
      "indexnow",
      "bing",
      "searchconsole",
      "dataforseo",
      "postiz",
    ]) {
      const ik = `seo-adapter-check:schedule:${key}:${clock.date}`;
      const had = await db.execute(
        sql`SELECT 1 FROM jobs WHERE idempotency_key = ${ik}`,
      );
      if ((had as unknown as unknown[]).length === 0)
        await enqueue(db, {
          type: "seo.adapter-check",
          payload: { key },
          idempotencyKey: ik,
          maxAttempts: 1,
        });
    }
  }

  if (await scheduleAgentRun(db, "sante", clock.hourKey))
    done.push("santé des modèles");

  if (clock.weekday === "Mon" && clock.hour >= 7) {
    const [veille] = await db
      .select()
      .from(siteAgents)
      .where(eq(siteAgents.key, "veille"));
    const url = veille?.config.sourceUrl;
    if (typeof url === "string" && url && getAgentDefinition("veille"))
      if (await scheduleAgentRun(db, "veille", clock.date, { sourceUrl: url }))
        done.push("veille hebdomadaire");
  }
  return done;
}

export function startScheduler(
  deps: SchedulerDeps,
  tickMs = 60_000,
): { stop(): void } {
  const run = () =>
    tickScheduler(deps)
      .then((done) => {
        if (done.length) deps.log.info("planificateur", { planifié: done });
      })
      .catch((e) => deps.log.error("planificateur en échec", { error: e }));
  const timer = setInterval(run, tickMs);
  timer.unref();
  void run();
  return { stop: () => clearInterval(timer) };
}
