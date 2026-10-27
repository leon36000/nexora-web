import { describe, expect, it } from "vitest";
import {
  actionStates,
  genericTunnelCommand,
  needsRefresh,
  newRequestId,
  PROGRESS_STEPS,
  type StateKey,
  sshCommand,
  stageState,
  stateChanges,
  stateKey,
  stateTone,
  stepProgress,
  tunnelCommand,
  tunnelPorts,
} from "./vps-logic";

describe("accès SSH", () => {
  it("construit la commande de connexion et le tunnel vers 127.0.0.1", () => {
    expect(sshCommand("debian", "10.20.0.11")).toBe("ssh debian@10.20.0.11");
    expect(tunnelCommand("debian", "10.20.0.11", 3001)).toBe(
      "ssh -N -L 3001:127.0.0.1:3001 debian@10.20.0.11",
    );
    expect(genericTunnelCommand("ubuntu", "10.20.0.11")).toBe(
      "ssh -N -L <port>:127.0.0.1:<port> ubuntu@10.20.0.11",
    );
  });

  it("n'affiche rien sans adresse, avec un utilisateur ou une adresse mal formés, ou un port invalide", () => {
    expect(sshCommand("debian", null)).toBeNull();
    expect(sshCommand("debian", "pas-une-ip")).toBeNull();
    expect(sshCommand("debian", "10.20.0.256")).toBeNull();
    expect(sshCommand("root; rm -rf /", "10.20.0.11")).toBeNull();
    expect(sshCommand("-oProxyCommand=x", "10.20.0.11")).toBeNull();
    expect(sshCommand("Debian", "10.20.0.11")).toBeNull();
    expect(tunnelCommand("debian", "10.20.0.11", 0)).toBeNull();
    expect(tunnelCommand("debian", "10.20.0.11", 70_000)).toBeNull();
    expect(tunnelCommand("debian", "10.20.0.11", 80.5)).toBeNull();
    expect(genericTunnelCommand("debian", null)).toBeNull();
  });

  it("ne propose un tunnel que pour les ports liés à 127.0.0.1, triés", () => {
    const ports = [
      {
        port: 8443,
        proto: "tcp",
        exposure: "public",
        labelFr: "API",
        labelEn: "API",
      },
      {
        port: 3002,
        proto: "tcp",
        exposure: "tunnel",
        labelFr: "B",
        labelEn: "B",
      },
      {
        port: 5353,
        proto: "udp",
        exposure: "tunnel",
        labelFr: "U",
        labelEn: "U",
      },
      {
        port: 3001,
        proto: "tcp",
        exposure: "tunnel",
        labelFr: "A",
        labelEn: "A",
      },
    ] as const;
    expect(tunnelPorts({ ports: [...ports] }).map((p) => p.port)).toEqual([
      3001, 3002,
    ]);
  });
});

describe("libellé d'état", () => {
  const base = { power: "unknown", pendingAction: null } as const;
  it("précise un VPS actif par son alimentation et par l'action en attente", () => {
    expect(stateKey({ ...base, status: "active", power: "running" })).toBe(
      "running",
    );
    expect(stateKey({ ...base, status: "active", power: "stopped" })).toBe(
      "stopped",
    );
    expect(stateKey({ ...base, status: "active" })).toBe("active");
    expect(
      stateKey({
        ...base,
        status: "active",
        power: "running",
        pendingAction: "reboot",
      }),
    ).toBe("rebooting");
    expect(
      stateKey({
        ...base,
        status: "active",
        power: "stopped",
        pendingAction: "start",
      }),
    ).toBe("starting");
    expect(
      stateKey({
        ...base,
        status: "active",
        power: "running",
        pendingAction: "stop",
      }),
    ).toBe("stopping");
  });
  it("les autres statuts gardent leur libellé, quelle que soit l'alimentation", () => {
    for (const status of [
      "provisioning",
      "reinstalling",
      "suspended",
      "canceled",
      "failed",
      "deleted",
    ] as const)
      expect(
        stateKey({ status, power: "running", pendingAction: "stop" }),
      ).toBe(status);
  });
  it("la couleur ne signale que les états à surveiller ou réussis", () => {
    const tones: Record<StateKey, string> = {
      provisioning: "accent",
      reinstalling: "accent",
      running: "success",
      stopped: "muted",
      active: "muted",
      starting: "accent",
      stopping: "accent",
      rebooting: "accent",
      suspended: "accent",
      canceled: "muted",
      failed: "accent",
      deleted: "muted",
    };
    for (const [key, tone] of Object.entries(tones))
      expect(stateTone(key as StateKey)).toBe(tone);
  });
});

describe("étape -> progression", () => {
  it("huit étapes affichées, du placement à la vérification", () => {
    expect(PROGRESS_STEPS).toHaveLength(8);
    expect(stepProgress("placement")).toEqual({
      index: 0,
      total: 8,
      percent: 0,
      done: false,
    });
    expect(stepProgress("start")).toMatchObject({ index: 4, percent: 50 });
    expect(stepProgress("verify")).toMatchObject({ index: 7, done: false });
    expect(stepProgress("done")).toEqual({
      index: 8,
      total: 8,
      percent: 100,
      done: true,
    });
  });
  it("l'instantané d'une réinstallation compte comme la préparation (avant le clonage)", () => {
    expect(stepProgress("snapshot").index).toBe(0);
    expect(stageState("placement", "snapshot")).toBe("current");
    expect(stageState("clone", "snapshot")).toBe("todo");
  });
  it("chaque étape est terminée, en cours ou à venir selon l'étape du moteur", () => {
    expect(PROGRESS_STEPS.map((s) => stageState(s, "install"))).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
      "done",
      "current",
      "todo",
    ]);
    expect(PROGRESS_STEPS.every((s) => stageState(s, "done") === "done")).toBe(
      true,
    );
  });
});

describe("visibilité des actions", () => {
  const active = {
    status: "active",
    power: "running",
    pendingAction: null,
    cancelAtPeriodEnd: false,
  } as const;
  const visible = (r: ReturnType<typeof actionStates>) =>
    Object.entries(r)
      .filter(([, a]) => a.visible)
      .map(([k]) => k);

  it("le propriétaire voit les cinq actions d'un VPS actif", () => {
    expect(visible(actionStates({ role: "owner", ...active }))).toEqual([
      "start",
      "stop",
      "reboot",
      "reinstall",
      "cancel",
    ]);
  });
  it("un membre ne voit ni Réinstaller ni Résilier, mais démarre, arrête et redémarre", () => {
    const r = actionStates({ role: "member", ...active });
    expect(visible(r)).toEqual(["start", "stop", "reboot"]);
    expect(r.stop.enabled && r.reboot.enabled).toBe(true);
  });
  it("Démarrer est grisé quand la machine tourne ; Arrêter et Redémarrer quand elle est arrêtée", () => {
    const running = actionStates({ role: "owner", ...active });
    expect(running.start.enabled).toBe(false);
    const stopped = actionStates({
      role: "owner",
      ...active,
      power: "stopped",
    });
    expect(stopped.start.enabled).toBe(true);
    expect(stopped.stop.enabled).toBe(false);
    expect(stopped.reboot.enabled).toBe(false);
  });
  it("tout est grisé pendant une action en attente, sauf la résiliation", () => {
    const r = actionStates({
      role: "owner",
      ...active,
      pendingAction: "reboot",
    });
    expect(
      [r.start, r.stop, r.reboot, r.reinstall].some((a) => a.enabled),
    ).toBe(false);
    expect(r.cancel.enabled).toBe(true);
  });
  it("suspendu : les actions restent visibles mais désactivées, sauf la résiliation du propriétaire", () => {
    const r = actionStates({ role: "owner", ...active, status: "suspended" });
    expect(visible(r)).toEqual([
      "start",
      "stop",
      "reboot",
      "reinstall",
      "cancel",
    ]);
    expect(
      [r.start, r.stop, r.reboot, r.reinstall].some((a) => a.enabled),
    ).toBe(false);
  });
  it("résiliation déjà demandée : le bouton Résilier disparaît", () => {
    const r = actionStates({
      role: "owner",
      ...active,
      cancelAtPeriodEnd: true,
    });
    expect(r.cancel.visible).toBe(false);
    expect(r.reinstall.visible).toBe(true);
  });
  it("préparation, réinstallation, résilié, échec, supprimé : aucune action", () => {
    for (const status of [
      "provisioning",
      "reinstalling",
      "canceled",
      "failed",
      "deleted",
    ] as const)
      expect(
        visible(actionStates({ role: "owner", ...active, status })),
      ).toEqual([]);
  });
});

describe("actualisation automatique", () => {
  const none = { instances: [], orders: [], justOrdered: false };
  it("s'arrête quand tout est stable", () => {
    expect(needsRefresh(none)).toBe(false);
    expect(
      needsRefresh({
        ...none,
        instances: [
          { status: "active", pendingAction: null },
          { status: "suspended", pendingAction: null },
          { status: "failed", pendingAction: null },
        ],
      }),
    ).toBe(false);
  });
  it("continue pendant la préparation, la réinstallation ou une action en attente", () => {
    expect(
      needsRefresh({
        ...none,
        instances: [{ status: "provisioning", pendingAction: null }],
      }),
    ).toBe(true);
    expect(
      needsRefresh({
        ...none,
        instances: [{ status: "reinstalling", pendingAction: "reinstall" }],
      }),
    ).toBe(true);
    expect(
      needsRefresh({
        ...none,
        instances: [{ status: "active", pendingAction: "start" }],
      }),
    ).toBe(true);
  });
  it("continue pour une commande payée sans instance, et pour un retour de paiement pas encore confirmé", () => {
    expect(needsRefresh({ ...none, orders: [{ status: "paid" }] })).toBe(true);
    expect(
      needsRefresh({ ...none, orders: [{ status: "awaiting_payment" }] }),
    ).toBe(false);
    expect(
      needsRefresh({
        ...none,
        orders: [{ status: "awaiting_payment" }],
        justOrdered: true,
      }),
    ).toBe(true);
    expect(
      needsRefresh({
        ...none,
        orders: [{ status: "expired" }],
        justOrdered: true,
      }),
    ).toBe(false);
  });
});

describe("annonce des changements d'état", () => {
  const inst = (
    id: string,
    status: "active" | "provisioning",
    power: "running" | "unknown" = "unknown",
  ) =>
    ({ id, hostname: `h-${id}`, status, power, pendingAction: null }) as const;
  it("ne signale que les instances déjà connues dont l'état affiché a changé", () => {
    const before = new Map<string, StateKey>([
      ["a", "provisioning"],
      ["b", "running"],
    ]);
    expect(
      stateChanges(before, [
        inst("a", "active", "running"),
        inst("b", "active", "running"),
        inst("c", "provisioning"),
      ]),
    ).toEqual([{ id: "a", hostname: "h-a", state: "running" }]);
  });
});

describe("identifiant de requête", () => {
  it("respecte le format accepté par le serveur", () => {
    const id = newRequestId();
    expect(id).toMatch(/^[A-Za-z0-9._:-]{8,80}$/);
    expect(newRequestId()).not.toBe(id);
  });
});
