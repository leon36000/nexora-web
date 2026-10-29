import { randomBytes } from "node:crypto";
import {
  credit,
  type Database,
  eq,
  organizationBilling,
  type WebpilotUnit,
  webpilotPriceItems,
  webpilotPriceSheets,
} from "@nexora/db";
import { createLogger } from "@nexora/log";
import {
  type BrowserService,
  type BrowserServiceError,
  type CloseReason,
  createRobotsChecker,
  type ReaderDeps,
  type Renderer,
  SafeFetchError,
  type SafeHttpClient,
  type ServiceAction,
  type ServiceActionResult,
} from "@nexora/webpilot";
import { createApiKey } from "../gateway/keys";
import { newOrganization } from "../gateway/test-support";
import type { PrivacyRouter } from "../privacy/types";
import { webpilotConfig } from "./config";
import type { WebpilotDeps } from "./types";

/** Outils d'essai de WebPilot : dépendances factices, site factice, organisation, clé, solde et feuille de prix. */
export interface FakeSite {
  pages: Record<
    string,
    { status?: number; body?: string; type?: string; throws?: SafeFetchError }
  >;
  gets: string[];
}

export function fakeSite(pages: FakeSite["pages"] = {}): FakeSite {
  return { pages, gets: [] };
}

export function fakeClient(site: FakeSite): SafeHttpClient {
  const forbidden =
    /^(https?:\/\/)?(127\.|10\.|192\.168\.|169\.254\.|localhost)/;
  return {
    post: async () => {
      throw new Error("non utilisé");
    },
    check: async (raw) => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new SafeFetchError("url_not_allowed", "adresse invalide");
      }
      if (
        !["http:", "https:"].includes(url.protocol) ||
        forbidden.test(`${url.protocol}//${url.hostname}`)
      )
        throw new SafeFetchError("url_not_allowed", "refusé");
      if (url.hostname === "inconnu.test")
        throw new SafeFetchError("target_unreachable", "hôte introuvable");
      return url;
    },
    get: async (raw, options) => {
      const url = new URL(raw);
      await options?.beforeHop?.(url);
      site.gets.push(raw);
      const page = site.pages[raw];
      if (page?.throws) throw page.throws;
      return {
        url: raw,
        status: page?.status ?? (page ? 200 : 404),
        headers: { "content-type": page?.type ?? "text/html; charset=utf-8" },
        body: new TextEncoder().encode(page?.body ?? ""),
        redirects: 0,
      };
    },
  };
}

export const allowAllPrivacy: PrivacyRouter = {
  evaluate: async () => ({ decision: "allow", policyVersion: "pol-test" }),
};

export function makeDeps(
  db: Database,
  site: FakeSite,
  over: Partial<WebpilotDeps> & {
    robotsBlocked?: string[];
    renderer?: Renderer | null;
  } = {},
): WebpilotDeps {
  const client = fakeClient(site);
  let n = 0;
  const robots = createRobotsChecker({
    client: {
      get: async (raw) => {
        const blocked = over.robotsBlocked ?? [];
        const path = new URL(raw).origin;
        void path;
        return {
          url: raw,
          status: 200,
          headers: {},
          body: new TextEncoder().encode(
            blocked.length
              ? `User-agent: *\n${blocked.map((p) => `Disallow: ${p}`).join("\n")}`
              : "",
          ),
          redirects: 0,
        };
      },
    },
    userAgentToken: "NexoraWebPilot",
  });
  const reader: ReaderDeps = {
    client,
    robots,
    renderer: over.renderer ?? null,
  };
  const { robotsBlocked: _r, renderer: _x, ...rest } = over;
  return {
    db: () => db,
    privacy: allowAllPrivacy,
    log: createLogger({ name: "webpilot-test", sink: () => undefined }),
    now: () => new Date(),
    requestId: () => `req_test_${++n}_${randomBytes(3).toString("hex")}`,
    config: webpilotConfig({
      WEBPILOT_SEARCH_URL: "http://searxng.invalid:8080",
      WEBPILOT_EXTRACT_MODEL: "nexora/test-chat",
    }),
    reader,
    searchClient: null,
    browser: null,
    chat: async () =>
      new Response("pas de passerelle d'essai", { status: 500 }),
    ...rest,
  };
}

export async function seedClient(
  db: Database,
  options: {
    balance?: bigint;
    house?: boolean;
    operations?: string[] | null;
    rpmLimit?: number;
  } = {},
): Promise<{ org: string; keyId: string; key: string }> {
  const org = await newOrganization(db);
  if (options.house)
    await db
      .insert(organizationBilling)
      .values({ organizationId: org, mode: "house" });
  if (options.balance)
    await credit(db, {
      organizationId: org,
      amountMicro: options.balance,
      idempotencyKey: `fund:${org}`,
      configVersion: "cfg_test",
      source: "purchase",
    });
  const created = await createApiKey(db, {
    organizationId: org,
    name: "essai",
    webpilotOperations:
      options.operations === undefined
        ? ["search", "scrape", "crawl", "extract", "sessions"]
        : options.operations,
    rpmLimit: options.rpmLimit ?? null,
  });
  return { org, keyId: created.record.id, key: created.key };
}

export async function publishPrices(
  db: Database,
  prices: Partial<Record<WebpilotUnit, { sell: bigint; upstream?: bigint }>>,
  effectiveAt = new Date(Date.now() - 60_000),
): Promise<void> {
  const [sheet] = await db
    .insert(webpilotPriceSheets)
    .values({ effectiveAt })
    .returning();
  if (!sheet) throw new Error("feuille");
  for (const [unit, p] of Object.entries(prices))
    await db.insert(webpilotPriceItems).values({
      sheetId: sheet.id,
      unit: unit as WebpilotUnit,
      sellCadMicro: p.sell,
      upstreamUsdMicro: p.upstream ?? 0n,
    });
  await db
    .update(webpilotPriceSheets)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(webpilotPriceSheets.id, sheet.id));
}

export function post(
  path: string,
  key: string | null,
  body: unknown,
  method = "POST",
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Faux service de navigateur : enregistre les appels, simule des pages, peut échouer à la demande. */
export interface FakeBrowser {
  service: BrowserService;
  opened: Array<{
    id: string;
    maxSeconds: number;
    idleSeconds: number;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
  }>;
  runs: Array<{
    id: string;
    actions: readonly ServiceAction[];
    approveHosts: readonly string[];
  }>;
  closes: Array<{ id: string; reason: CloseReason }>;
  /** Pages simulées par adresse : HTML rendu. */
  pages: Record<string, string>;
  /** Erreur à lever à la prochaine opération de ce type. */
  fail: {
    open?: BrowserServiceError;
    run?: BrowserServiceError;
    close?: BrowserServiceError;
  };
}

export function fakeBrowser(): FakeBrowser {
  const urls = new Map<string, string | null>();
  const f: FakeBrowser = {
    opened: [],
    runs: [],
    closes: [],
    pages: {},
    fail: {},
    service: {
      async open(input) {
        if (f.fail.open) throw f.fail.open;
        f.opened.push(input);
        urls.set(input.id, null);
        return {
          id: input.id,
          status: "open",
          closeReason: null,
          expiresAt: new Date(Date.now() + input.maxSeconds * 1000),
          url: null,
        };
      },
      async run(id, actions, options) {
        if (f.fail.run) throw f.fail.run;
        f.runs.push({ id, actions, approveHosts: options.approveHosts });
        const results: ServiceActionResult[] = [];
        let ok = true;
        for (const a of actions) {
          if (a.type === "goto") {
            urls.set(id, a.url);
            results.push({ type: "goto", ok: true, url: a.url, status: 200 });
          } else if (
            a.type === "click" &&
            "selector" in a &&
            a.selector === "#absent"
          ) {
            results.push({
              type: "click",
              ok: false,
              error: { code: "element_unavailable", message: "Introuvable." },
            });
            ok = false;
            break;
          } else if (a.type === "read") {
            const url = urls.get(id) ?? "about:blank";
            results.push({
              type: "read",
              ok: true,
              url,
              title: "Titre de la page",
              html:
                f.pages[url] ??
                "<html><head><title>Titre de la page</title></head><body><main><h1>Bonjour</h1><p>Contenu.</p><script>alert(1)</script></main></body></html>",
              truncated: false,
            });
          } else if (a.type === "screenshot") {
            results.push({
              type: "screenshot",
              ok: true,
              mime: "image/png",
              data_base64: "iVBORw0KGgo=",
            });
          } else results.push({ type: a.type, ok: true });
        }
        return {
          id,
          status: "open",
          closeReason: null,
          expiresAt: new Date(Date.now() + 60_000),
          url: urls.get(id) ?? null,
          title: "Titre de la page",
          results,
          completed: ok && results.length === actions.length,
        };
      },
      async get(id) {
        return {
          id,
          status: "open",
          closeReason: null,
          expiresAt: new Date(Date.now() + 60_000),
          url: urls.get(id) ?? null,
        };
      },
      async close(id, reason) {
        if (f.fail.close) throw f.fail.close;
        f.closes.push({ id, reason });
        return {
          id,
          status: "closed",
          closeReason: reason,
          expiresAt: new Date(),
          url: null,
        };
      },
    },
  };
  return f;
}
