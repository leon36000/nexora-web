import { eq, jobs } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { createLogger } from "@nexora/log";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HandlerRegistry } from "../registry.ts";
import {
  INDEX_JOB,
  indexClientFromEnv,
  registerRagHandlers,
} from "./handlers.ts";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

const DOC = "11111111-1111-4111-8111-111111111111";
const log = createLogger({ name: "rag-worker-test", sink: () => undefined });
const ctx = () => ({ log, signal: new AbortController().signal });
const job = (slice: number, attempt = 1) => ({
  id: "j",
  type: INDEX_JOB,
  payload: { documentId: DOC, slice },
  attempt,
  maxAttempts: 5,
});

function setup(
  reply: (call: {
    url: string;
    auth: string | null;
    body: Record<string, unknown>;
  }) => Response,
) {
  const calls: {
    url: string;
    auth: string | null;
    body: Record<string, unknown>;
  }[] = [];
  const registry = new HandlerRegistry();
  registerRagHandlers(registry, {
    db: t.db,
    log,
    index: indexClientFromEnv(
      {
        NEXORA_APP_INTERNAL_URL: "http://site.internal:3500",
        NEXORA_APP_ADMIN_TOKEN: "t".repeat(40),
      },
      (async (input: unknown, init?: RequestInit) => {
        const call = {
          url: String(input),
          auth: new Headers(init?.headers).get("authorization"),
          body: JSON.parse(String(init?.body)),
        };
        calls.push(call);
        return reply(call);
      }) as typeof fetch,
    ),
    now: () => new Date("2026-10-30T12:00:00Z"),
  });
  const handler = registry.get(INDEX_JOB);
  if (!handler) throw new Error("gestionnaire absent");
  return { calls, handler };
}
const pending = async () =>
  (await t.db.select().from(jobs).where(eq(jobs.type, INDEX_JOB))).filter((j) =>
    j.idempotencyKey?.startsWith(`rag-index:${DOC}:`),
  );

describe("tâche rag.index du worker", () => {
  it("appelle le site avec le jeton d'administration et relance la tranche suivante tant qu'il reste du travail", async () => {
    const { calls, handler } = setup(() => Response.json({ state: "partial" }));
    await handler(job(0), ctx());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "http://site.internal:3500/api/admin/rag/index",
      auth: `Bearer ${"t".repeat(40)}`,
      body: { documentId: DOC },
    });
    const next = (await pending()).find(
      (j) => j.idempotencyKey === `rag-index:${DOC}:1`,
    );
    expect(next?.payload).toEqual({ documentId: DOC, slice: 1 });
  });

  it("reprogramme après le délai demandé quand le modèle est momentanément indisponible", async () => {
    const { handler } = setup(() =>
      Response.json({
        state: "retry",
        afterSeconds: 90,
        error: "rate_limit_exceeded",
      }),
    );
    await handler(job(4), ctx());
    const next = (await pending()).find(
      (j) => j.idempotencyKey === `rag-index:${DOC}:5`,
    );
    expect(next?.availableAt.toISOString()).toBe("2026-10-30T12:01:30.000Z");
  });

  it("ne relance rien quand le document est prêt, disparu ou échoué", async () => {
    for (const state of ["ready", "gone", "failed"]) {
      const { handler } = setup(() =>
        Response.json({
          state,
          error: state === "failed" ? "insufficient_quota" : undefined,
        }),
      );
      await handler(job(20 + state.length), ctx());
      expect(
        (await pending()).some(
          (j) => j.idempotencyKey === `rag-index:${DOC}:${21 + state.length}`,
        ),
      ).toBe(false);
    }
  });

  it("laisse la file réessayer (erreur) quand le site répond mal, et refuse une charge utile invalide", async () => {
    const { handler } = setup(() => new Response("{}", { status: 502 }));
    await expect(handler(job(0), ctx())).rejects.toThrow(/502/);
    await expect(
      handler({ ...job(0), payload: { documentId: "pas-un-uuid" } }, ctx()),
    ).resolves.toBeUndefined();
  });

  it("s'arrête après 500 tranches pour ne jamais boucler", async () => {
    const { calls, handler } = setup(() => Response.json({ state: "partial" }));
    await handler(job(500), ctx());
    expect(calls).toHaveLength(0);
  });

  it("refuse de démarrer sans l'adresse interne ou le jeton", () => {
    expect(indexClientFromEnv({})).toBeNull();
    expect(
      indexClientFromEnv({
        NEXORA_APP_INTERNAL_URL: "http://x",
        NEXORA_APP_ADMIN_TOKEN: "court",
      }),
    ).toBeNull();
  });
});
