import { describe, expect, test } from "bun:test";
import {
  emptyModelForm,
  formToBody,
  modelToForm,
  sheetExtras,
  slugModelId,
  validateStep,
} from "./model-form";

const deepseek = {
  id: "m1",
  publicId: "nexora/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash 1017",
  descriptionFr: "Modèle rapide.",
  descriptionEn: "Fast model.",
  kind: "chat",
  providerId: "p1",
  upstreamId: "deepseek-flash",
  contextMax: 1_048_576,
  maxOutputTokens: 393_216,
  capabilities: {
    streaming: true,
    tools: true,
    reasoning: true,
    json_mode: true,
    vision: true,
  },
  residency: "autre",
  visibility: "public",
  status: "draft",
  sunsetAt: null,
  sheet: {
    family: "DeepSeek V4.1",
    releasedAt: "2026-10-17",
    license: { name: "MIT", openWeights: true },
    parameters: { totalB: 763 },
    modalities: { input: ["text", "image"], output: ["text"] },
    benchmarks: [
      {
        name: "DeepSWE v1.1",
        score: 77,
        unit: "%",
        publisher: "DeepSeek",
        sourceUrl: "https://huggingface.co/x",
      },
    ],
    sources: [
      {
        label: "Tarifs",
        url: "https://api-docs.deepseek.com/p",
        readAt: "2026-10-28",
      },
    ],
    notesFr: "Deux tarifs selon l'heure.",
    notesEn: "Two prices by hour.",
  },
  routing: {
    dataCollection: "deny",
    allowFallbacks: true,
    maxPriceUsdMicro: { input: "300000", output: "1200000" },
    order: ["deepinfra/fp8"],
  },
};

describe("aller-retour fiche -> formulaire -> corps", () => {
  test("rien de ce que l'assistant n'édite pas n'est perdu (mesures, sources, routage avancé)", () => {
    const body = formToBody(modelToForm(deepseek), deepseek);
    expect(body.sheet).toEqual(deepseek.sheet);
    expect(body.routing).toEqual(deepseek.routing);
    expect(body).toMatchObject({
      name: deepseek.name,
      descriptionFr: deepseek.descriptionFr,
      kind: "chat",
      providerId: "p1",
      upstreamId: "deepseek-flash",
      contextMax: 1_048_576,
      maxOutputTokens: 393_216,
      residency: "autre",
      visibility: "public",
      sunsetAt: null,
    });
    expect(body.capabilities).toEqual(deepseek.capabilities);
    expect(body).not.toHaveProperty("publicId");
    expect(body).not.toHaveProperty("status");
  });
  test("une modification de la fiche remplace seulement les champs édités", () => {
    const form = modelToForm(deepseek);
    form.family = "DeepSeek V4.2";
    form.totalB = "800";
    form.activeB = "40";
    form.knowledgeCutoff = "2026-06";
    const body = formToBody(form, deepseek);
    expect(body.sheet).toMatchObject({
      family: "DeepSeek V4.2",
      parameters: { totalB: 800, activeB: 40 },
      knowledgeCutoff: "2026-06",
      benchmarks: deepseek.sheet.benchmarks,
    });
  });
  test("vider un champ le retire de la fiche (jamais de valeur inventée)", () => {
    const form = modelToForm(deepseek);
    form.family = "";
    form.licenseName = "";
    form.openWeights = "";
    form.inputModalities = [];
    form.outputModalities = [];
    const sheet = formToBody(form, deepseek).sheet as Record<string, unknown>;
    expect(sheet).not.toHaveProperty("family");
    expect(sheet).not.toHaveProperty("license");
    expect(sheet).not.toHaveProperty("modalities");
    expect(sheet.benchmarks).toBeDefined();
  });
  test("une capacité explicitement fausse n'est pas perdue", () => {
    const m = { ...deepseek, capabilities: { tools: true, vision: false } };
    expect(formToBody(modelToForm(m), m).capabilities).toEqual({
      tools: true,
      vision: false,
    });
    const f = modelToForm(m);
    delete f.capabilities.vision;
    expect(formToBody(f, m).capabilities).toEqual({ tools: true });
  });
  test("licence sans nom (poids ouverts seulement) et date de retrait conservée telle quelle", () => {
    const m = {
      ...deepseek,
      sunsetAt: "2027-06-30T12:00:00.000Z",
      sheet: { license: { openWeights: false } },
    };
    const form = modelToForm(m);
    expect(form.openWeights).toBe("closed");
    expect(form.sunsetAt).toBe("2027-06-30");
    const body = formToBody(form, m);
    expect(body.sheet).toEqual({ license: { openWeights: false } });
    expect(body.sunsetAt).toBe("2027-06-30T12:00:00.000Z");
    form.sunsetAt = "2027-07-31";
    expect(formToBody(form, m).sunsetAt).toBe("2027-07-31T00:00:00.000Z");
  });
  test("création : identifiant public inclus, fiche vide si rien n'est saisi", () => {
    const f = {
      ...emptyModelForm(),
      publicId: "nexora/essai",
      name: "Essai",
      providerId: "p",
      upstreamId: "u",
    };
    const body = formToBody(f, null);
    expect(body.publicId).toBe("nexora/essai");
    expect(body.sheet).toEqual({});
    expect(body.routing).toEqual({});
    expect(body.contextMax).toBe(32_000);
    expect(body.maxOutputTokens).toBeNull();
  });
});

describe("validation par étape", () => {
  const good = () => ({
    ...emptyModelForm(),
    publicId: "nexora/deepinfra-llama",
    name: "Llama",
    providerId: "p",
    upstreamId: "meta-llama/x",
  });
  test("identité", () => {
    expect(validateStep("identity", good(), [])).toEqual({});
    const e = validateStep(
      "identity",
      { ...good(), publicId: "autre/x", name: "" },
      [],
    );
    expect(e.publicId).toContain("nexora/");
    expect(e.name).toBeDefined();
    expect(
      validateStep("identity", good(), ["nexora/deepinfra-llama"]).publicId,
    ).toContain("déjà");
    // en modification l'identifiant ne se contrôle plus
    expect(
      validateStep("identity", { ...good(), id: "m", publicId: "x" }, [])
        .publicId,
    ).toBeUndefined();
  });
  test("fiche technique : dates, licence, paramètres, contexte", () => {
    expect(validateStep("sheet", good(), [])).toEqual({});
    const e = validateStep(
      "sheet",
      {
        ...good(),
        releasedAt: "2026-13-45",
        knowledgeCutoff: "2026-6",
        licenseName: "MIT",
        openWeights: "",
        licenseUrl: "http://x",
        totalB: "10",
        activeB: "20",
        contextMax: "0",
      },
      [],
    );
    expect(Object.keys(e).sort()).toEqual([
      "activeB",
      "contextMax",
      "knowledgeCutoff",
      "licenseUrl",
      "openWeights",
      "releasedAt",
    ]);
    expect(
      validateStep(
        "sheet",
        {
          ...good(),
          releasedAt: "2026-10-17",
          knowledgeCutoff: "2026-06",
          totalB: "7,5",
        },
        [],
      ),
    ).toEqual({});
    expect(
      validateStep("sheet", { ...good(), contextMax: "abc" }, []).contextMax,
    ).toBeDefined();
  });
  test("fournisseur", () => {
    expect(
      validateStep("provider", { ...good(), providerId: "" }, []).providerId,
    ).toBeDefined();
    expect(
      validateStep("provider", { ...good(), upstreamId: " " }, []).upstreamId,
    ).toBeDefined();
    expect(validateStep("provider", good(), [])).toEqual({});
  });
});

describe("aides", () => {
  test("identifiant public déduit du nom", () => {
    expect(slugModelId("GLM 5.3 Flash")).toBe("nexora/glm-5.3-flash");
    expect(slugModelId("Kimi K3.1 Pro")).toBe("nexora/kimi-k3.1-pro");
    expect(slugModelId("Éole 7B")).toBe("nexora/eole-7b");
    expect(slugModelId("")).toBe("");
  });
  test("mesures et sources sont montrées en lecture seule", () => {
    const x = sheetExtras(deepseek.sheet);
    expect(x.benchmarks).toEqual([
      {
        text: "DeepSWE v1.1 : 77 % (DeepSeek)",
        url: "https://huggingface.co/x",
      },
    ]);
    expect(x.sources).toEqual([
      {
        text: "Tarifs (lu le 2026-10-28)",
        url: "https://api-docs.deepseek.com/p",
      },
    ]);
    expect(sheetExtras({}).benchmarks).toEqual([]);
  });
});

describe("disponibilité (aperçu) dans l'assistant", () => {
  test("un nouveau modèle est en service par défaut, l'aperçu est une case à cocher", () => {
    expect(emptyModelForm().availability).toBe("live");
  });
  test("un modèle enregistré en aperçu rouvre en aperçu ; sans mention, en service", () => {
    expect(
      modelToForm({ ...deepseek, availability: "preview" } as never)
        .availability,
    ).toBe("preview");
    expect(modelToForm(deepseek as never).availability).toBe("live");
  });
  test("le corps envoyé porte la disponibilité choisie", () => {
    const form = { ...emptyModelForm(), availability: "preview" as const };
    expect(formToBody(form, null).availability).toBe("preview");
    const live = modelToForm(deepseek as never);
    expect(formToBody(live, deepseek as never).availability).toBe("live");
  });
});
