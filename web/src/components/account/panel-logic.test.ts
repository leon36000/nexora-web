import { describe, expect, it } from "vitest";
import {
  hasWorkstudioAccess,
  isFreeAccess,
  onboardingProgress,
  onboardingSteps,
  PANEL_NAV,
  safeInstanceUrl,
  sectionOfPath,
  workstudioInstanceOrigin,
  workstudioView,
} from "./panel-logic";

describe("section active selon l'adresse", () => {
  it.each([
    ["/compte", "overview"],
    ["/compte/", "overview"],
    ["/en/compte", "overview"],
    ["/fr/compte", "overview"],
    ["/compte/modeles", "models"],
    ["/en/compte/activite", "activity"],
    ["/compte/activite/", "activity"],
    ["/compte/workstudio", "workstudio"],
    ["/compte/vps", "cloud"],
    ["/en/compte/vps", "cloud"],
    ["/compte/vps/une-sous-page", "cloud"],
    ["/compte/facturation", "billing"],
    ["/compte/securite", "security"],
  ] as const)("%s -> %s", (path, section) => {
    expect(sectionOfPath(path)).toBe(section);
  });

  it("les pages d'authentification et le reste du site n'activent rien", () => {
    for (const path of [
      "/compte/connexion",
      "/compte/inscription",
      "/compte/mot-de-passe-oublie",
      "/modeles",
      "/apps",
      "/",
      "/compte-autre",
      "/comptes",
    ])
      expect(sectionOfPath(path), path).toBeNull();
  });
});

describe("navigation du panneau", () => {
  it("huit entrées, dans l'ordre voulu, chacune avec une adresse unique", () => {
    expect(PANEL_NAV.map((i) => i.id)).toEqual([
      "overview",
      "models",
      "activity",
      "workstudio",
      "cloud",
      "apps",
      "billing",
      "security",
    ]);
    expect(new Set(PANEL_NAV.map((i) => i.path)).size).toBe(PANEL_NAV.length);
  });

  it("seule Nexora Apps sort du panneau : son adresse est celle du site, pas /compte/…", () => {
    for (const item of PANEL_NAV)
      expect(item.path.startsWith("/compte"), item.id).toBe(item.id !== "apps");
    expect(PANEL_NAV.find((i) => i.id === "apps")?.path).toBe("/apps");
  });
});

describe("liste « Pour démarrer »", () => {
  const none = {
    hasApiKey: false,
    hasModelRequest: false,
    hasWorkstudio: false,
    hasVps: false,
  };

  it("quatre étapes, cochées d'après les données réelles seulement", () => {
    expect(onboardingSteps(none).map((s) => [s.id, s.done])).toEqual([
      ["key", false],
      ["model", false],
      ["workstudio", false],
      ["vps", false],
    ]);
    expect(
      onboardingSteps({ ...none, hasApiKey: true, hasVps: true }).map(
        (s) => s.done,
      ),
    ).toEqual([true, false, false, true]);
  });

  it("chaque étape mène à la page où on la fait", () => {
    const hrefs = Object.fromEntries(
      onboardingSteps(none).map((s) => [s.id, s.href]),
    );
    expect(hrefs).toEqual({
      key: "/compte/modeles",
      model: "/modeles",
      workstudio: "/compte/workstudio",
      vps: "/compte/vps",
    });
  });

  it("la progression compte les étapes faites", () => {
    expect(onboardingProgress(onboardingSteps(none))).toEqual({
      done: 0,
      total: 4,
    });
    expect(
      onboardingProgress(
        onboardingSteps({
          hasApiKey: true,
          hasModelRequest: true,
          hasWorkstudio: true,
          hasVps: true,
        }),
      ),
    ).toEqual({ done: 4, total: 4 });
  });
});

describe("accès gratuit", () => {
  it("seule une organisation « maison » est gratuite ; le reste ne l'est jamais", () => {
    expect(isFreeAccess("house")).toBe(true);
    expect(isFreeAccess("standard")).toBe(false);
    expect(isFreeAccess(undefined as never)).toBe(false);
    expect(isFreeAccess("gratuit" as never)).toBe(false);
  });
});

describe("adresse d'instance WorkStudio", () => {
  it("n'accepte que https, ou http sur la machine locale, sans identifiants", () => {
    expect(safeInstanceUrl("https://studio.nexora.example")).toBe(
      "https://studio.nexora.example",
    );
    expect(safeInstanceUrl("https://studio.nexora.example/chemin?x=1#y")).toBe(
      "https://studio.nexora.example",
    );
    expect(safeInstanceUrl("http://localhost:3200")).toBe(
      "http://localhost:3200",
    );
    for (const bad of [
      null,
      "",
      "pas une adresse",
      "http://studio.nexora.example", // http hors machine locale
      "javascript:alert(1)",
      "ftp://studio.nexora.example",
      "https://user:secret@studio.nexora.example",
    ])
      expect(safeInstanceUrl(bad), String(bad)).toBeNull();
  });
});

describe("adresse d'ouverture de WorkStudio (instance intégrée)", () => {
  it("WORKSTUDIO_PUBLIC_URL, quand elle est sûre, l'emporte sur l'adresse déclarée en base", () => {
    expect(
      workstudioInstanceOrigin(
        "https://studio.nexora.example/chemin",
        "https://ancienne.example",
      ),
    ).toBe("https://studio.nexora.example");
  });

  it("variable absente, vide ou non sûre : retombe sur l'adresse de la base (comportement d'avant)", () => {
    for (const env of [
      undefined,
      "",
      "   ",
      "http://pas-local.example",
      "oups",
    ])
      expect(workstudioInstanceOrigin(env, "https://ancienne.example")).toBe(
        "https://ancienne.example",
      );
  });

  it("rien de connu nulle part : null (« en préparation »)", () => {
    expect(workstudioInstanceOrigin(undefined, null)).toBeNull();
    expect(workstudioInstanceOrigin("javascript:alert(1)", null)).toBeNull();
  });

  it("une variable sûre fait passer l'état à « prêt » sans adresse en base", () => {
    const origin = workstudioInstanceOrigin(
      "https://studio.nexora.example",
      null,
    );
    expect(
      workstudioView({
        subscriptions: [{ planCode: "equipe", access: "full" }],
        instanceOrigin: origin,
      }),
    ).toEqual({ state: "ready", url: "https://studio.nexora.example" });
  });
});

describe("état de WorkStudio", () => {
  const sub = (
    planCode: string | null,
    access: "full" | "grace" | "suspended" | "none",
  ) => ({ planCode, access });
  const origin = "https://studio.nexora.example";

  it("sans abonnement : on invite à choisir une offre, jamais de bouton d'ouverture", () => {
    expect(
      workstudioView({ subscriptions: [], instanceOrigin: origin }),
    ).toEqual({ state: "no_subscription" });
    // Un abonnement résilié (accès « none ») ou sans offre (VPS) ne donne pas WorkStudio.
    expect(
      workstudioView({
        subscriptions: [sub("equipe", "none"), sub(null, "full")],
        instanceOrigin: origin,
      }),
    ).toEqual({ state: "no_subscription" });
  });

  it("abonnement actif sans adresse connue : « en préparation »", () => {
    expect(
      workstudioView({
        subscriptions: [sub("equipe", "full")],
        instanceOrigin: null,
      }),
    ).toEqual({ state: "pending" });
    expect(
      workstudioView({
        subscriptions: [sub("equipe", "full")],
        instanceOrigin: "http://pas-local.example",
      }),
    ).toEqual({ state: "pending" });
  });

  it("abonnement actif ou en délai de grâce avec adresse : prêt, avec l'adresse validée", () => {
    for (const access of ["full", "grace"] as const)
      expect(
        workstudioView({
          subscriptions: [sub("equipe", access)],
          instanceOrigin: `${origin}/connexion`,
        }),
      ).toEqual({ state: "ready", url: origin });
  });

  it("abonnement suspendu (paiement en souffrance) : on renvoie vers la facturation", () => {
    expect(
      workstudioView({
        subscriptions: [sub("equipe", "suspended")],
        instanceOrigin: origin,
      }),
    ).toEqual({ state: "suspended" });
    // Un autre abonnement actif l'emporte.
    expect(
      workstudioView({
        subscriptions: [sub("equipe", "suspended"), sub("affaires", "full")],
        instanceOrigin: origin,
      }),
    ).toEqual({ state: "ready", url: origin });
  });
});

describe("accès WorkStudio", () => {
  it("vrai seulement pour un abonnement lié à une offre, en accès complet ou en délai de grâce", () => {
    expect(hasWorkstudioAccess([])).toBe(false);
    expect(hasWorkstudioAccess([{ planCode: null, access: "full" }])).toBe(
      false,
    );
    expect(hasWorkstudioAccess([{ planCode: "equipe", access: "none" }])).toBe(
      false,
    );
    expect(
      hasWorkstudioAccess([{ planCode: "equipe", access: "suspended" }]),
    ).toBe(false);
    expect(hasWorkstudioAccess([{ planCode: "equipe", access: "full" }])).toBe(
      true,
    );
    expect(hasWorkstudioAccess([{ planCode: "equipe", access: "grace" }])).toBe(
      true,
    );
  });
});
