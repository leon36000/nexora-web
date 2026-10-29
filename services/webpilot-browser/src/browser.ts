import type {
  Browser,
  BrowserContext,
  BrowserType,
  Locator,
  Page,
  Route,
} from "playwright-core";
import type { Action } from "./actions.ts";
import { checkUrlSyntax } from "./address.ts";
import type { ServiceConfig } from "./config.ts";
import type { EgressProxy } from "./proxy.ts";
import type {
  ActionResult,
  BrowserDriver,
  LaunchOptions,
  LivePage,
  RunOutput,
} from "./sessions.ts";

/**
 * Pilote Playwright/Chromium. Un navigateur par session (processus, profil temporaire et contexte neufs, détruits
 * à la fermeture) ; un seul onglet ; aucun cookie ni stockage partagé ; téléchargements, extensions, permissions,
 * service workers et fenêtres secondaires coupés ; aucun JavaScript de l'appelant.
 *
 * Réseau, trois barrages indépendants :
 *  1. le navigateur n'a QU'UN chemin, le mandataire de sortie local (`--proxy-server`, boucle locale comprise) ; il ne
 *     résout aucun nom lui-même (`--host-resolver-rules=MAP * ~NOTFOUND`) et WebRTC ne sort pas en UDP direct ;
 *  2. chaque requête est interceptée : schéma, port, adresse littérale (premier barrage, avant toute connexion) ;
 *  3. une navigation de premier niveau (page principale, redirections comprises) n'est permise que vers un hôte
 *     APPROUVÉ par le site (donc évalué par Privacy Router) ; sinon elle échoue en `navigation_blocked`.
 * Le mandataire résout et classe les adresses à la connexion (voir proxy.ts) : c'est le barrage décisif.
 */

export interface BrowserRuntime {
  driver: BrowserDriver;
  render(input: RenderInput): Promise<RenderOutput>;
  close(): Promise<void>;
}

export interface RenderInput {
  url: string;
  waitMs: number;
  /** Hôtes de premier niveau permis en plus de celui de l'adresse (redirections déjà évaluées par le site). */
  approveHosts: string[];
}
export interface RenderOutput {
  html: string;
  status: number;
  url: string;
}

export class RenderBlockedError extends Error {
  readonly host: string;
  readonly url: string;
  constructor(host: string, url: string) {
    super("navigation vers un hôte non approuvé");
    this.name = "RenderBlockedError";
    this.host = host;
    this.url = url;
  }
}
export class RenderFailedError extends Error {
  readonly code: "timeout" | "navigation_failed";
  constructor(code: "timeout" | "navigation_failed") {
    super(code);
    this.name = "RenderFailedError";
    this.code = code;
  }
}

const ARGS = [
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-breakpad",
  "--disable-features=DnsOverHttps,Translate,MediaRouter,OptimizationHints",
  "--no-first-run",
  "--no-default-browser-check",
  "--mute-audio",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  // Aucun nom n'est jamais résolu par le navigateur : le mandataire le fait, puis classe les adresses.
  "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
];

/** Touches du clavier : valeurs de Playwright pour la liste fermée de `press`. */
const SENSITIVE_AUTOCOMPLETE =
  /(^|\s)(cc-[a-z-]+|current-password|new-password|one-time-code)(\s|$)/i;
const SENSITIVE_NAME = /(card.?num|cvv|cvc|cc.?num|credit.?card|\biban\b)/i;

interface PageHandle {
  page: Page;
  /** Dernier hôte dont une navigation de premier niveau a été refusée (pour un message clair). */
  blocked(): { host: string; url: string } | null;
  resetBlocked(): void;
  approve(hosts: string[]): void;
  close(): Promise<void>;
  onCrash(cb: () => void): void;
}

const clip = (text: string, max = 300) =>
  text.replace(/\s+/g, " ").trim().slice(0, max);

export function createBrowserRuntime(deps: {
  config: ServiceConfig;
  chromium: BrowserType;
  proxyPort: number;
  proxy: EgressProxy;
}): BrowserRuntime {
  const { config, chromium } = deps;
  let renderers = 0;
  const waiting: Array<() => void> = [];

  async function newHandle(options: {
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
    approved: string[];
  }): Promise<PageHandle> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: config.chromiumSandbox,
        ...(config.executablePath
          ? { executablePath: config.executablePath }
          : {}),
        args: [
          ...ARGS,
          `--proxy-server=http://127.0.0.1:${deps.proxyPort}`,
          "--proxy-bypass-list=<-loopback>",
        ],
        timeout: 30_000,
      });
      const major = browser.version().split(".")[0] ?? "0";
      const context: BrowserContext = await browser.newContext({
        viewport: options.viewport ?? config.viewport,
        locale: options.locale ?? config.locale,
        timezoneId: options.timezone ?? config.timezone,
        acceptDownloads: false,
        serviceWorkers: "block",
        permissions: [],
        javaScriptEnabled: true,
        bypassCSP: false,
        ignoreHTTPSErrors: false,
        colorScheme: "light",
        userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 NexoraWebPilot/1.0${config.contact ? ` (+${config.contact})` : ""}`,
      });
      const approved = new Set(options.approved.map((h) => h.toLowerCase()));
      let blocked: { host: string; url: string } | null = null;
      const page = await context.newPage();
      page.setDefaultTimeout(config.actionTimeoutMs);
      page.setDefaultNavigationTimeout(config.navTimeoutMs);

      await context.route("**/*", (route: Route) => {
        const request = route.request();
        const url = request.url();
        if (url === "about:blank" || /^(data|blob):/i.test(url))
          return route.continue();
        const syntax = checkUrlSyntax(url, config.policy);
        if (!syntax.ok) return route.abort("blockedbyclient");
        const topLevel =
          request.isNavigationRequest() && request.frame() === page.mainFrame();
        if (topLevel) {
          const host = syntax.url.hostname.toLowerCase();
          if (!approved.has(host)) {
            blocked = { host, url: syntax.url.toString() };
            return route.abort("blockedbyclient");
          }
        }
        return route.continue();
      });

      // Les redirections de la page principale ne passent PAS par `route` (Playwright les suit seul) : on les intercepte au
      // niveau CDP, à l'étape de la RÉPONSE, avant que la requête vers l'hôte suivant parte.
      const cdp = await context.newCDPSession(page);
      const frameTree = (await cdp.send("Page.getFrameTree")) as {
        frameTree: { frame: { id: string } };
      };
      const mainFrameId = frameTree.frameTree.frame.id;
      await cdp.send("Fetch.enable", {
        patterns: [
          {
            urlPattern: "*",
            resourceType: "Document",
            requestStage: "Response",
          },
        ],
      });
      cdp.on("Fetch.requestPaused", (event) => {
        const e = event as {
          requestId: string;
          frameId: string;
          responseStatusCode?: number;
          responseHeaders?: Array<{ name: string; value: string }>;
          request: { url: string };
        };
        const status = e.responseStatusCode ?? 0;
        let verdict: "continue" | "block" = "continue";
        if (e.frameId === mainFrameId && status >= 300 && status < 400) {
          const location = e.responseHeaders?.find(
            (h) => h.name.toLowerCase() === "location",
          )?.value;
          if (location) {
            let target: URL | null = null;
            try {
              target = new URL(location, e.request.url);
            } catch {
              target = null;
            }
            const syntax = target
              ? checkUrlSyntax(target.toString(), config.policy)
              : null;
            if (!syntax?.ok) verdict = "block";
            else if (!approved.has(syntax.url.hostname.toLowerCase())) {
              blocked = {
                host: syntax.url.hostname.toLowerCase(),
                url: syntax.url.toString(),
              };
              verdict = "block";
            }
          }
        }
        const done =
          verdict === "block"
            ? cdp.send("Fetch.failRequest", {
                requestId: e.requestId,
                errorReason: "BlockedByClient",
              })
            : cdp.send("Fetch.continueResponse", { requestId: e.requestId });
        void done.catch(() => undefined);
      });

      // Un seul onglet : toute fenêtre secondaire est fermée tout de suite. Ni téléchargement, ni boîte de dialogue.
      context.on("page", (extra) => {
        if (extra !== page) void extra.close().catch(() => undefined);
      });
      page.on("download", (download) => {
        void download.cancel().catch(() => undefined);
      });
      page.on("dialog", (dialog) => {
        void dialog.dismiss().catch(() => undefined);
      });

      const toClose = browser;
      return {
        page,
        blocked: () => blocked,
        resetBlocked: () => {
          blocked = null;
        },
        approve: (hosts) => {
          for (const h of hosts) approved.add(h.toLowerCase());
        },
        close: async () => {
          await toClose.close().catch(() => undefined);
        },
        onCrash: (cb) => {
          toClose.on("disconnected", cb);
        },
      };
    } catch (error) {
      await browser?.close().catch(() => undefined);
      throw error;
    }
  }

  function errorOf(
    error: unknown,
    handle: PageHandle,
  ): { code: string; message: string } {
    const message = error instanceof Error ? error.message : String(error);
    const blocked = handle.blocked();
    if (/ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED/.test(message) && blocked)
      return {
        code: "navigation_blocked",
        message: `La navigation vers ${blocked.host} n'est pas approuvée : utilisez une action « goto » vers cet hôte.`,
      };
    if (/ERR_BLOCKED_BY_CLIENT/.test(message))
      return {
        code: "url_not_allowed",
        message: "Adresse refusée par la politique de sortie.",
      };
    if (error instanceof Error && error.name === "TimeoutError")
      return { code: "timeout", message: "Délai dépassé." };
    if (
      /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TUNNEL|ERR_PROXY|ERR_CERT|ERR_SSL|ERR_TIMED_OUT|ERR_ADDRESS/.test(
        message,
      )
    )
      return {
        code: "target_unreachable",
        message: "La cible n'a pas répondu ou son certificat est invalide.",
      };
    if (error instanceof ActionError)
      return { code: error.code, message: error.message };
    if (
      /strict mode violation|waiting for locator|not visible|not enabled|Element is|intercepts pointer/i.test(
        message,
      )
    )
      return {
        code: "element_unavailable",
        message: clip(message.split("\n")[0] ?? "", 200),
      };
    if (
      /Target (page, context or browser has been )?closed|Browser has been closed|has been disconnected/i.test(
        message,
      )
    )
      return { code: "browser_error", message: "Le navigateur s'est arrêté." };
    return {
      code: "action_failed",
      message: clip(message.split("\n")[0] ?? ""),
    };
  }

  class ActionError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "ActionError";
      this.code = code;
    }
  }

  function hostOfPage(page: Page): string | null {
    try {
      return new URL(page.url()).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  async function guardField(
    locator: Locator,
    page: Page,
    expectedHost?: string,
  ) {
    if (expectedHost && hostOfPage(page) !== expectedHost.toLowerCase())
      throw new ActionError(
        "host_changed",
        "La page n'est plus celle que la politique de confidentialité a évaluée.",
      );
    // Code propre au service, exécuté dans la page : il ne lit que des attributs du champ visé.
    const info = await locator.evaluate((el) => ({
      type: ((el as unknown as { type?: string }).type ?? "").toLowerCase(),
      autocomplete: el.getAttribute("autocomplete") ?? "",
      name: `${el.getAttribute("name") ?? ""} ${el.id ?? ""}`,
    }));
    if (
      info.type === "password" ||
      SENSITIVE_AUTOCOMPLETE.test(info.autocomplete) ||
      SENSITIVE_NAME.test(info.name)
    )
      throw new ActionError(
        "sensitive_field_refused",
        "WebPilot ne saisit ni mot de passe, ni identifiant secret, ni moyen de paiement à la place d'une personne.",
      );
  }

  async function settle(page: Page) {
    await page
      .waitForLoadState("domcontentloaded", { timeout: 3_000 })
      .catch(() => undefined);
  }

  /**
   * Une navigation de premier niveau refusée remplace la page par une page d'erreur, validée un instant plus tard :
   * on revient à une page vide, état connu, avant l'action suivante (sinon elle serait « interrompue »).
   */
  async function settleAfterBlock(page: Page) {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await page.goto("about:blank", { waitUntil: "load", timeout: 5_000 });
        return;
      } catch {
        await page.waitForTimeout(150);
      }
    }
  }

  async function exec(
    action: Action,
    handle: PageHandle,
  ): Promise<ActionResult> {
    const { page } = handle;
    switch (action.type) {
      case "goto": {
        const response = await page.goto(action.url, {
          waitUntil: action.wait_until ?? "load",
        });
        if (response?.headers()["x-nexora-egress-refused"])
          throw new ActionError(
            "url_not_allowed",
            "Adresse refusée par la politique de sortie.",
          );
        return {
          type: "goto",
          ok: true,
          url: page.url(),
          status: response?.status() ?? null,
        };
      }
      case "click": {
        if ("selector" in action)
          await page.locator(action.selector).first().click();
        else if ("text" in action)
          await page.getByText(action.text).first().click();
        else await page.mouse.click(action.x, action.y);
        await settle(page);
        return { type: "click", ok: true, url: page.url() };
      }
      case "type": {
        const locator = page.locator(action.selector).first();
        await guardField(locator, page, action.expected_host);
        if (action.clear === false)
          await locator.pressSequentially(action.text);
        else await locator.fill(action.text);
        return { type: "type", ok: true };
      }
      case "press": {
        await page.keyboard.press(action.key);
        await settle(page);
        return { type: "press", ok: true, url: page.url() };
      }
      case "select": {
        const locator = page.locator(action.selector).first();
        await guardField(locator, page, action.expected_host);
        await locator.selectOption(action.value);
        return { type: "select", ok: true };
      }
      case "scroll": {
        const amount = action.amount ?? 500;
        const dx =
          action.direction === "left"
            ? -amount
            : action.direction === "right"
              ? amount
              : 0;
        const dy =
          action.direction === "up"
            ? -amount
            : action.direction === "down"
              ? amount
              : 0;
        await page.mouse.wheel(dx, dy);
        return { type: "scroll", ok: true };
      }
      case "wait": {
        if (action.for === "selector")
          await page
            .locator(action.selector)
            .first()
            .waitFor({ state: "visible" });
        else if (action.for === "idle")
          await page.waitForLoadState("networkidle");
        else await page.waitForTimeout(action.ms);
        return { type: "wait", ok: true };
      }
      case "read": {
        let html = await page.content();
        let truncated = false;
        if (Buffer.byteLength(html) > config.maxHtmlBytes) {
          html = Buffer.from(html)
            .subarray(0, config.maxHtmlBytes)
            .toString("utf8");
          truncated = true;
        }
        return {
          type: "read",
          ok: true,
          url: page.url(),
          title: await page.title(),
          html,
          truncated,
        };
      }
      case "screenshot": {
        const png = await page.screenshot({ type: "png", fullPage: false });
        if (png.length > config.maxScreenshotBytes)
          throw new ActionError(
            "too_large",
            "La capture est trop volumineuse.",
          );
        return {
          type: "screenshot",
          ok: true,
          mime: "image/png",
          data_base64: png.toString("base64"),
        };
      }
    }
  }

  const driver: BrowserDriver = {
    async launch(options: LaunchOptions): Promise<LivePage> {
      const handle = await newHandle({
        ...(options.viewport ? { viewport: options.viewport } : {}),
        ...(options.locale ? { locale: options.locale } : {}),
        ...(options.timezone ? { timezone: options.timezone } : {}),
        approved: [],
      });
      return {
        async run(actions, ctx): Promise<RunOutput> {
          handle.approve(ctx.approveHosts);
          const deadline = Date.now() + config.batchTimeoutMs;
          const results: ActionResult[] = [];
          for (const action of actions) {
            if (ctx.signal.aborted) throw new Error("session fermée");
            if (Date.now() >= deadline) {
              results.push({
                type: action.type,
                ok: false,
                error: { code: "timeout", message: "Délai du lot dépassé." },
              });
              break;
            }
            try {
              handle.resetBlocked();
              const result = await exec(action, handle);
              // Une navigation refusée pendant un clic ou une touche ne fait pas échouer l'action elle-même.
              const refused = handle.blocked();
              if (refused) {
                await settleAfterBlock(handle.page);
                throw new ActionError(
                  "navigation_blocked",
                  `La navigation vers ${refused.host} n'est pas approuvée : utilisez une action « goto » vers cet hôte.`,
                );
              }
              results.push(result);
            } catch (error) {
              if (ctx.signal.aborted) throw error;
              // Une navigation refusée laisse une page d'erreur qui se valide un instant plus tard : on l'attend,
              // sinon elle interromprait l'action suivante.
              if (handle.blocked()) await settleAfterBlock(handle.page);
              const e = errorOf(error, handle);
              if (e.code === "browser_error") throw error;
              results.push({ type: action.type, ok: false, error: e });
              break;
            }
          }
          let title: string | null = null;
          try {
            title = await handle.page.title();
          } catch {
            title = null;
          }
          return { results, url: handle.page.url() || null, title };
        },
        onCrash: (cb) => handle.onCrash(cb),
        close: () => handle.close(),
      };
    },
  };

  async function acquire() {
    if (renderers >= config.renderConcurrency)
      await new Promise<void>((resolve) => waiting.push(resolve));
    renderers += 1;
  }
  function release() {
    renderers -= 1;
    waiting.shift()?.();
  }

  async function render(input: RenderInput): Promise<RenderOutput> {
    const syntax = checkUrlSyntax(input.url, config.policy);
    if (!syntax.ok) throw new RenderFailedError("navigation_failed");
    await acquire();
    let handle: PageHandle | null = null;
    try {
      try {
        handle = await newHandle({
          approved: [syntax.url.hostname, ...input.approveHosts],
        });
      } catch {
        // Le navigateur n'a pas démarré (ressources, bac à sable) : un échec de rendu, pas une erreur interne.
        throw new RenderFailedError("navigation_failed");
      }
      let status = 0;
      try {
        const response = await handle.page.goto(syntax.url.toString(), {
          waitUntil: "load",
        });
        if (response?.headers()["x-nexora-egress-refused"])
          throw new RenderFailedError("navigation_failed");
        status = response?.status() ?? 0;
      } catch (error) {
        if (error instanceof RenderFailedError) throw error;
        const blocked = handle.blocked();
        if (blocked) throw new RenderBlockedError(blocked.host, blocked.url);
        const e = errorOf(error, handle);
        throw new RenderFailedError(
          e.code === "timeout" ? "timeout" : "navigation_failed",
        );
      }
      if (input.waitMs > 0) await handle.page.waitForTimeout(input.waitMs);
      let html = await handle.page.content();
      if (Buffer.byteLength(html) > config.maxHtmlBytes)
        html = Buffer.from(html)
          .subarray(0, config.maxHtmlBytes)
          .toString("utf8");
      return { html, status, url: handle.page.url() };
    } finally {
      await handle?.close();
      release();
    }
  }

  return {
    driver,
    render,
    close: () => deps.proxy.close(),
  };
}
