import { describe, expect, it } from "vitest";
import {
  BrowserServiceError,
  createBrowserService,
} from "./browser-service.ts";
import { SafeFetchError, type TrustedHttpClient } from "./http.ts";

type Call = {
  method: string;
  url: string;
  json: unknown;
  authorization: string | undefined;
};

function fake(replies: Array<{ status: number; json: unknown } | Error>): {
  client: Pick<TrustedHttpClient, "request">;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    client: {
      request: async (method, url, opts) => {
        calls.push({
          method,
          url,
          json: opts?.json,
          authorization: opts?.headers?.authorization,
        });
        const next = replies.shift();
        if (!next) throw new Error("plus de réponse");
        if (next instanceof Error) throw next;
        return {
          url,
          status: next.status,
          headers: {},
          body: new TextEncoder().encode(JSON.stringify(next.json)),
          redirects: 0,
        };
      },
    },
  };
}

const session = {
  id: "ses_a",
  status: "open",
  close_reason: null,
  opened_at: "2026-10-29T10:00:00.000Z",
  expires_at: "2026-10-29T10:05:00.000Z",
  last_activity_at: "2026-10-29T10:00:00.000Z",
  url: null,
};

describe("client du service de navigateur", () => {
  it("ouvre une session avec le secret de service et les bornes demandées", async () => {
    const { client, calls } = fake([{ status: 201, json: session }]);
    const svc = createBrowserService(client, "http://navigateur:8700", "sec");
    const out = await svc.open({
      id: "ses_a",
      maxSeconds: 300,
      idleSeconds: 60,
      viewport: { width: 800, height: 600 },
      locale: "fr-CA",
      timezone: "America/Toronto",
    });
    expect(out).toMatchObject({ id: "ses_a", status: "open" });
    expect(calls[0]).toEqual({
      method: "POST",
      url: "http://navigateur:8700/sessions",
      authorization: "Bearer sec",
      json: {
        id: "ses_a",
        max_seconds: 300,
        idle_seconds: 60,
        viewport: { width: 800, height: 600 },
        locale: "fr-CA",
        timezone: "America/Toronto",
      },
    });
  });

  it("exécute des actions et rend les résultats", async () => {
    const { client, calls } = fake([
      {
        status: 200,
        json: {
          ...session,
          url: "https://a.test/",
          title: "T",
          results: [{ type: "read", ok: true, html: "<p>x</p>" }],
          completed: true,
        },
      },
    ]);
    const svc = createBrowserService(client, "http://navigateur:8700", "sec");
    const out = await svc.run("ses_a", [{ type: "read" }], {
      approveHosts: ["a.test"],
    });
    expect(out).toMatchObject({ url: "https://a.test/", completed: true });
    expect(out.results[0]).toMatchObject({ type: "read", ok: true });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "http://navigateur:8700/sessions/ses_a/actions",
      json: { actions: [{ type: "read" }], approve_hosts: ["a.test"] },
    });
  });

  it("ferme avec un motif", async () => {
    const { client, calls } = fake([
      {
        status: 200,
        json: { ...session, status: "closed", close_reason: "idle" },
      },
    ]);
    const svc = createBrowserService(client, "http://navigateur:8700", "sec");
    await svc.close("ses_a", "insufficient_quota");
    expect(calls[0]).toMatchObject({
      method: "DELETE",
      url: "http://navigateur:8700/sessions/ses_a",
      json: { reason: "insufficient_quota" },
    });
  });

  it("traduit les erreurs du service en erreurs typées", async () => {
    const cases: Array<[number, unknown, string]> = [
      [404, { error: { code: "not_found" } }, "not_found"],
      [
        409,
        { error: { code: "session_closed", close_reason: "idle" } },
        "session_closed",
      ],
      [409, { error: { code: "busy" } }, "busy"],
      [429, { error: { code: "capacity" } }, "capacity"],
      [401, { error: { code: "unauthorized" } }, "unauthorized"],
      [502, { error: { code: "browser_error" } }, "browser_error"],
      [
        400,
        { error: { code: "invalid_request", index: 2 } },
        "invalid_request",
      ],
      [500, { error: { code: "internal_error" } }, "unavailable"],
    ];
    for (const [status, json, code] of cases) {
      const { client } = fake([{ status, json }]);
      const svc = createBrowserService(client, "http://navigateur:8700", "sec");
      const e = await svc.get("ses_a").catch((x: unknown) => x);
      expect(e).toBeInstanceOf(BrowserServiceError);
      expect((e as BrowserServiceError).code).toBe(code);
    }
    const { client } = fake([
      {
        status: 409,
        json: { error: { code: "session_closed", close_reason: "idle" } },
      },
    ]);
    const e = await createBrowserService(
      client,
      "http://navigateur:8700",
      "sec",
    )
      .get("ses_a")
      .catch((x: unknown) => x);
    expect((e as BrowserServiceError).closeReason).toBe("idle");
  });

  it("traduit une panne de réseau en indisponibilité, sans détail", async () => {
    const { client } = fake([
      new SafeFetchError("target_unreachable", "la cible n'a pas répondu"),
    ]);
    const e = await createBrowserService(
      client,
      "http://navigateur:8700",
      "sec",
    )
      .get("ses_a")
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BrowserServiceError);
    expect((e as BrowserServiceError).code).toBe("unavailable");
  });

  it("refuse une réponse mal formée", async () => {
    const { client } = fake([{ status: 200, json: { id: 5 } }]);
    const e = await createBrowserService(
      client,
      "http://navigateur:8700",
      "sec",
    )
      .get("ses_a")
      .catch((x: unknown) => x);
    expect((e as BrowserServiceError).code).toBe("unavailable");
  });
});
