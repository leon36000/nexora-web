import { describe, expect, it } from "vitest";
import type { Action } from "./actions.ts";
import {
  type BrowserDriver,
  type LivePage,
  type RunOutput,
  SessionError,
  SessionManager,
} from "./sessions.ts";

/** Faux navigateur : enregistre ce qu'on lui demande, sans aucun vrai navigateur. */
function fakeDriver() {
  const launched: Array<{ id: string; closed: boolean; crash: () => void }> =
    [];
  const runs: Array<{ actions: Action[]; approveHosts: string[] }> = [];
  let failLaunch = false;
  let hang: Promise<void> | null = null;
  let throwOnRun: Error | null = null;
  const driver: BrowserDriver = {
    async launch(options) {
      if (failLaunch) throw new Error("lancement impossible");
      let crashHandler: (() => void) | null = null;
      const record = {
        id: options.id,
        closed: false,
        crash: () => crashHandler?.(),
      };
      launched.push(record);
      const page: LivePage = {
        async run(actions, ctx): Promise<RunOutput> {
          runs.push({ actions, approveHosts: ctx.approveHosts });
          if (throwOnRun) throw throwOnRun;
          if (hang) await hang;
          if (ctx.signal.aborted) throw new Error("annulé");
          return {
            results: actions.map((a) => ({ type: a.type, ok: true })),
            url: "https://exemple.org/",
            title: "Titre",
          };
        },
        onCrash(cb) {
          crashHandler = cb;
        },
        async close() {
          record.closed = true;
        },
      };
      return page;
    },
  };
  return {
    driver,
    launched,
    runs,
    failNextLaunch: () => {
      failLaunch = true;
    },
    holdRuns: (p: Promise<void>) => {
      hang = p;
    },
    failRuns: (e: Error) => {
      throwOnRun = e;
    },
  };
}

function setup(
  over: Partial<ConstructorParameters<typeof SessionManager>[0]> = {},
) {
  const f = fakeDriver();
  let t = 1_000_000;
  const manager = new SessionManager({
    driver: f.driver,
    now: () => t,
    maxSessions: 2,
    maxSeconds: 600,
    maxIdleSeconds: 300,
    tombstoneMs: 60_000,
    ...over,
  });
  return {
    f,
    manager,
    advance: (ms: number) => {
      t += ms;
    },
    clock: () => t,
  };
}

const open = (m: SessionManager, id = "ses_a", over: object = {}) =>
  m.open({ id, maxSeconds: 120, idleSeconds: 30, ...over });

const fails = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(SessionError);
  expect((e as SessionError).code).toBe(code);
  return e as SessionError;
};

describe("ouverture", () => {
  it("ouvre une session isolée et donne son échéance", async () => {
    const { manager, f, clock } = setup();
    const info = await open(manager);
    expect(info).toMatchObject({
      id: "ses_a",
      status: "open",
      closeReason: null,
    });
    expect(info.expiresAt).toBe(clock() + 120_000);
    expect(f.launched).toHaveLength(1);
  });

  it("refuse un identifiant déjà pris, même fermé (pas de réutilisation)", async () => {
    const { manager } = setup();
    await open(manager);
    await fails(open(manager), "session_exists");
    await manager.close("ses_a", "closed_by_client");
    await fails(open(manager), "session_exists");
  });

  it("plafonne les sessions simultanées et libère la place à la fermeture", async () => {
    const { manager } = setup({ maxSessions: 2 });
    await open(manager, "ses_a");
    await open(manager, "ses_b");
    await fails(open(manager, "ses_c"), "capacity");
    await manager.close("ses_a", "closed_by_client");
    await open(manager, "ses_c");
  });

  it("plafonne aussi les ouvertures simultanées (pas de dépassement pendant le lancement)", async () => {
    const { manager } = setup({ maxSessions: 1 });
    const [a, b] = await Promise.allSettled([
      open(manager, "ses_a"),
      open(manager, "ses_b"),
    ]);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("refuse des bornes hors limites", async () => {
    const { manager } = setup({ maxSeconds: 600, maxIdleSeconds: 300 });
    await fails(open(manager, "ses_a", { maxSeconds: 601 }), "invalid_request");
    await fails(open(manager, "ses_b", { maxSeconds: 0 }), "invalid_request");
    await fails(
      open(manager, "ses_c", { idleSeconds: 301 }),
      "invalid_request",
    );
    await fails(open(manager, "ses_d", { idleSeconds: 0 }), "invalid_request");
    await fails(open(manager, "../etc"), "invalid_request");
  });

  it("un lancement raté ne laisse rien derrière lui", async () => {
    const { manager, f } = setup({ maxSessions: 1 });
    f.failNextLaunch();
    await fails(open(manager, "ses_a"), "browser_error");
    expect(manager.count()).toBe(0);
  });
});

describe("actions", () => {
  it("exécute et renvoie l'état de la page", async () => {
    const { manager, f } = setup();
    await open(manager);
    const out = await manager.run("ses_a", [{ type: "read" }], {
      approveHosts: ["exemple.org"],
    });
    expect(out.results).toEqual([{ type: "read", ok: true }]);
    expect(out.url).toBe("https://exemple.org/");
    expect(f.runs[0]?.approveHosts).toEqual(["exemple.org"]);
  });

  it("refuse une action sur une session fermée en nommant le motif", async () => {
    const { manager } = setup();
    await open(manager);
    await manager.close("ses_a", "privacy_policy");
    const e = await fails(
      manager.run("ses_a", [{ type: "read" }], { approveHosts: [] }),
      "session_closed",
    );
    expect(e.reason).toBe("privacy_policy");
  });

  it("refuse une session inconnue", async () => {
    const { manager } = setup();
    await fails(
      manager.run("ses_x", [{ type: "read" }], { approveHosts: [] }),
      "not_found",
    );
  });

  it("refuse deux lots en même temps sur la même session", async () => {
    const { manager, f } = setup();
    await open(manager);
    let release: () => void = () => undefined;
    f.holdRuns(new Promise<void>((r) => (release = r)));
    const first = manager.run("ses_a", [{ type: "read" }], {
      approveHosts: [],
    });
    await Promise.resolve();
    await fails(
      manager.run("ses_a", [{ type: "read" }], { approveHosts: [] }),
      "busy",
    );
    release();
    await first;
  });

  it("une panne du navigateur ferme la session en browser_error", async () => {
    const { manager, f } = setup();
    await open(manager);
    f.failRuns(new Error("Target closed"));
    await fails(
      manager.run("ses_a", [{ type: "read" }], { approveHosts: [] }),
      "browser_error",
    );
    expect(manager.get("ses_a")).toMatchObject({
      status: "closed",
      closeReason: "browser_error",
    });
    expect(f.launched[0]?.closed).toBe(true);
  });

  it("un plantage du navigateur entre deux lots ferme la session", async () => {
    const { manager, f } = setup();
    await open(manager);
    f.launched[0]?.crash();
    await Promise.resolve();
    await Promise.resolve();
    expect(manager.get("ses_a")).toMatchObject({
      status: "closed",
      closeReason: "browser_error",
    });
  });
});

describe("minuteries", () => {
  it("ferme à l'échéance (max_minutes), navigateur détruit", async () => {
    const { manager, f, advance } = setup();
    await open(manager, "ses_a", { maxSeconds: 120, idleSeconds: 300 });
    advance(119_000);
    await manager.sweep();
    expect(manager.get("ses_a").status).toBe("open");
    advance(1_000);
    await manager.sweep();
    expect(manager.get("ses_a")).toMatchObject({
      status: "closed",
      closeReason: "max_minutes",
    });
    expect(f.launched[0]?.closed).toBe(true);
  });

  it("ferme après l'inactivité (idle) ; une action la repousse", async () => {
    const { manager, advance } = setup();
    await open(manager, "ses_a", { maxSeconds: 600, idleSeconds: 30 });
    advance(29_000);
    await manager.run("ses_a", [{ type: "read" }], { approveHosts: [] });
    advance(29_000);
    await manager.sweep();
    expect(manager.get("ses_a").status).toBe("open");
    advance(2_000);
    await manager.sweep();
    expect(manager.get("ses_a")).toMatchObject({
      status: "closed",
      closeReason: "idle",
    });
  });

  it("si les deux sont échus, l'échéance l'emporte", async () => {
    const { manager, advance } = setup();
    await open(manager, "ses_a", { maxSeconds: 60, idleSeconds: 30 });
    advance(120_000);
    await manager.sweep();
    expect(manager.get("ses_a").closeReason).toBe("max_minutes");
  });

  it("ferme une session en cours de lot à l'échéance (le lot est interrompu)", async () => {
    const { manager, f, advance } = setup();
    await open(manager, "ses_a", { maxSeconds: 60, idleSeconds: 300 });
    let release: () => void = () => undefined;
    f.holdRuns(new Promise<void>((r) => (release = r)));
    const running = manager.run("ses_a", [{ type: "read" }], {
      approveHosts: [],
    });
    await Promise.resolve();
    advance(61_000);
    await manager.sweep();
    release();
    await running.catch(() => undefined);
    expect(manager.get("ses_a")).toMatchObject({
      status: "closed",
      closeReason: "max_minutes",
    });
  });

  it("garde le motif un temps limité puis oublie la session", async () => {
    const { manager, advance } = setup({ tombstoneMs: 60_000 });
    await open(manager);
    await manager.close("ses_a", "closed_by_client");
    advance(59_000);
    await manager.sweep();
    expect(manager.get("ses_a").closeReason).toBe("closed_by_client");
    advance(2_000);
    await manager.sweep();
    expect(() => manager.get("ses_a")).toThrow(SessionError);
  });
});

describe("fermeture", () => {
  it("est idempotente et garde le premier motif", async () => {
    const { manager, f } = setup();
    await open(manager);
    await manager.close("ses_a", "insufficient_quota");
    const again = await manager.close("ses_a", "closed_by_client");
    expect(again.closeReason).toBe("insufficient_quota");
    expect(f.launched[0]?.closed).toBe(true);
  });

  it("fermer une session inconnue est une 404", async () => {
    const { manager } = setup();
    await fails(manager.close("ses_x", "closed_by_client"), "not_found");
  });

  it("closeAll détruit tout (arrêt du service)", async () => {
    const { manager, f } = setup();
    await open(manager, "ses_a");
    await open(manager, "ses_b");
    await manager.closeAll();
    expect(f.launched.every((l) => l.closed)).toBe(true);
    expect(manager.count()).toBe(0);
  });
});
