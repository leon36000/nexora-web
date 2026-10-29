import { createHash } from "node:crypto";
import {
  and,
  count,
  type Database,
  enqueue,
  eq,
  inArray,
  lt,
  releaseReservation,
  settleReservation,
  type WebpilotCrawlParams,
  type WebpilotCrawlState,
  type WebpilotTaskStatus,
  webpilotTaskResults,
  webpilotTasks,
} from "@nexora/db";
import { type Prices, reserveWebpilot, writeEvent } from "./billing.ts";
import type { Format } from "./content.ts";
import { SafeFetchError } from "./http.ts";
import type { PrivacyGate, PrivacyVerdict } from "./privacy.ts";
import { isPrivacyUnavailable } from "./privacy.ts";
import { type ReaderDeps, readPage } from "./reader.ts";

/**
 * Exploration d'un site (crawl) : tâche asynchrone exécutée par le worker (contrat §3.3 et §4.2).
 *
 * Facturation : la création réserve `limit` pages (402 sinon). À chaque lot, dans UNE transaction, le worker enregistre
 * les pages lues, règle la tranche courante au coût réel (pages lues × prix figé à la création), écrit l'événement
 * d'usage du lot et réserve la tranche suivante (les pages restantes). Un lot jamais validé n'est jamais facturé : ses
 * pages sont relues. À la fin ou à l'annulation, le reste est libéré. Solde épuisé en cours de route : la tâche passe à
 * `failed` (`insufficient_quota`) et garde ce qui a été lu et facturé. Page refusée par robots.txt, par la politique de
 * confidentialité ou en erreur : écartée, jamais facturée.
 */

export const TASK_ID_PREFIX = "crawl_";
export const publicTaskId = (uuid: string) =>
  `${TASK_ID_PREFIX}${uuid.replaceAll("-", "")}`;
export function parsePublicTaskId(id: string): string | null {
  const m = /^crawl_([0-9a-f]{32})$/.exec(id);
  if (!m?.[1]) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const CRAWL_JOB = "webpilot.crawl";
const MAX_QUEUE = 2000;
const TERMINAL: readonly WebpilotTaskStatus[] = [
  "completed",
  "cancelled",
  "failed",
];
const isTerminal = (s: WebpilotTaskStatus) => TERMINAL.includes(s);

const hash = (u: string) =>
  createHash("sha256").update(u).digest("hex").slice(0, 12);

function cleanUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function globToRegex(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return glob.includes("*")
    ? new RegExp(`^${body}$`)
    : new RegExp(`^${body}(/.*)?$`);
}

/** Cette adresse doit-elle être suivie ? Même hôte (si demandé), motifs d'inclusion et d'exclusion sur le chemin. */
export function followable(
  url: URL,
  start: URL,
  params: WebpilotCrawlParams,
): boolean {
  if (params.sameOriginOnly && url.hostname !== start.hostname) return false;
  const path = url.pathname;
  if (params.excludePaths.some((g) => globToRegex(g).test(path))) return false;
  if (
    params.includePaths.length > 0 &&
    !params.includePaths.some((g) => globToRegex(g).test(path))
  )
    return false;
  return true;
}

// --- création ----------------------------------------------------------------------------------------------

export type CreateCrawlResult =
  | { ok: true; taskId: string; reservedMicro: bigint }
  | {
      ok: false;
      reason: "insufficient" | "blocked" | "key_cap" | "too_many_active";
    };

export async function createCrawl(
  db: Database,
  input: {
    organizationId: string;
    apiKeyId: string;
    requestId: string;
    params: WebpilotCrawlParams;
    prices: Prices | null;
    house: boolean;
    maxActive: number;
    privacy?: { decision: string; policyVersion: string } | null;
  },
): Promise<CreateCrawlResult> {
  const [active] = await db
    .select({ n: count() })
    .from(webpilotTasks)
    .where(
      and(
        eq(webpilotTasks.organizationId, input.organizationId),
        inArray(webpilotTasks.status, ["queued", "running"]),
      ),
    );
  if ((active?.n ?? 0) >= input.maxActive)
    return { ok: false, reason: "too_many_active" };
  const unit = input.prices?.units.page_static;
  if (!unit && !input.house)
    throw new Error("exploration : prix de la page non publié");
  const sell = unit?.sellCadMicro ?? 0n;
  const configVersion = input.prices?.configVersion ?? "webpilot_unpriced";
  const amount = BigInt(input.params.limit) * sell;
  const reservation = await reserveWebpilot(db, {
    organizationId: input.organizationId,
    apiKeyId: input.apiKeyId,
    idempotencyKey: `wp:crawl:${input.requestId}:r0`,
    amountMicro: amount,
    configVersion,
    house: input.house,
  });
  if (!reservation.ok) return reservation;
  const start = cleanUrl(input.params.url) as URL;
  try {
    const taskId = await db.transaction(async (tx) => {
      const [task] = await tx
        .insert(webpilotTasks)
        .values({
          organizationId: input.organizationId,
          apiKeyId: input.apiKeyId,
          kind: "crawl",
          params: input.params,
          state: {
            queue: [{ url: start.toString(), depth: 0 }],
            seen: [hash(start.toString())],
          },
          pagesLimit: input.params.limit,
          sellCadMicro: sell,
          upstreamUsdMicro: unit?.upstreamUsdMicro ?? 0n,
          configVersion,
          billed: !input.house,
          reservationId: reservation.reservationId,
          reservedMicro: reservation.amountMicro,
          privacyDecision: input.privacy?.decision ?? null,
          policyVersion: input.privacy?.policyVersion ?? null,
        })
        .returning({ id: webpilotTasks.id });
      if (!task) throw new Error("tâche non créée");
      await enqueue(tx, {
        type: CRAWL_JOB,
        payload: { taskId: task.id, slice: 0 },
        idempotencyKey: `webpilot-crawl:${task.id}:0`,
      });
      return task.id;
    });
    return { ok: true, taskId, reservedMicro: reservation.amountMicro };
  } catch (error) {
    if (reservation.reservationId)
      await releaseReservation(db, {
        organizationId: input.organizationId,
        reservationId: reservation.reservationId,
      }).catch(() => undefined);
    throw error;
  }
}

// --- fin de tâche ------------------------------------------------------------------------------------------

/** Termine une tâche (annulée, échouée) : libère la réservation restante, efface la frontière, fixe la conservation. */
export async function finishTask(
  db: Database,
  taskId: string,
  status: Exclude<WebpilotTaskStatus, "queued" | "running">,
  options: { errorCode?: string; retentionMs: number; now: Date },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(webpilotTasks)
      .where(eq(webpilotTasks.id, taskId))
      .for("update");
    if (!task || isTerminal(task.status)) return false;
    if (task.billed && task.reservationId)
      await releaseReservation(tx, {
        organizationId: task.organizationId,
        reservationId: task.reservationId,
      });
    // Aucune page lue et aucun événement : on écrit quand même la trace de l'exploration (zéro unité).
    if (task.batchesDone === 0)
      await writeEvent(tx, {
        requestId: `wp_crawl_${task.id}_b1`,
        organizationId: task.organizationId,
        apiKeyId: task.apiKeyId,
        operation: "crawl",
        configVersion: task.configVersion,
        status:
          status === "completed"
            ? "ok"
            : status === "cancelled"
              ? "aborted"
              : "error",
        httpStatus: status === "failed" ? 500 : 200,
        errorCode: options.errorCode ?? null,
        units: { pageStatic: 0, pageBrowser: 0, browserMinute: 0 },
        chargedMicro: 0n,
        valueMicro: 0n,
        upstreamUsdMicro: 0n,
        billed: task.billed,
        destinationHost: hostOf(task.params.url),
        privacy: task.privacyDecision
          ? {
              decision: task.privacyDecision,
              policyVersion: task.policyVersion ?? "",
            }
          : null,
        reservationId: null,
        latencyMs: 0,
      });
    await tx
      .update(webpilotTasks)
      .set({
        status,
        errorCode: options.errorCode ?? null,
        reservationId: null,
        reservedMicro: 0n,
        state: { queue: [], seen: [] },
        finishedAt: options.now,
        expiresAt: new Date(options.now.getTime() + options.retentionMs),
        batchesDone: task.batchesDone === 0 ? 1 : task.batchesDone,
      })
      .where(eq(webpilotTasks.id, taskId));
    return true;
  });
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** Efface les tâches terminées dont la conservation est échue (leurs résultats partent avec elles). */
export async function purgeExpiredTasks(
  db: Database,
  now: Date,
): Promise<number> {
  const gone = await db
    .delete(webpilotTasks)
    .where(
      and(
        lt(webpilotTasks.expiresAt, now),
        inArray(webpilotTasks.status, ["completed", "cancelled", "failed"]),
      ),
    )
    .returning({ id: webpilotTasks.id });
  return gone.length;
}

// --- exécution ---------------------------------------------------------------------------------------------

export interface CrawlDeps {
  db: Database;
  reader: ReaderDeps;
  privacy: PrivacyGate;
  now: () => Date;
  /** Conservation des résultats après la fin de la tâche. */
  retentionMs: number;
  /** Pages tentées par lot (un lot = une transaction de règlement). */
  batchSize: number;
  /** Pause entre deux lectures d'un même site. */
  delayMs: number;
  /** Durée maximale d'une tranche de travail avant de rendre la main (le worker en relance une autre). */
  sliceMs: number;
  sleep?: (ms: number) => Promise<void>;
  signal?: AbortSignal;
}

interface PageOut {
  url: string;
  status: number;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const rank = { allow: 0, mask: 1, deny: 2 } as const;

/** Une tranche de travail ; `done` faux : il reste des pages, le worker doit relancer une tranche. */
export async function runCrawlSlice(
  deps: CrawlDeps,
  taskId: string,
): Promise<{ done: boolean }> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = deps.now().getTime() + deps.sliceMs;
  const load = async () =>
    (
      await deps.db
        .select()
        .from(webpilotTasks)
        .where(eq(webpilotTasks.id, taskId))
    )[0];
  let task = await load();
  if (!task || isTerminal(task.status)) return { done: true };
  if (task.status === "queued")
    await deps.db
      .update(webpilotTasks)
      .set({ status: "running", startedAt: deps.now() })
      .where(
        and(eq(webpilotTasks.id, taskId), eq(webpilotTasks.status, "queued")),
      );
  const fin = (
    status: "completed" | "cancelled" | "failed",
    errorCode?: string,
  ) =>
    finishTask(deps.db, taskId, status, {
      ...(errorCode ? { errorCode } : {}),
      retentionMs: deps.retentionMs,
      now: deps.now(),
    });

  for (;;) {
    task = await load();
    if (!task || isTerminal(task.status)) return { done: true };
    if (task.cancelRequested) {
      await fin("cancelled");
      return { done: true };
    }
    const remaining = task.pagesLimit - task.pagesDone;
    if (remaining <= 0 || task.state.queue.length === 0) {
      await fin("completed");
      return { done: true };
    }
    if (deps.signal?.aborted || deps.now().getTime() >= deadline)
      return { done: false };

    const params = task.params;
    const start = cleanUrl(params.url) as URL;
    const batch = task.state.queue.slice(
      0,
      Math.min(deps.batchSize, remaining),
    );
    const pages: PageOut[] = [];
    const found: { url: string; depth: number }[] = [];
    let skipped = 0;
    let verdict: PrivacyVerdict | null = null;
    let fatal: string | null = null;
    let cancelSeen = false;

    for (const [i, item] of batch.entries()) {
      if (i > 0) await sleep(deps.delayMs);
      const url = cleanUrl(item.url);
      if (!url) {
        skipped += 1;
        continue;
      }
      const intent = (u: URL) => ({
        organizationId: task?.organizationId as string,
        apiKeyId: task?.apiKeyId ?? null,
        product: "webpilot" as const,
        operation: "crawl",
        destination: { host: u.hostname, path: u.pathname },
        kinds: ["url"] as const,
      });
      try {
        const decide = async (u: URL) => {
          const v = await deps.privacy.evaluate(intent(u));
          if (!verdict || rank[v.decision] >= rank[verdict.decision])
            verdict = v;
          if (v.decision === "deny")
            throw new SafeFetchError(
              "url_not_allowed",
              "refusé par la politique",
            );
        };
        await decide(url);
        const out = await readPage(deps.reader, {
          url: url.toString(),
          formats: params.formats as Format[],
          onlyMainContent: params.onlyMainContent,
          render: "static",
          followLinks: true,
          beforeHop: async (hop) => {
            if (hop.hostname !== url.hostname) {
              if (params.sameOriginOnly && hop.hostname !== start.hostname)
                throw new SafeFetchError(
                  "url_not_allowed",
                  "redirection hors du site",
                );
              await decide(hop);
            }
          },
        });
        if (out.kind !== "page") {
          skipped += 1;
          continue;
        }
        pages.push({
          url: out.url,
          status: out.status,
          content: contentRecord(out.content, params.formats),
          metadata: {
            ...out.content.metadata,
            readAt: deps.now().toISOString(),
            depth: item.depth,
          },
        });
        if (item.depth < params.maxDepth)
          for (const link of out.followLinks ?? []) {
            const target = cleanUrl(link);
            if (target && followable(target, start, params))
              found.push({ url: target.toString(), depth: item.depth + 1 });
          }
      } catch (error) {
        if (isPrivacyUnavailable(error)) {
          fatal = "privacy_router_unavailable";
          break;
        }
        if (!(error instanceof SafeFetchError)) throw error;
        skipped += 1;
      }
      // Annulation demandée : on règle ce qui est lu, puis on s'arrête.
      const flag = await deps.db
        .select({ c: webpilotTasks.cancelRequested })
        .from(webpilotTasks)
        .where(eq(webpilotTasks.id, taskId));
      if (flag[0]?.c) {
        cancelSeen = true;
        break;
      }
    }

    const outcome = await commitBatch(deps, taskId, {
      attempted: batch.length,
      pages,
      skipped,
      found,
      verdict,
      fatal,
      cancelSeen,
    });
    if (outcome !== "continue") return { done: true };
  }
}

function contentRecord(
  c: object,
  formats: readonly string[],
): Record<string, unknown> {
  const source = c as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of formats) if (source[f] !== undefined) out[f] = source[f];
  return out;
}

async function commitBatch(
  deps: CrawlDeps,
  taskId: string,
  batch: {
    attempted: number;
    pages: PageOut[];
    skipped: number;
    found: { url: string; depth: number }[];
    verdict: PrivacyVerdict | null;
    fatal: string | null;
    cancelSeen: boolean;
  },
): Promise<"continue" | "completed" | "cancelled" | "failed"> {
  return deps.db.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(webpilotTasks)
      .where(eq(webpilotTasks.id, taskId))
      .for("update");
    if (!task || isTerminal(task.status)) return "completed";
    const now = deps.now();
    const n = batch.pages.length;
    const k = task.batchesDone + 1;

    // Frontière : retire les adresses tentées, ajoute les nouvelles (jamais vues), plafonne la file.
    const queue = task.state.queue.slice(batch.attempted);
    const seen = new Set(task.state.seen);
    for (const f of batch.found) {
      const h = hash(f.url);
      if (seen.has(h) || queue.length >= MAX_QUEUE) continue;
      seen.add(h);
      queue.push(f);
    }
    const pagesDone = task.pagesDone + n;
    const cost = BigInt(n) * task.sellCadMicro;
    const upstream = BigInt(n) * task.upstreamUsdMicro;

    if (n > 0)
      await tx.insert(webpilotTaskResults).values(
        batch.pages.map((p, i) => ({
          taskId,
          seq: task.pagesDone + i + 1,
          url: p.url,
          httpStatus: p.status,
          content: p.content,
          metadata: p.metadata,
        })),
      );

    let status: "running" | "completed" | "cancelled" | "failed" = "running";
    let errorCode: string | null = null;
    if (batch.fatal) {
      status = "failed";
      errorCode = batch.fatal;
    } else if (batch.cancelSeen) status = "cancelled";
    else if (pagesDone >= task.pagesLimit || queue.length === 0)
      status = "completed";

    // Règlement de la tranche courante, puis nouvelle tranche (les pages restantes) dans la même transaction.
    let reservationId = task.reservationId;
    let reservedMicro = task.reservedMicro;
    let charged = 0n;
    if (task.billed && reservationId && (cost > 0n || status !== "running")) {
      if (cost > 0n) {
        const settled = await settleReservation(tx, {
          organizationId: task.organizationId,
          reservationId,
          actualMicro: cost,
        });
        charged = settled.chargedMicro;
      } else {
        await releaseReservation(tx, {
          organizationId: task.organizationId,
          reservationId,
        });
      }
      reservationId = null;
      reservedMicro = 0n;
      if (status === "running") {
        const remainingCost =
          BigInt(task.pagesLimit - pagesDone) * task.sellCadMicro;
        const next = await reserveWebpilot(tx as unknown as Database, {
          organizationId: task.organizationId,
          apiKeyId: task.apiKeyId,
          idempotencyKey: `wp:crawl:${taskId}:r${k}`,
          amountMicro: remainingCost,
          configVersion: task.configVersion,
          house: false,
        });
        if (next.ok) {
          reservationId = next.reservationId;
          reservedMicro = next.amountMicro;
        } else {
          status = "failed";
          errorCode = "insufficient_quota";
        }
      }
    } else if (!task.billed) charged = 0n;

    const verdictNow = batch.verdict as PrivacyVerdict | null;
    const decision = verdictNow
      ? worst(task.privacyDecision, verdictNow.decision)
      : task.privacyDecision;
    const policyVersion = verdictNow?.policyVersion ?? task.policyVersion;

    if (n > 0 || task.batchesDone === 0)
      await writeEvent(tx, {
        requestId: `wp_crawl_${taskId}_b${k}`,
        organizationId: task.organizationId,
        apiKeyId: task.apiKeyId,
        operation: "crawl",
        configVersion: task.configVersion,
        status:
          status === "failed" && n === 0
            ? "error"
            : status === "cancelled"
              ? "aborted"
              : "ok",
        httpStatus: status === "failed" ? 402 : 200,
        errorCode,
        units: { pageStatic: n, pageBrowser: 0, browserMinute: 0 },
        chargedMicro: task.billed ? charged : 0n,
        valueMicro: task.billed ? charged : cost,
        upstreamUsdMicro: upstream,
        billed: task.billed,
        destinationHost: hostOf(task.params.url),
        privacy: decision
          ? { decision, policyVersion: policyVersion ?? "" }
          : null,
        reservationId: task.billed ? task.reservationId : null,
        latencyMs: 0,
      });

    const terminal = status !== "running";
    await tx
      .update(webpilotTasks)
      .set({
        status,
        pagesDone,
        pagesSkipped: task.pagesSkipped + batch.skipped,
        batchesDone: k,
        costMicro: task.costMicro + charged,
        state: terminal
          ? { queue: [], seen: [] }
          : ({ queue, seen: [...seen] } satisfies WebpilotCrawlState),
        reservationId,
        reservedMicro,
        privacyDecision: decision,
        policyVersion,
        errorCode,
        ...(terminal
          ? {
              finishedAt: now,
              expiresAt: new Date(now.getTime() + deps.retentionMs),
            }
          : {}),
      })
      .where(eq(webpilotTasks.id, taskId));
    return status === "running" ? "continue" : status;
  });
}

function worst(a: string | null, b: "allow" | "mask" | "deny"): string {
  if (!a) return b;
  const order = ["allow", "mask", "deny"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
