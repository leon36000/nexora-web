import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getGatewayDictionary } from "@/i18n/gateway";
import type { PublicModel } from "@/server/gateway/public";
import { ModelSheet } from "./model-sheet";

const base: PublicModel = {
  id: "nexora/deepseek-v4.1-flash-1017",
  name: "DeepSeek V4.1 Flash 1017",
  descriptionFr: "",
  descriptionEn: "",
  kind: "chat",
  availability: "live",
  contextMax: 1_048_576,
  maxOutputTokens: 393_216,
  capabilities: {},
  residency: "autre",
  providerName: "DeepSeek",
  dataPolicyFr: "",
  dataPolicyEn: "",
  inputPerMillion: "0.462",
  outputPerMillion: "1.848",
  cachePerMillion: null,
  cacheWritePerMillion: null,
  priceWindows: [],
  sheet: {},
  note: "",
  sunsetAt: null,
};

const render = (model: PublicModel, lang: "fr" | "en" = "fr") =>
  renderToStaticMarkup(
    <ModelSheet model={model} t={getGatewayDictionary(lang)} lang={lang} />,
  );

describe("fiche technique d'un modèle", () => {
  it("n'affiche rien pour un modèle sans fiche ni tarif horaire", () => {
    expect(render(base)).toBe("");
  });

  it("affiche licence, paramètres, mesures avec lien vers la source, et sources lues", () => {
    const html = render({
      ...base,
      sheet: {
        family: "DeepSeek V4.1",
        releasedAt: "2026-10-17",
        license: { name: "MIT", openWeights: true },
        parameters: { totalB: 320, activeB: 18 },
        modalities: { input: ["text", "image"], output: ["text"] },
        benchmarks: [
          {
            name: "DeepSWE v1.1",
            score: 77,
            unit: "%",
            publisher: "DeepSeek",
            sourceUrl:
              "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017",
          },
        ],
        sources: [
          {
            label: "DeepSeek, tarifs",
            url: "https://api-docs.deepseek.com/quick_start/pricing",
            readAt: "2026-10-28",
          },
        ],
      },
    });
    expect(html).toContain("Fiche technique");
    expect(html).toContain("MIT");
    expect(html).toContain("Poids ouverts");
    expect(html).toContain("320 G au total");
    expect(html).toContain("18 G actifs");
    expect(html).toContain("texte, image");
    expect(html).toContain("DeepSWE v1.1");
    expect(html).toContain(
      'href="https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017"',
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("lue le 2026-10-28");
  });

  it("dit qu'aucune mesure n'est publiée plutôt que d'en inventer", () => {
    const html = render({
      ...base,
      sheet: { family: "Kimi K3", license: { openWeights: false } },
    });
    expect(html).toContain("Aucune mesure officielle");
    expect(html).toContain("Texte non lu");
    expect(html).toContain("Poids non publiés");
    expect(html).not.toContain("<table");
  });

  it("affiche les plages horaires et l'écriture du cache, en anglais aussi", () => {
    const html = render(
      {
        ...base,
        cacheWritePerMillion: "3.08",
        priceWindows: [
          {
            label: "off-peak",
            days: [1, 2, 3, 4, 5],
            startMinute: 600,
            endMinute: 1440,
            inputPerMillion: "0.231",
            outputPerMillion: "0.924",
            cachePerMillion: null,
          },
        ],
      },
      "en",
    );
    expect(html).toContain("Time-of-day pricing");
    expect(html).toContain("Mon–Fri");
    expect(html).toContain("10 h 00–00 h 00");
    expect(html).toContain("Cache write");
  });
});
