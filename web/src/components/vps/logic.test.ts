import { describe, expect, it } from "vitest";
import {
  buildCheckoutBody,
  catalogState,
  checkSshKeyInput,
  compatiblePlans,
  decimalCents,
  externalUrl,
  formatCents,
  formatMemory,
  guideSteps,
  isRedirectableUrl,
  isSellablePlan,
  isValidHostname,
  monthlyEquivalentCents,
  offeredTerms,
  orderErrorKey,
  REQUEST_ID,
  resolveSelection,
  selectionQuery,
  termPriceCents,
} from "./logic";
import { app, plan } from "./test-fixtures";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("formatage des prix (cents CAD entiers)", () => {
  it("fr-CA : « 15,00 $ »", () => {
    expect(nbsp(formatCents("fr", 1500))).toBe("15,00 $");
    expect(nbsp(formatCents("fr", 100))).toBe("1,00 $");
    expect(nbsp(formatCents("fr", 123456))).toBe("1 234,56 $");
  });
  it("en-CA : « $15.00 »", () => {
    expect(formatCents("en", 1500)).toBe("$15.00");
    expect(formatCents("en", 123456)).toBe("$1,234.56");
  });
  it("chaîne décimale exacte pour les données structurées", () => {
    expect(decimalCents(1500)).toBe("15.00");
    expect(decimalCents(1250)).toBe("12.50");
    expect(decimalCents(5)).toBe("0.05");
  });
});

describe("équivalent mensuel d'un prix annuel", () => {
  it("divise par 12 et arrondit au cent le plus proche", () => {
    expect(monthlyEquivalentCents(15000)).toBe(1250);
    expect(monthlyEquivalentCents(1000)).toBe(83); // 83,33
    expect(monthlyEquivalentCents(1002)).toBe(84); // 83,5 -> 84
  });
});

describe("mémoire affichée", () => {
  const units = { gb: "Go", mb: "Mo" };
  it("en Go quand c'est juste, sinon en Mo", () => {
    expect(formatMemory("fr", 4096, units)).toBe("4 Go");
    expect(nbsp(formatMemory("fr", 1536, units))).toBe("1 536 Mo");
    expect(formatMemory("en", 1536, { gb: "GB", mb: "MB" })).toBe("1,536 MB");
  });
});

describe("durées offertes", () => {
  it("une durée sans prix n'est pas offerte", () => {
    const p = plan({ priceMonthlyCents: 1500, priceYearlyCents: null });
    expect(termPriceCents(p, "month")).toBe(1500);
    expect(termPriceCents(p, "year")).toBeNull();
    expect(offeredTerms(p)).toEqual(["month"]);
    expect(
      offeredTerms(plan({ priceMonthlyCents: null, priceYearlyCents: null })),
    ).toEqual([]);
  });
  it("un prix nul n'est jamais affiché comme un prix", () => {
    expect(termPriceCents(plan({ priceMonthlyCents: 0 }), "month")).toBeNull();
  });
  it("un plan de développement ou sans prix n'est pas vendable", () => {
    expect(isSellablePlan(plan())).toBe(true);
    expect(isSellablePlan(plan({ isDevSample: true }))).toBe(false);
    expect(
      isSellablePlan(plan({ priceMonthlyCents: null, priceYearlyCents: null })),
    ).toBe(false);
  });
});

describe("message selon l'état du catalogue", () => {
  it("aucun plan publié -> en préparation", () => {
    expect(catalogState({ available: true, plans: [] })).toBe("empty");
  });
  it("base illisible -> indisponible, même avec une liste vide", () => {
    expect(catalogState({ available: false, plans: [] })).toBe("unavailable");
  });
  it("des plans publiés -> les plans", () => {
    expect(catalogState({ available: true, plans: [plan()] })).toBe("ready");
  });
});

describe("plans compatibles avec une application", () => {
  const plans = [
    plan({ code: "gros", ramMb: 8192, sort: 30 }),
    plan({ code: "petit", ramMb: 2048, sort: 10 }),
    plan({ code: "moyen", ramMb: 4096, sort: 20 }),
  ];
  it("garde les plans dont la mémoire atteint le minimum, dans l'ordre d'affichage", () => {
    expect(
      compatiblePlans(plans, { minRamMb: 4096 }).map((p) => p.code),
    ).toEqual(["moyen", "gros"]);
  });
  it("le minimum exact convient", () => {
    expect(compatiblePlans(plans, { minRamMb: 2048 })).toHaveLength(3);
  });
  it("aucun plan ne convient à une application gourmande", () => {
    expect(compatiblePlans(plans, { minRamMb: 16384 })).toEqual([]);
  });
});

describe("sélection du configurateur", () => {
  const plans = [
    plan({ code: "petit", ramMb: 2048, sort: 10 }),
    plan({ code: "moyen", ramMb: 4096, sort: 20, highlighted: true }),
    plan({ code: "gros", ramMb: 8192, sort: 30, priceYearlyCents: null }),
  ];
  const apps = [
    app({ code: "legere", minRamMb: 2048, sort: 10 }),
    app({ code: "lourde", minRamMb: 4096, sort: 20 }),
    app({ code: "guide-n8n", kind: "guide", minRamMb: 1024, sort: 5 }),
  ];

  it("sans paramètre : première application installable, plan mis en avant compatible, durée mensuelle", () => {
    expect(resolveSelection({}, plans, apps)).toEqual({
      plan: "moyen",
      app: "legere",
      term: "month",
    });
  });
  it("lit plan, app et term de l'adresse", () => {
    expect(
      resolveSelection(
        { plan: "petit", app: "legere", term: "year" },
        plans,
        apps,
      ),
    ).toEqual({
      plan: "petit",
      app: "legere",
      term: "year",
    });
  });
  it("un guide n'est jamais commandable : il est remplacé par une application installable", () => {
    expect(resolveSelection({ app: "guide-n8n" }, plans, apps).app).toBe(
      "legere",
    );
  });
  it("une valeur inconnue est remplacée, sans état invalide", () => {
    expect(
      resolveSelection({ plan: "x", app: "y", term: "z" }, plans, apps),
    ).toEqual({
      plan: "moyen",
      app: "legere",
      term: "month",
    });
  });
  it("un plan trop petit pour l'application demandée est remplacé par un plan compatible", () => {
    expect(
      resolveSelection({ plan: "petit", app: "lourde" }, plans, apps).plan,
    ).toBe("moyen");
  });
  it("un plan seul choisit une application qui lui convient", () => {
    expect(resolveSelection({ plan: "petit" }, plans, apps)).toMatchObject({
      plan: "petit",
      app: "legere",
    });
  });
  it("une durée non offerte par le plan retombe sur l'autre durée", () => {
    expect(
      resolveSelection({ plan: "gros", term: "year" }, plans, apps).term,
    ).toBe("month");
  });
  it("sans plan ni application installable, la sélection est vide", () => {
    expect(resolveSelection({}, [], [])).toEqual({
      plan: "",
      app: "",
      term: "month",
    });
    expect(
      resolveSelection({}, plans, [apps[2] as (typeof apps)[number]]).app,
    ).toBe("");
  });
  it("sérialise l'adresse du configurateur", () => {
    expect(selectionQuery({ plan: "moyen", app: "legere", term: "year" })).toBe(
      "plan=moyen&app=legere&term=year",
    );
  });
});

describe("clé SSH saisie", () => {
  it("refuse une clé vide", () => {
    expect(checkSshKeyInput("   \n")).toBe("empty");
  });
  it("reconnaît une clé privée et ne la laisse jamais partir", () => {
    expect(
      checkSshKeyInput(
        "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----",
      ),
    ).toBe("private_key");
    expect(checkSshKeyInput("-----BEGIN RSA PRIVATE KEY-----")).toBe(
      "private_key",
    );
    expect(
      checkSshKeyInput("PuTTY-User-Key-File-3: ssh-ed25519\nPrivate-Lines: 1"),
    ).toBe("private_key");
  });
  it("exige une seule ligne", () => {
    expect(checkSshKeyInput("ssh-ed25519 AAAA one\nssh-ed25519 BBBB two")).toBe(
      "multiple_lines",
    );
  });
  it("accepte une ligne (le serveur valide le reste), avec espaces autour", () => {
    expect(
      checkSshKeyInput(
        "  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA vous@poste \n",
      ),
    ).toBeNull();
  });
});

describe("nom du serveur", () => {
  it("vide, ou même règle que le serveur", () => {
    expect(isValidHostname("")).toBe(true);
    expect(isValidHostname("agent-1")).toBe(true);
    expect(isValidHostname("-agent")).toBe(false);
    expect(isValidHostname("Agent")).toBe(false);
    expect(isValidHostname("a".repeat(33))).toBe(false);
    expect(isValidHostname("a".repeat(32))).toBe(true);
  });
});

describe("corps de la commande", () => {
  const base = {
    selection: { plan: "moyen", app: "legere", term: "year" as const },
    sshKey: "  ssh-ed25519 AAAA  ",
    hostname: "",
    requestId: "8a1f3c2e-4b5d-4e6f-9a0b-1c2d3e4f5a6b",
    lang: "fr" as const,
  };
  it("a la forme exacte attendue par l'API, sans hostname vide", () => {
    expect(buildCheckoutBody(base)).toEqual({
      plan: "moyen",
      app: "legere",
      term: "year",
      sshKey: "ssh-ed25519 AAAA",
      requestId: base.requestId,
      lang: "fr",
    });
    expect(buildCheckoutBody({ ...base, hostname: " agent " }).hostname).toBe(
      "agent",
    );
  });
  it("un UUID est un requestId accepté", () => {
    expect(REQUEST_ID.test(base.requestId)).toBe(true);
    expect(REQUEST_ID.test("court")).toBe(false);
  });
});

describe("erreurs de /api/vps/checkout", () => {
  it.each([
    [401, "unauthenticated", "unauthenticated"],
    [403, "forbidden", "forbidden"],
    [422, "invalid_ssh_key", "invalid_ssh_key"],
    [422, "plan_too_small", "plan_too_small"],
    [422, "term_unavailable", "term_unavailable"],
    [422, "invalid_hostname", "invalid_hostname"],
    [409, "plan_not_synced", "plan_not_synced"],
    [409, "limit_reached", "limit_reached"],
    [429, "rate_limited", "rate_limited"],
    [502, "payment_unavailable", "payment_unavailable"],
    [404, "plan_unavailable", "catalog_changed"],
    [422, "app_not_installable", "catalog_changed"],
    [503, "catalog_unavailable", "catalog_changed"],
    [409, "already_processed", "already_processed"],
  ])("%i %s -> %s", (status, code, key) => {
    expect(orderErrorKey(status, code)).toBe(key);
  });
  it("un code inconnu ou hérité de Object.prototype -> message générique", () => {
    expect(orderErrorKey(500, "internal_error")).toBe("generic");
    expect(orderErrorKey(403, "invalid_origin")).toBe("generic");
    expect(orderErrorKey(500, "constructor")).toBe("generic");
  });
  it("sans code lisible, l'état HTTP tranche les cas sans ambiguïté", () => {
    expect(orderErrorKey(401, undefined)).toBe("unauthenticated");
    expect(orderErrorKey(429, undefined)).toBe("rate_limited");
    expect(orderErrorKey(500, undefined)).toBe("generic");
  });
});

describe("redirection vers le paiement", () => {
  it("n'accepte que des adresses http(s)", () => {
    expect(
      isRedirectableUrl("https://checkout.stripe.com/c/pay/cs_test_1"),
    ).toBe(true);
    expect(isRedirectableUrl("javascript:alert(1)")).toBe(false);
    expect(isRedirectableUrl("data:text/html,<p>")).toBe(false);
    expect(isRedirectableUrl("/relative")).toBe(false);
    expect(isRedirectableUrl(undefined)).toBe(false);
  });
  it("lien externe de licence : http(s) seulement", () => {
    expect(externalUrl("https://example.com/LICENSE")).toBe(
      "https://example.com/LICENSE",
    );
    expect(externalUrl("javascript:alert(1)")).toBeNull();
    expect(externalUrl("")).toBeNull();
  });
});

describe("guide d'installation (texte brut)", () => {
  it("une ligne = une étape, sans la numérotation écrite dans le texte", () => {
    expect(
      guideSteps(
        "1. Commandez un VPS.\n2. Installez Docker.\r\n\n3) Suivez la doc.",
      ),
    ).toEqual(["Commandez un VPS.", "Installez Docker.", "Suivez la doc."]);
  });
  it("ne touche pas au reste du texte et n'interprète aucune balise", () => {
    expect(guideSteps("Version 2.0 du <b>guide</b>")).toEqual([
      "Version 2.0 du <b>guide</b>",
    ]);
    expect(guideSteps("")).toEqual([]);
  });
});
