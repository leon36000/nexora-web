import {
  and,
  asc,
  eq,
  gt,
  webpilotTaskResults,
  webpilotTasks,
} from "@nexora/db";
import {
  createCrawl,
  finishTask,
  NO_UNITS,
  parsePublicTaskId,
  publicTaskId,
} from "@nexora/webpilot";
import { errorObject, tooManyCrawls, W } from "./errors";
import { begin, checkPrivacy, pricesFor } from "./pipeline";
import { badFieldMessage, crawlSchema, paramOf } from "./schemas";
import { vetUrl } from "./scrape";
import type { WebpilotDeps } from "./types";

/** Création d'une exploration : valide, évalue la politique, réserve `limit` pages, met la tâche en file (202). */
export async function handleCrawlCreate(
  request: Request,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "crawl", { body: true });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const parsed = crawlSchema.safeParse(begun.body);
    if (!parsed.success)
      return W.badRequest(
        badFieldMessage(parsed.error),
        "invalid_request",
        paramOf(parsed.error),
        ctx.headers,
      );
    const input = parsed.data;
    const { maxCrawlPages, maxCrawlDepth } = deps.config;
    if (input.limit > maxCrawlPages)
      return W.badRequest(
        `« limit » ne peut pas dépasser ${maxCrawlPages}.`,
        "invalid_request",
        "limit",
        ctx.headers,
      );
    const maxDepth = input.max_depth ?? Math.min(2, maxCrawlDepth);
    if (maxDepth > maxCrawlDepth)
      return W.badRequest(
        `« max_depth » ne peut pas dépasser ${maxCrawlDepth}.`,
        "invalid_request",
        "max_depth",
        ctx.headers,
      );
    const vetted = await vetUrl(deps, input.url, ctx.headers);
    if ("response" in vetted) return vetted.response;
    const { url } = vetted;

    const priced = await pricesFor(ctx, deps, {
      ...NO_UNITS,
      pageStatic: 1,
    });
    if (!priced.ok) return priced.response;
    const privacy = await checkPrivacy(
      ctx,
      deps,
      {
        operation: "crawl",
        destination: { host: url.hostname, path: url.pathname },
        kinds: ["url"],
      },
      "crawl",
      url.hostname,
    );
    if (!privacy.ok) return privacy.response;

    const created = await createCrawl(ctx.db, {
      organizationId: ctx.key.organizationId,
      apiKeyId: ctx.key.id,
      requestId: ctx.requestId,
      params: {
        url: url.toString(),
        limit: input.limit,
        maxDepth,
        includePaths: input.include_paths ?? [],
        excludePaths: input.exclude_paths ?? [],
        sameOriginOnly: input.same_origin_only ?? true,
        formats: input.formats ?? ["markdown"],
        onlyMainContent: input.only_main_content ?? true,
      },
      prices: priced.prices,
      house: ctx.house,
      maxActive: deps.config.maxActiveCrawls,
      privacy: privacy.note,
    });
    if (!created.ok) {
      switch (created.reason) {
        case "too_many_active":
          return tooManyCrawls(ctx.headers);
        case "key_cap":
          return W.keyCap(ctx.headers);
        case "blocked":
          return W.blocked(ctx.headers);
        default:
          return W.insufficient(ctx.headers);
      }
    }
    return Response.json(
      { id: publicTaskId(created.taskId), status: "queued" },
      {
        status: 202,
        headers: {
          ...ctx.headers,
          "cache-control": "no-store",
          "x-nexora-privacy-decision": privacy.note.decision,
          "x-nexora-webpilot-units": "0",
          "x-nexora-cost-micro": "0",
        },
      },
    );
  } catch (error) {
    deps.log.error("webpilot : crawl", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

const PAGE_DEFAULT = 20;
const PAGE_MAX = 100;

/** État et résultats d'une exploration (pagination par `next`). Aucune unité facturée. */
export async function handleCrawlGet(
  request: Request,
  publicId: string,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "crawl", { body: false });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const id = parsePublicTaskId(publicId);
    const [task] = id
      ? await ctx.db
          .select()
          .from(webpilotTasks)
          .where(
            and(
              eq(webpilotTasks.id, id),
              eq(webpilotTasks.organizationId, ctx.key.organizationId),
            ),
          )
      : [];
    if (!task || (task.expiresAt && task.expiresAt <= deps.now()))
      return W.notFound(ctx.headers);
    const q = new URL(request.url).searchParams;
    const size = Math.min(
      Math.max(1, Number(q.get("limit")) || PAGE_DEFAULT),
      PAGE_MAX,
    );
    const cursor = Math.max(0, Number(q.get("next")) || 0);
    const rows = await ctx.db
      .select()
      .from(webpilotTaskResults)
      .where(
        and(
          eq(webpilotTaskResults.taskId, task.id),
          gt(webpilotTaskResults.seq, cursor),
        ),
      )
      .orderBy(asc(webpilotTaskResults.seq))
      .limit(size + 1);
    const page = rows.slice(0, size);
    const terminal = ["completed", "cancelled", "failed"].includes(task.status);
    return Response.json(
      {
        id: publicId,
        status: task.status,
        pages_done: task.pagesDone,
        pages_skipped: task.pagesSkipped,
        pages_total_estimate: terminal
          ? task.pagesDone
          : Math.min(task.pagesLimit, task.pagesDone + task.state.queue.length),
        results: page.map((r) => ({
          url: r.url,
          status: r.httpStatus,
          content: r.content,
          metadata: r.metadata,
        })),
        next: rows.length > size ? String(page.at(-1)?.seq ?? cursor) : null,
        usage: { pages: task.pagesDone, cost_micro: task.costMicro.toString() },
        error:
          task.status === "failed" && task.errorCode
            ? await errorObject(task.errorCode)
            : null,
        created_at: task.createdAt.toISOString(),
        finished_at: task.finishedAt?.toISOString() ?? null,
        expires_at: task.expiresAt?.toISOString() ?? null,
      },
      {
        headers: {
          ...ctx.headers,
          "cache-control": "no-store",
          "x-nexora-webpilot-units": "0",
        },
      },
    );
  } catch (error) {
    deps.log.error("webpilot : crawl (lecture)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}

/** Annulation : immédiate si la tâche n'a pas commencé, sinon au prochain contrôle du worker. */
export async function handleCrawlDelete(
  request: Request,
  publicId: string,
  deps: WebpilotDeps,
): Promise<Response> {
  try {
    const begun = await begin(request, deps, "crawl", { body: false });
    if (!begun.ok) return begun.response;
    const { ctx } = begun;
    const id = parsePublicTaskId(publicId);
    const [task] = id
      ? await ctx.db
          .select()
          .from(webpilotTasks)
          .where(
            and(
              eq(webpilotTasks.id, id),
              eq(webpilotTasks.organizationId, ctx.key.organizationId),
            ),
          )
      : [];
    if (!task) return W.notFound(ctx.headers);
    const headers = { ...ctx.headers, "cache-control": "no-store" };
    if (["completed", "cancelled", "failed"].includes(task.status))
      return Response.json({ id: publicId, status: task.status }, { headers });
    if (task.status === "queued") {
      await finishTask(ctx.db, task.id, "cancelled", {
        retentionMs: deps.config.resultRetentionMs,
        now: deps.now(),
      });
      return Response.json({ id: publicId, status: "cancelled" }, { headers });
    }
    await ctx.db
      .update(webpilotTasks)
      .set({ cancelRequested: true })
      .where(eq(webpilotTasks.id, task.id));
    return Response.json(
      { id: publicId, status: "running", cancel_requested: true },
      { status: 202, headers },
    );
  } catch (error) {
    deps.log.error("webpilot : crawl (annulation)", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return W.internal();
  }
}
