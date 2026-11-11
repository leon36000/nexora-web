/**
 * Processus enfant de `billing-crash.test.ts` : une vraie requête en flux dont l'amont reste ouvert ; le parent le tue
 * (SIGKILL) quand « READY » est affiché, sans aucun règlement.
 */
import { createDb } from "@nexora/db";
import { createLogger } from "@nexora/log";
import { handleChatCompletions } from "./proxy";
import { testPrivacyRouter } from "./test-support";

const url = process.env.CRASH_DB_URL ?? "";
const key = process.env.CRASH_KEY ?? "";
const handle = createDb(url, { max: 3 });
const enc = new TextEncoder();
const res = await handleChatCompletions(
  new Request("http://localhost/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "nexora/audit-chat",
      messages: [{ role: "user", content: "Génère un long texte" }],
      stream: true,
      max_tokens: 20000,
    }),
  }),
  {
    db: () => handle.db,
    fetch: (async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ id: "gen-crash", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "a".repeat(5000) }, finish_reason: null }] })}\n\n`,
              ),
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )) as typeof fetch,
    litellm: () => ({
      baseUrl: "http://litellm.internal:4000",
      masterKey: "sk-master-0123456789abcdef",
    }),
    log: createLogger({ name: "crash", sink: () => undefined }),
    now: () => new Date(),
    privacy: testPrivacyRouter(handle.db),
    requestId: () => "req_crash_1",
    limits: {
      defaultRpm: 1000,
      defaultTpm: 1_000_000_000,
      maxBodyBytes: 1_000_000,
      upstreamTimeoutMs: 30_000,
      streamTimeoutMs: 30_000,
      defaultMaxOutputTokens: 4096,
    },
  },
);
await res.body?.getReader().read();
console.log("READY");
await new Promise(() => undefined); // attend d'être tué
