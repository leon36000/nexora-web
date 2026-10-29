import { eq, getAccount, usageEvents, webpilotSessions } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { BrowserServiceError } from "@nexora/webpilot";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PRESS_KEYS as SERVICE_KEYS } from "../../../../services/webpilot-browser/src/actions.ts";
import type { OutboundIntent, PrivacyRouter } from "../privacy/types";
import { PrivacyRouterUnavailableError } from "../privacy/types";
import {
  handleSessionActions,
  handleSessionCreate,
  handleSessionDelete,
  handleSessionGet,
} from "./handlers";
import { PRESS_KEYS } from "./schemas";
import {
  fakeBrowser,
  fakeSite,
  makeDeps,
  post,
  publishPrices,
  seedClient,
} from "./test-support";
import type { WebpilotDeps } from "./types";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  await publishPrices(t.db, {
    browser_minute: { sell: 2000n, upstream: 100n },
    page_static: { sell: 1000n },
  });
});
afterAll(async () => {
  await t.drop();
});

const M = 1_000_000n;
// biome-ignore lint/suspicious/noExplicitAny: corps JSON de réponse, forme libre dans les essais
const bodyOf = async (r: Response) => (await r.json()) as Record<string, any>;
const T0 = Date.parse("2026-11-02T14:00:00.000Z");

function setup(over: Partial<WebpilotDeps> = {}) {
  const browser = fakeBrowser();
  const clock = { now: T0 };
  const deps = makeDeps(t.db, fakeSite(), {
    browser: browser.service,
    now: () => new Date(clock.now),
    ...over,
  });
  return { browser, clock, deps };
}

const create = (deps: WebpilotDeps, key: string | null, body: unknown) =>
  handleSessionCreate(post("/v1/webpilot/sessions", key, body), deps);
const act = (deps: WebpilotDeps, key: string, id: string, actions: unknown[]) =>
  handleSessionActions(
    post(`/v1/webpilot/sessions/${id}/actions`, key, { actions }),
    id,
    deps,
  );
const get = (deps: WebpilotDeps, key: string, id: string) =>
  handleSessionGet(
    post(`/v1/webpilot/sessions/${id}`, key, undefined, "GET"),
    id,
    deps,
  );
const del = (deps: WebpilotDeps, key: string, id: string) =>
  handleSessionDelete(
    post(`/v1/webpilot/sessions/${id}`, key, undefined, "DELETE"),
    id,
    deps,
  );
const rowOf = async (publicId: string) => {
  const hex = publicId.slice(4);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const [r] = await t.db
    .select()
    .from(webpilotSessions)
    .where(eq(webpilotSessions.id, uuid));
  if (!r) throw new Error("session absente");
  return r;
};
const eventsOf = (org: string) =>
  t.db.select().from(usageEvents).where(eq(usageEvents.organizationId, org));

async function opened(
  deps: WebpilotDeps,
  over: { balance?: bigint; house?: boolean; body?: object } = {},
) {
  const c = await seedClient(t.db, {
    balance: over.balance ?? 10n * M,
    ...(over.house ? { house: true } : {}),
  });
  const res = await create(deps, c.key, { max_minutes: 5, ...over.body });
  if (res.status !== 201) throw new Error(`ouverture ${res.status}`);
  const body = await bodyOf(res);
  return { ...c, id: body.id as string, body };
}

/** Routeur de politique d'essai : enregistre les sorties et refuse ou masque selon des règles simples. */
function policy(rules: {
  denyHosts?: string[];
  maskType?: boolean;
  failHost?: string;
}) {
  const seen: OutboundIntent[] = [];
  const router: PrivacyRouter = {
    evaluate: async (intent) => {
      seen.push(intent);
      const host =
        "host" in intent.destination ? intent.destination.host : null;
      if (rules.failHost && host === rules.failHost)
        throw new PrivacyRouterUnavailableError("panne d'essai");
      if (host && rules.denyHosts?.includes(host))
        return {
          decision: "deny",
          policyVersion: "pol-7",
          ruleId: "host.blocked",
          reason: "host_blocked",
        };
      if (rules.maskType && intent.operation === "session.type")
        return {
          decision: "mask",
          policyVersion: "pol-7",
          content: "[COURRIEL]",
          ruleIds: ["mask.email"],
        };
      return { decision: "allow", policyVersion: "pol-7" };
    },
  };
  return { router, seen };
}

describe("accès", () => {
  it("401 sans clé, 403 sans la permission « sessions », 503 sans service de navigateur", async () => {
    const { deps } = setup();
    expect((await create(deps, null, { max_minutes: 5 })).status).toBe(401);
    const scrapeOnly = await seedClient(t.db, { operations: ["scrape"] });
    const denied = await create(deps, scrapeOnly.key, { max_minutes: 5 });
    expect(denied.status).toBe(403);
    expect((await bodyOf(denied)).error.code).toBe("operation_not_allowed");
    const c = await seedClient(t.db, { balance: 10n * M });
    const none = await create(setup({ browser: null }).deps, c.key, {
      max_minutes: 5,
    });
    expect(none.status).toBe(503);
    expect((await bodyOf(none)).error.code).toBe("webpilot_unavailable");
    expect((await get(deps, scrapeOnly.key, "ses_0")).status).toBe(403);
    expect((await del(deps, scrapeOnly.key, "ses_0")).status).toBe(403);
    expect((await act(deps, scrapeOnly.key, "ses_0", [])).status).toBe(403);
  });
});

describe("ouverture", () => {
  it("201 : réserve la première minute, ouvre le navigateur avec les bornes, rien n'est encore facturé", async () => {
    const { deps, browser } = setup();
    const c = await seedClient(t.db, { balance: 10n * M });
    const res = await create(deps, c.key, {
      max_minutes: 5,
      idle_timeout_s: 45,
      viewport: { width: 800, height: 600 },
      locale: "en-CA",
      timezone: "America/Toronto",
    });
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body).toMatchObject({
      status: "open",
      max_minutes: 5,
      idle_timeout_s: 45,
      expires_at: new Date(T0 + 5 * 60_000).toISOString(),
    });
    expect(body.id).toMatch(/^ses_[0-9a-f]{32}$/);
    expect(res.headers.get("x-nexora-cost-micro")).toBe("0");
    expect(browser.opened).toEqual([
      {
        id: body.id,
        maxSeconds: 300,
        idleSeconds: 45,
        viewport: { width: 800, height: 600 },
        locale: "en-CA",
        timezone: "America/Toronto",
      },
    ]);
    const acct = await getAccount(t.db, c.org);
    expect(acct.heldMicro).toBe(2000n);
    expect(acct.balanceMicro).toBe(10n * M);
  });

  it("max_minutes est requis et borné ; les autres champs aussi (400 avec param)", async () => {
    const { deps } = setup();
    const c = await seedClient(t.db, { balance: 10n * M });
    const ask = async (body: unknown) => {
      const r = await create(deps, c.key, body);
      return [r.status, (await bodyOf(r)).error?.param] as const;
    };
    expect(await ask({})).toEqual([400, "max_minutes"]);
    expect(await ask({ max_minutes: 0 })).toEqual([400, "max_minutes"]);
    expect(await ask({ max_minutes: 31 })).toEqual([400, "max_minutes"]);
    expect(await ask({ max_minutes: 5, idle_timeout_s: 601 })).toEqual([
      400,
      "idle_timeout_s",
    ]);
    expect(
      await ask({ max_minutes: 5, viewport: { width: 5000, height: 800 } }),
    ).toEqual([400, "viewport"]);
    expect(await ask({ max_minutes: 5, timezone: "Mars/Olympus" })).toEqual([
      400,
      "timezone",
    ]);
    expect(await ask({ max_minutes: 5, evaluate: "1+1" })).toEqual([
      400,
      "evaluate",
    ]);
    expect(await ask({ max_minutes: 5, start_url: 5 })).toEqual([
      400,
      "start_url",
    ]);
  });

  it("402 sans solde (mêmes corps que la passerelle) ; aucun navigateur lancé", async () => {
    const { deps, browser } = setup();
    const c = await seedClient(t.db, { balance: 1000n });
    const res = await create(deps, c.key, { max_minutes: 5 });
    expect(res.status).toBe(402);
    expect((await bodyOf(res)).error).toMatchObject({
      code: "insufficient_quota",
      type: "insufficient_quota",
    });
    expect(browser.opened).toEqual([]);
  });

  it("503 « tarifs non publiés » pour une organisation cliente sans prix de la minute ; la maison passe", async () => {
    const own = await createTestDatabase();
    try {
      const browser = fakeBrowser();
      const deps = makeDeps(own.db, fakeSite(), { browser: browser.service });
      const client = await seedClient(own.db, { balance: 10n * M });
      const res = await create(deps, client.key, { max_minutes: 5 });
      expect(res.status).toBe(503);
      expect((await bodyOf(res)).error.message).toContain("tarifs non publiés");
      const house = await seedClient(own.db, { house: true });
      expect((await create(deps, house.key, { max_minutes: 5 })).status).toBe(
        201,
      );
    } finally {
      await own.drop();
    }
  });

  it("429 au-delà du plafond de sessions ouvertes de l'organisation", async () => {
    const { deps } = setup();
    const c = await seedClient(t.db, { balance: 10n * M });
    expect((await create(deps, c.key, { max_minutes: 5 })).status).toBe(201);
    expect((await create(deps, c.key, { max_minutes: 5 })).status).toBe(201);
    const third = await create(deps, c.key, { max_minutes: 5 });
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBeTruthy();
  });

  it("si le navigateur ne démarre pas : 503, rien n'est facturé, la réservation est libérée", async () => {
    const { deps, browser } = setup();
    browser.fail.open = new BrowserServiceError("unavailable");
    const c = await seedClient(t.db, { balance: 10n * M });
    const res = await create(deps, c.key, { max_minutes: 5 });
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).error.message).toContain("Rien n'est facturé");
    const acct = await getAccount(t.db, c.org);
    expect(acct.heldMicro).toBe(0n);
    expect(acct.balanceMicro).toBe(10n * M);
    const [ev] = await eventsOf(c.org);
    expect(ev).toMatchObject({
      status: "error",
      unitsBrowserMinute: 0,
      costMicro: 0n,
    });
  });

  it("start_url : adresse vérifiée (SSRF) et évaluée AVANT toute réservation", async () => {
    const { deps, browser } = setup();
    const c = await seedClient(t.db, { balance: 10n * M });
    const ssrf = await create(deps, c.key, {
      max_minutes: 5,
      start_url: "http://127.0.0.1/admin",
    });
    expect(ssrf.status).toBe(400);
    expect((await bodyOf(ssrf)).error.code).toBe("url_not_allowed");

    const { router, seen } = policy({ denyHosts: ["interdit.test"] });
    const denied = await create(setup({ privacy: router }).deps, c.key, {
      max_minutes: 5,
      start_url: "https://interdit.test/page",
    });
    expect(denied.status).toBe(403);
    expect((await bodyOf(denied)).error.code).toBe("privacy_policy_denied");
    expect(seen[0]).toMatchObject({
      product: "webpilot",
      operation: "session.goto",
      destination: { host: "interdit.test" },
      kinds: ["url"],
    });
    expect((await getAccount(t.db, c.org)).heldMicro).toBeFalsy();
    expect(browser.opened).toEqual([]);
  });

  it("start_url permise : ouvre, navigue (hôte approuvé) et rend le résultat", async () => {
    const { deps, browser } = setup();
    const c = await seedClient(t.db, { balance: 10n * M });
    const res = await create(deps, c.key, {
      max_minutes: 5,
      start_url: "https://exemple.test/accueil",
    });
    expect(res.status).toBe(201);
    const body = await bodyOf(res);
    expect(body.url).toBe("https://exemple.test/accueil");
    expect(body.results).toEqual([
      {
        type: "goto",
        ok: true,
        url: "https://exemple.test/accueil",
        status: 200,
      },
    ]);
    expect(browser.runs[0]).toMatchObject({
      approveHosts: ["exemple.test"],
    });
    expect((await rowOf(body.id)).currentHost).toBe("exemple.test");
  });
});

describe("actions : validation, adresses, politique de confidentialité", () => {
  it("404 pour une session inconnue ou d'une autre organisation", async () => {
    const { deps } = setup();
    const a = await opened(deps);
    const other = await seedClient(t.db, { balance: 10n * M });
    expect((await act(deps, other.key, a.id, [{ type: "read" }])).status).toBe(
      404,
    );
    expect((await get(deps, other.key, a.id)).status).toBe(404);
    expect((await del(deps, other.key, a.id)).status).toBe(404);
    expect((await act(deps, a.key, "ses_zzz", [{ type: "read" }])).status).toBe(
      404,
    );
    expect((await row(a.id)).status).toBe("open");
  });

  async function row(id: string) {
    return rowOf(id);
  }

  it("liste fermée : un type inconnu (dont evaluate), un champ en trop ou un lot vide est refusé, rien n'est exécuté", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    const refused = async (actions: unknown[]) => {
      const r = await act(deps, a.key, a.id, actions);
      return [r.status, (await bodyOf(r)).error?.param] as const;
    };
    expect(
      await refused([{ type: "read" }, { type: "evaluate", script: "1" }]),
    ).toEqual([400, "actions[1]"]);
    expect(await refused([{ type: "download" }])).toEqual([400, "actions[0]"]);
    expect(await refused([{ type: "read", extra: 1 }])).toEqual([
      400,
      "actions[0]",
    ]);
    expect(await refused([{ type: "click" }])).toEqual([400, "actions[0]"]);
    expect(await refused([{ type: "press", key: "a" }])).toEqual([
      400,
      "actions[0]",
    ]);
    expect(await refused([{ type: "press", key: "Control+V" }])).toEqual([
      400,
      "actions[0]",
    ]);
    expect(await refused([])).toEqual([400, "actions"]);
    expect(
      await refused(Array.from({ length: 21 }, () => ({ type: "read" }))),
    ).toEqual([400, "actions"]);
    expect(browser.runs).toEqual([]);
  });

  it("les touches permises sont celles du service", () => {
    expect([...PRESS_KEYS]).toEqual([...SERVICE_KEYS]);
  });

  it("une adresse interdite (réseau privé, schéma) refuse tout le lot avant exécution", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    for (const url of [
      "http://127.0.0.1/",
      "http://10.0.0.5/x",
      "file:///etc/passwd",
    ]) {
      const r = await act(deps, a.key, a.id, [
        { type: "goto", url: "https://exemple.test/" },
        { type: "goto", url },
      ]);
      expect(r.status, url).toBe(400);
      expect((await bodyOf(r)).error.code).toBe("url_not_allowed");
    }
    expect(browser.runs).toEqual([]);
  });

  it("chaque goto passe par Privacy Router AVANT l'exécution : un refus arrête tout le lot (403)", async () => {
    const { router, seen } = policy({ denyHosts: ["interdit.test"] });
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps);
    seen.length = 0;
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
      { type: "read" },
      { type: "goto", url: "https://interdit.test/secret?jeton=abc" },
    ]);
    expect(res.status).toBe(403);
    const err = (await bodyOf(res)).error;
    expect(err).toMatchObject({ code: "privacy_policy_denied" });
    expect(err.message).toContain("host.blocked");
    expect(err.message).not.toContain("jeton");
    expect(browser.runs).toEqual([]);
    expect(
      seen.map((i) => [
        i.operation,
        "host" in i.destination && i.destination.host,
      ]),
    ).toEqual([
      ["session.goto", "exemple.test"],
      ["session.goto", "interdit.test"],
    ]);
  });

  it("panne de la couche : 503 privacy_router_unavailable, rien n'est exécuté", async () => {
    const { router } = policy({ failHost: "panne.test" });
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://panne.test/" },
    ]);
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).error.code).toBe("privacy_router_unavailable");
    expect(browser.runs).toEqual([]);
  });

  it("chaque type est évalué avec le texte et l'hôte de la page (celui d'un goto précédent du même lot)", async () => {
    const { router, seen } = policy({});
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps);
    seen.length = 0;
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://formulaire.test/contact" },
      { type: "type", selector: "#nom", text: "Marie Tremblay" },
      { type: "select", selector: "#pays", value: "ca" },
    ]);
    expect(res.status).toBe(200);
    expect(seen.map((i) => i.operation)).toEqual([
      "session.goto",
      "session.type",
      "session.type",
    ]);
    expect(seen[1]).toMatchObject({
      destination: { host: "formulaire.test" },
      kinds: ["form_input"],
      content: "Marie Tremblay",
    });
    const sent = browser.runs[0]?.actions ?? [];
    expect(sent[1]).toMatchObject({
      type: "type",
      text: "Marie Tremblay",
      expected_host: "formulaire.test",
    });
    expect(sent[2]).toMatchObject({
      type: "select",
      expected_host: "formulaire.test",
    });
  });

  it("un type refusé par la politique (403) n'exécute rien, même les actions précédentes du lot", async () => {
    const { router } = policy({ denyHosts: ["banque.test"] });
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps, {
      body: { start_url: "https://exemple.test/" },
    });
    // La session est sur exemple.test ; un goto vers banque.test est refusé, et le type qui suit n'a pas lieu.
    browser.runs.length = 0;
    const res = await act(deps, a.key, a.id, [
      { type: "click", selector: "a" },
      { type: "goto", url: "https://banque.test/" },
      { type: "type", selector: "#n", text: "x" },
    ]);
    expect(res.status).toBe(403);
    expect(browser.runs).toEqual([]);
  });

  it("une saisie masquée par la politique est celle qui sort ; l'en-tête le dit", async () => {
    const { router } = policy({ maskType: true });
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps, {
      body: { start_url: "https://exemple.test/" },
    });
    browser.runs.length = 0;
    const res = await act(deps, a.key, a.id, [
      { type: "type", selector: "#courriel", text: "marie@exemple.ca" },
    ]);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-nexora-privacy-decision")).toBe("mask");
    expect(browser.runs[0]?.actions[0]).toMatchObject({ text: "[COURRIEL]" });
    expect(JSON.stringify(browser.runs)).not.toContain("marie@exemple.ca");
  });

  it("type sans page ouverte : 400 (rien n'est évalué ni exécuté)", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "type", selector: "#q", text: "bonjour" },
    ]);
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).error.param).toBe("actions[0]");
    expect(browser.runs).toEqual([]);
  });

  it("si la politique interdit désormais l'hôte de la page, la session se ferme (privacy_policy) et le navigateur est détruit", async () => {
    let denied = false;
    const router: PrivacyRouter = {
      evaluate: async (intent) =>
        denied &&
        "host" in intent.destination &&
        intent.destination.host === "exemple.test"
          ? {
              decision: "deny",
              policyVersion: "pol-8",
              ruleId: "host.blocked",
              reason: "host_blocked",
            }
          : { decision: "allow", policyVersion: "pol-7" },
    };
    const { deps, browser } = setup({ privacy: router });
    const a = await opened(deps, {
      body: { start_url: "https://exemple.test/" },
    });
    denied = true;
    const res = await act(deps, a.key, a.id, [
      { type: "click", selector: "a" },
    ]);
    expect(res.status).toBe(403);
    const r = await rowOf(a.id);
    expect(r).toMatchObject({
      status: "closed",
      closeReason: "privacy_policy",
    });
    expect(browser.closes).toEqual([{ id: a.id, reason: "privacy_policy" }]);
    // Un lot qui commence par goto peut quitter ce site.
    const b = await opened(setup({ privacy: router }).deps, {
      body: { start_url: "https://autre.test/" },
    });
    expect(b.id).toBeTruthy();
  });
});

describe("actions : exécution et résultats", () => {
  it("exécute le lot, convertit read en markdown nettoyé, renvoie la capture et l'état", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
      { type: "click", selector: "#ok" },
      { type: "read", formats: ["markdown", "html", "links"] },
      { type: "screenshot" },
    ]);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toMatchObject({
      id: a.id,
      status: "open",
      url: "https://exemple.test/",
      completed: true,
    });
    expect(
      body.results.map((r: { type: string; ok: boolean }) => [r.type, r.ok]),
    ).toEqual([
      ["goto", true],
      ["click", true],
      ["read", true],
      ["screenshot", true],
    ]);
    const read = body.results[2];
    expect(read.content.markdown).toContain("Bonjour");
    expect(read.content.html).not.toContain("<script");
    expect(read.content.html).not.toContain("alert(1)");
    expect(read.metadata.title).toBe("Titre de la page");
    expect(body.results[3]).toMatchObject({
      mime: "image/png",
      data_base64: "iVBORw0KGgo=",
    });
    expect(res.headers.get("x-nexora-webpilot-units")).toBe("0");
    expect(browser.runs[0]?.approveHosts).toEqual(["exemple.test"]);
    expect((await rowOf(a.id)).currentHost).toBe("exemple.test");
  });

  it("le premier échec arrête la liste ; le lot n'est pas « completed »", async () => {
    const { deps } = setup();
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
      { type: "click", selector: "#absent" },
      { type: "read" },
    ]);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.completed).toBe(false);
    expect(body.results).toHaveLength(2);
    expect(body.results[1]).toMatchObject({
      type: "click",
      ok: false,
      error: { code: "element_unavailable" },
    });
  });

  it("record « screenshot » : une capture de la dernière étape est renvoyée, jamais conservée", async () => {
    const { deps } = setup();
    const a = await opened(deps, { body: { record: "screenshot" } });
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
    ]);
    const body = await bodyOf(res);
    expect(body.screenshot).toMatchObject({ mime: "image/png" });
    expect(body.results).toHaveLength(1);
    const events = await eventsOf(a.org);
    expect(
      JSON.stringify(events, (_k, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
    ).not.toContain("iVBOR");
  });

  it("extract : le texte de la page passe par Privacy Router puis par le modèle ; le coût du modèle est dans l'en-tête", async () => {
    const calls: Array<{ system: string; user: string }> = [];
    const { router, seen } = policy({});
    const { deps } = setup({
      privacy: router,
      chat: async (request) => {
        const body = (await request.json()) as {
          messages: Array<{ role: string; content: string }>;
        };
        calls.push({
          system: body.messages[0]?.content ?? "",
          user: body.messages[1]?.content ?? "",
        });
        return Response.json(
          {
            choices: [{ message: { content: '{"titre":"Bonjour"}' } }],
            usage: { prompt_tokens: 40, completion_tokens: 5 },
          },
          { headers: { "x-nexora-cost-micro": "321" } },
        );
      },
    });
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
      {
        type: "extract",
        schema: {
          type: "object",
          properties: { titre: { type: "string" } },
          required: ["titre"],
        },
      },
    ]);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body.results[1]).toMatchObject({
      type: "extract",
      ok: true,
      valid: true,
      data: { titre: "Bonjour" },
    });
    expect(res.headers.get("x-nexora-cost-micro")).toBe("321");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).not.toContain("Contenu.");
    expect(calls[0]?.user).toContain("<donnees_page");
    expect(calls[0]?.user).toContain("Contenu.");
    expect(
      seen.some(
        (i) =>
          i.operation === "extract" &&
          "model" in i.destination &&
          i.kinds.includes("page_content"),
      ),
    ).toBe(true);
  });

  it("extract sans modèle : l'action échoue proprement, la session continue", async () => {
    const base = makeDeps(t.db, fakeSite()).config;
    const { deps } = setup({ config: { ...base, extractModel: null } });
    const a = await opened(deps);
    const res = await act(deps, a.key, a.id, [
      { type: "goto", url: "https://exemple.test/" },
      { type: "extract", prompt: "le titre" },
    ]);
    const body = await bodyOf(res);
    expect(res.status).toBe(200);
    expect(body.results[1]).toMatchObject({
      ok: false,
      error: { code: "model_required" },
    });
  });
});

describe("actions : état du service et facturation avancée", () => {
  it("le service ne connaît plus la session : elle est fermée (browser_error), 409, sans frais de plus d'une minute", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    browser.fail.run = new BrowserServiceError("not_found");
    const res = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.code).toBe("session_closed");
    expect(await rowOf(a.id)).toMatchObject({
      status: "closed",
      closeReason: "browser_error",
      minutesSettled: 1,
    });
  });

  it("le service a fermé la session (inactivité) : même motif côté site", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    browser.fail.run = new BrowserServiceError("session_closed", "idle");
    const res = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(res.status).toBe(409);
    expect((await rowOf(a.id)).closeReason).toBe("idle");
  });

  it("service injoignable : 503, la session reste ouverte ; lot déjà en cours : 409 session_busy", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    browser.fail.run = new BrowserServiceError("unavailable");
    expect((await act(deps, a.key, a.id, [{ type: "read" }])).status).toBe(503);
    browser.fail.run = new BrowserServiceError("busy");
    const busy = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(busy.status).toBe(409);
    expect((await bodyOf(busy)).error.code).toBe("session_busy");
    expect((await rowOf(a.id)).status).toBe("open");
  });

  it("règle les minutes échues avant d'agir ; solde épuisé : 409 session_closed (insufficient_quota) et navigateur détruit", async () => {
    const { deps, browser, clock } = setup();
    const a = await opened(deps, { balance: 4000n });
    clock.now = T0 + 2 * 60_000 + 5_000;
    // Inactivité de 120 s par défaut : on garde la session active en la touchant à 1 min 50.
    await t.db
      .update(webpilotSessions)
      .set({ lastActivityAt: new Date(T0 + 115_000) })
      .where(eq(webpilotSessions.id, (await rowOf(a.id)).id));
    const res = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(res.status).toBe(409);
    expect(await rowOf(a.id)).toMatchObject({
      status: "closed",
      closeReason: "insufficient_quota",
      minutesSettled: 2,
      costMicro: 4000n,
    });
    expect(browser.closes).toEqual([
      { id: a.id, reason: "insufficient_quota" },
    ]);
    expect(browser.runs).toEqual([]);
    const acct = await getAccount(t.db, a.org);
    expect(acct.balanceMicro).toBe(0n);
    expect(acct.heldMicro).toBe(0n);
  });

  it("session échue (max_minutes) : 409 et navigateur détruit ; l'inactivité aussi", async () => {
    const { deps, browser, clock } = setup();
    const a = await opened(deps, { body: { max_minutes: 1 } });
    clock.now = T0 + 61_000;
    const res = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.message).toContain("max_minutes");
    expect(browser.closes).toEqual([{ id: a.id, reason: "max_minutes" }]);
    const b = await opened(deps, { body: { idle_timeout_s: 30 } });
    clock.now = T0 + 61_000 + 50_000;
    expect((await act(deps, b.key, b.id, [{ type: "read" }])).status).toBe(409);
    expect((await rowOf(b.id)).closeReason).toBe("idle");
  });
});

describe("lecture et fermeture", () => {
  it("GET : état, minutes facturées, hôte courant (jamais l'adresse complète) ; avance la facturation", async () => {
    const { deps, clock } = setup();
    const a = await opened(deps, {
      body: { start_url: "https://exemple.test/a?secret=1" },
    });
    clock.now = T0 + 61_000;
    const res = await get(deps, a.key, a.id);
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toMatchObject({
      id: a.id,
      status: "open",
      close_reason: null,
      current_host: "exemple.test",
      max_minutes: 5,
      usage: { browser_minutes: 1, cost_micro: "2000" },
    });
    expect(JSON.stringify(body)).not.toContain("secret=1");
  });

  it("DELETE : ferme (closed_by_client), règle la minute entamée, détruit le navigateur ; rejouable", async () => {
    const { deps, browser, clock } = setup();
    const a = await opened(deps);
    clock.now = T0 + 90_000;
    const res = await del(deps, a.key, a.id);
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toMatchObject({
      status: "closed",
      close_reason: "closed_by_client",
      usage: { browser_minutes: 2, cost_micro: "4000" },
    });
    expect(res.headers.get("x-nexora-cost-micro")).toBe("4000");
    expect(browser.closes).toEqual([{ id: a.id, reason: "closed_by_client" }]);
    expect((await rowOf(a.id)).browserClosedAt).not.toBeNull();
    const again = await del(deps, a.key, a.id);
    expect(again.status).toBe(200);
    expect(browser.closes).toHaveLength(1);
    const acct = await getAccount(t.db, a.org);
    expect(acct.balanceMicro).toBe(10n * M - 4000n);
    expect(acct.heldMicro).toBe(0n);
    const events = await eventsOf(a.org);
    expect(
      events.filter((e) => e.endpoint === "webpilot.session"),
    ).toHaveLength(2);
  });

  it("une action sur une session fermée : 409 session_closed avec le motif", async () => {
    const { deps } = setup();
    const a = await opened(deps);
    await del(deps, a.key, a.id);
    const res = await act(deps, a.key, a.id, [{ type: "read" }]);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).error.message).toContain("closed_by_client");
  });

  it("si le service ne répond pas à la fermeture, la session est fermée et facturée quand même ; le worker détruira", async () => {
    const { deps, browser } = setup();
    const a = await opened(deps);
    browser.fail.close = new BrowserServiceError("unavailable");
    const res = await del(deps, a.key, a.id);
    expect(res.status).toBe(200);
    const r = await rowOf(a.id);
    expect(r.status).toBe("closed");
    expect(r.browserClosedAt).toBeNull();
  });

  it("l'organisation maison n'est jamais débitée", async () => {
    const { deps } = setup();
    const a = await opened(deps, { house: true });
    await del(deps, a.key, a.id);
    const events = (await eventsOf(a.org)).filter(
      (e) => e.endpoint === "webpilot.session",
    );
    expect(events[0]).toMatchObject({
      billed: false,
      costMicro: 0n,
      valueMicro: 2000n,
    });
  });
});
