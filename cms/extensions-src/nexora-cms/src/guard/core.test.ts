import { describe, expect, test } from "bun:test";
import {
  type ApprovalRow,
  canonicalJson,
  DEFAULT_TICKET_TTL_MS,
  evaluatePromotion,
  isStateChangeToApproved,
  PromotionTickets,
  prepareApprovalCreate,
  prepareApprovalUpdate,
  slugKey,
  stripStamps,
  versionHash,
  writeVerdict,
} from "./core";

const approval = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "a1",
  status: "approuvée",
  version_hash: "H",
  applied_at: null,
  ...over,
});

describe("stripStamps / canonicalJson", () => {
  test("retire _user et _date à tous les niveaux sans toucher au reste", () => {
    const delta = {
      a: 1,
      _user: "u",
      _date: "d",
      blocks: { create: [{ _user: "u", _date: "d", x: 2 }] },
    };
    expect(stripStamps<unknown>(delta)).toEqual({
      a: 1,
      blocks: { create: [{ x: 2 }] },
    });
  });

  test("le JSON canonique ne dépend pas de l’ordre des clés", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
  });

  test("l’ordre des tableaux compte (l’ordre des blocs est du contenu)", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("versionHash", () => {
  test("est stable, ignore les estampilles, change si le contenu change", () => {
    const h1 = versionHash("pages", "1", {
      title: "A",
      _user: "x",
      _date: "y",
    });
    const h2 = versionHash("pages", "1", { _date: "autre", title: "A" });
    const h3 = versionHash("pages", "1", { title: "B" });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test("lie l’approbation à la collection et à l’élément", () => {
    expect(versionHash("pages", "1", { t: 1 })).not.toBe(
      versionHash("pages", "2", { t: 1 }),
    );
    expect(versionHash("pages", "1", { t: 1 })).not.toBe(
      versionHash("articles", "1", { t: 1 }),
    );
    expect(versionHash("pages", null, { t: 1 })).not.toBe(
      versionHash("pages", "1", { t: 1 }),
    );
  });
});

describe("evaluatePromotion", () => {
  test("autorise quand une approbation approuvée porte sur le hash exact", () => {
    expect(evaluatePromotion("H", [approval()])).toEqual({
      allow: true,
      approvalId: "a1",
    });
  });

  test("refuse sans aucune approbation", () => {
    const d = evaluatePromotion("H", []);
    expect(d).toMatchObject({
      allow: false,
      code: "NEXORA_APPROBATION_ABSENTE",
    });
  });

  test("refuse une approbation en attente, refusée ou à corriger", () => {
    for (const status of ["en_attente", "refusée", "à_corriger"]) {
      const d = evaluatePromotion("H", [approval({ status })]);
      expect(d.allow).toBe(false);
    }
  });

  test("refuse et signale comme périmée une approbation portant sur un autre hash", () => {
    const d = evaluatePromotion("H2", [approval({ version_hash: "H" })]);
    expect(d).toMatchObject({
      allow: false,
      code: "NEXORA_APPROBATION_PERIMEE",
      staleIds: ["a1"],
    });
  });

  test("ne considère pas comme périmée une approbation déjà appliquée ou refusée", () => {
    const d = evaluatePromotion("H2", [
      approval({ applied_at: "2026-10-26T00:00:00Z" }),
      approval({ id: "a2", status: "refusée" }),
    ]);
    expect(d).toMatchObject({
      allow: false,
      code: "NEXORA_APPROBATION_ABSENTE",
      staleIds: [],
    });
  });

  test("une approbation à usage unique : déjà appliquée, elle ne rouvre pas la publication", () => {
    const d = evaluatePromotion("H", [
      approval({ applied_at: "2026-10-26T00:00:00Z" }),
    ]);
    expect(d).toMatchObject({
      allow: false,
      code: "NEXORA_APPROBATION_DEJA_UTILISEE",
    });
  });

  test("choisit l’approbation valide parmi plusieurs", () => {
    const d = evaluatePromotion("H", [
      approval({ id: "a0", status: "refusée" }),
      approval({ id: "a1" }),
    ]);
    expect(d).toEqual({ allow: true, approvalId: "a1" });
  });
});

describe("PromotionTickets", () => {
  test("autorise les écritures de la promotion de l’utilisateur pendant la durée de vie du billet", () => {
    let t = 1000;
    const tickets = new PromotionTickets(100, () => t);
    tickets.issue("u1", "pages", "1");
    expect(tickets.isActive("u1")).toBe(true);
    expect(tickets.isActive("u2")).toBe(false);
    t = 1101;
    expect(tickets.isActive("u1")).toBe(false);
  });

  test("release retire le billet", () => {
    const tickets = new PromotionTickets(1000, () => 0);
    tickets.issue("u1", "pages", "1");
    tickets.release("u1", "pages", "1");
    expect(tickets.isActive("u1")).toBe(false);
  });

  test("deux promotions simultanées du même utilisateur : le billet reste actif jusqu’à la fin de la dernière", () => {
    const tickets = new PromotionTickets(1000, () => 0);
    tickets.issue("u1", "pages", "1");
    tickets.issue("u1", "pages", "2");
    tickets.release("u1", "pages", "1");
    expect(tickets.isActive("u1")).toBe(true);
    tickets.release("u1", "pages", "2");
    expect(tickets.isActive("u1")).toBe(false);
  });
});

describe("PromotionTickets : un billet ne vaut que pour l'élément promu", () => {
  test("couvre la page promue, pas une autre page publiée", () => {
    const tickets = new PromotionTickets(1000, () => 0);
    tickets.issue("u1", "pages", "A");
    expect(tickets.covers("u1", "pages", ["A"])).toBe(true);
    expect(tickets.covers("u1", "pages", ["B"])).toBe(false);
    expect(tickets.covers("u1", "pages", ["A", "B"])).toBe(false);
  });

  test("ne couvre rien pour un autre utilisateur, ni pour une liste vide (création d'une page publiée)", () => {
    const tickets = new PromotionTickets(1000, () => 0);
    tickets.issue("u1", "pages", "A");
    expect(tickets.covers("u2", "pages", ["A"])).toBe(false);
    expect(tickets.covers("u1", "pages", [])).toBe(false);
  });

  test("un billet resté après une promotion échouée expire, et release le retire", () => {
    let t = 0;
    const tickets = new PromotionTickets(1000, () => t);
    tickets.issue("u1", "pages", "A");
    tickets.issue("u1", "pages", "B");
    tickets.release("u1", "pages", "B");
    expect(tickets.covers("u1", "pages", ["B"])).toBe(false);
    t = 1001;
    expect(tickets.covers("u1", "pages", ["A"])).toBe(false);
  });

  test("deux promotions du même utilisateur couvrent chacune leur page", () => {
    const tickets = new PromotionTickets(1000, () => 0);
    tickets.issue("u1", "pages", "A");
    tickets.issue("u1", "pages", "B");
    expect(tickets.covers("u1", "pages", ["A", "B"])).toBe(true);
  });

  test("la durée de vie par défaut reste courte (15 s) : une promotion échouée ne laisse pas la page ouverte longtemps", () => {
    expect(DEFAULT_TICKET_TTL_MS).toBeLessThanOrEqual(15_000);
  });
});

describe("writeVerdict (écriture directe sur un élément publié)", () => {
  const base = {
    admin: false,
    internal: false,
    ticket: false,
    touchesPublished: true,
  };

  test("refuse un rôle non administrateur qui touche un élément publié", () => {
    expect(writeVerdict(base)).toMatchObject({
      allow: false,
      code: "NEXORA_ECRITURE_DIRECTE_REFUSEE",
    });
  });

  test("laisse passer l’administrateur", () => {
    expect(writeVerdict({ ...base, admin: true })).toEqual({ allow: true });
  });

  test("laisse passer les appels internes sans accountability", () => {
    expect(writeVerdict({ ...base, internal: true })).toEqual({ allow: true });
  });

  test("laisse passer les écritures d’une promotion approuvée (billet actif)", () => {
    expect(writeVerdict({ ...base, ticket: true })).toEqual({ allow: true });
  });

  test("laisse passer ce qui ne touche pas un élément publié", () => {
    expect(writeVerdict({ ...base, touchesPublished: false })).toEqual({
      allow: true,
    });
  });
});

describe("slugKey", () => {
  test("combine la langue et le slug normalisé pour l’unicité par langue", () => {
    expect(slugKey("fr-CA", "Accueil")).toBe("fr-CA:accueil");
    expect(slugKey("en-CA", "/home/")).toBe("en-CA:home");
    expect(slugKey("fr-CA", "")).toBe("fr-CA:");
  });
});

describe("isStateChangeToApproved", () => {
  test("détecte le passage à approuvée", () => {
    expect(isStateChangeToApproved({ status: "approuvée" })).toBe(true);
    expect(isStateChangeToApproved({ status: "refusée" })).toBe(false);
    expect(isStateChangeToApproved({ comment: "x" })).toBe(false);
  });
});

describe("prepareApprovalCreate", () => {
  const version = {
    id: "v1",
    key: "brouillon",
    collection: "pages",
    item: "p1",
    delta: { title: "A", _user: "x", _date: "d" },
  };

  test("calcule le hash côté serveur et ignore celui fourni par le client", () => {
    const r = prepareApprovalCreate(
      {
        version_id: "v1",
        version_hash: "forgé",
        status: "approuvée",
        reviewer: "x",
      },
      { admin: false, version },
    );
    expect(r.error).toBeUndefined();
    expect(r.payload.version_hash).toBe(
      versionHash("pages", "p1", { title: "A" }),
    );
    expect(r.payload).toMatchObject({
      collection: "pages",
      item: "p1",
      version_key: "brouillon",
      version_id: "v1",
      status: "en_attente",
    });
    expect(r.payload.reviewer).toBeNull();
    expect(r.payload.applied_at).toBeNull();
  });

  test("remplit le diff avec le contenu de la version, sans estampilles, si absent", () => {
    const r = prepareApprovalCreate(
      { version_id: "v1" },
      { admin: false, version },
    );
    expect(r.payload.diff).toEqual({ title: "A" });
  });

  test("l’administrateur peut fixer l’état à la création, le hash reste calculé", () => {
    const r = prepareApprovalCreate(
      { version_id: "v1", status: "approuvée", version_hash: "forgé" },
      { admin: true, version },
    );
    expect(r.payload.status).toBe("approuvée");
    expect(r.payload.version_hash).not.toBe("forgé");
  });

  test("exige une version sauf pour une suggestion", () => {
    expect(
      prepareApprovalCreate(
        { collection: "pages", item: "p1" },
        { admin: false, version: null },
      ).error?.code,
    ).toBe("NEXORA_VERSION_REQUISE");
    const s = prepareApprovalCreate(
      { kind: "suggestion", summary: "Améliorer le titre" },
      { admin: false, version: null },
    );
    expect(s.error).toBeUndefined();
    expect(s.payload.version_hash).toBeNull();
  });
});

describe("prepareApprovalUpdate", () => {
  const existing = {
    id: "a1",
    status: "en_attente",
    version_id: "v1",
    version_hash: "H",
    applied_at: null,
  };

  test("un relecteur peut approuver quand le hash courant de la version est celui de l’approbation", () => {
    const r = prepareApprovalUpdate(
      { status: "approuvée", comment: "ok" },
      existing,
      { admin: false, user: "u1", currentHash: "H" },
    );
    expect(r.error).toBeUndefined();
    expect(r.payload).toMatchObject({ status: "approuvée", reviewer: "u1" });
  });

  test("refuse d’approuver si la version a changé depuis la proposition", () => {
    const r = prepareApprovalUpdate({ status: "approuvée" }, existing, {
      admin: false,
      user: "u1",
      currentHash: "H2",
    });
    expect(r.error?.code).toBe("NEXORA_APPROBATION_PERIMEE");
  });

  test("un non-administrateur ne peut pas toucher au hash, à l’élément ni à applied_at", () => {
    for (const field of [
      "version_hash",
      "collection",
      "item",
      "version_id",
      "applied_at",
      "proposed_by",
      "diff",
    ]) {
      const r = prepareApprovalUpdate({ [field]: "x" }, existing, {
        admin: false,
        user: "u1",
        currentHash: "H",
      });
      expect(r.error?.code).toBe("NEXORA_APPROBATION_CHAMP_PROTEGE");
    }
  });

  test("un non-administrateur ne peut pas remettre l’état en attente ni le mettre à périmée", () => {
    for (const status of ["en_attente", "périmée"]) {
      const r = prepareApprovalUpdate({ status }, existing, {
        admin: false,
        user: "u1",
        currentHash: "H",
      });
      expect(r.error?.code).toBe("NEXORA_APPROBATION_ETAT_INTERDIT");
    }
  });

  test("une approbation déjà appliquée ou périmée n’est plus modifiable par un non-administrateur", () => {
    expect(
      prepareApprovalUpdate(
        { status: "refusée" },
        { ...existing, applied_at: "maintenant" },
        { admin: false, user: "u1", currentHash: "H" },
      ).error?.code,
    ).toBe("NEXORA_APPROBATION_VERROUILLEE");
    expect(
      prepareApprovalUpdate(
        { status: "approuvée" },
        { ...existing, status: "périmée" },
        { admin: false, user: "u1", currentHash: "H" },
      ).error?.code,
    ).toBe("NEXORA_APPROBATION_VERROUILLEE");
  });

  test("séparation des tâches : on n'approuve pas sa propre proposition (non-administrateur)", () => {
    const own = { ...existing, proposed_by: "u1" };
    const r = prepareApprovalUpdate({ status: "approuvée" }, own, {
      admin: false,
      user: "u1",
      currentHash: "H",
    });
    expect(r.error?.code).toBe("NEXORA_AUTO_APPROBATION_INTERDITE");
  });

  test("l'auteur de la proposition peut encore la refuser ou la renvoyer à corriger", () => {
    const own = { ...existing, proposed_by: "u1" };
    for (const status of ["refusée", "à_corriger"]) {
      const r = prepareApprovalUpdate({ status }, own, {
        admin: false,
        user: "u1",
        currentHash: "H",
      });
      expect(r.error, status).toBeUndefined();
    }
  });

  test("une autre personne approuve la proposition d'un tiers", () => {
    const r = prepareApprovalUpdate(
      { status: "approuvée" },
      { ...existing, proposed_by: "u1" },
      { admin: false, user: "u2", currentHash: "H" },
    );
    expect(r.error).toBeUndefined();
    expect(r.payload.reviewer).toBe("u2");
  });

  test("l'administrateur n'est pas soumis à cette règle", () => {
    const r = prepareApprovalUpdate(
      { status: "approuvée" },
      { ...existing, proposed_by: "a" },
      { admin: true, user: "a", currentHash: "H" },
    );
    expect(r.error).toBeUndefined();
  });

  test("l'identité du proposant ne peut jamais être fournie par le client à la création (non-administrateur)", () => {
    const r = prepareApprovalCreate(
      { version_id: "v1", proposed_by: "autre" },
      {
        admin: false,
        version: {
          id: "v1",
          key: "k",
          collection: "pages",
          item: "p1",
          delta: {},
        },
      },
    );
    expect("proposed_by" in r.payload).toBe(false);
  });

  test("l’administrateur ne peut pas approuver une approbation dont le hash est dépassé", () => {
    const r = prepareApprovalUpdate({ status: "approuvée" }, existing, {
      admin: true,
      user: "a",
      currentHash: "H2",
    });
    expect(r.error?.code).toBe("NEXORA_APPROBATION_PERIMEE");
  });
});
