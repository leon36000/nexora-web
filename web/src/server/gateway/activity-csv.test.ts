import { describe, expect, it } from "vitest";
import type { ActivityRow } from "./activity";
import {
  ACTIVITY_CSV_COLUMNS,
  activityCsvHeader,
  activityCsvRow,
  CSV_BOM,
  csvText,
  formatMicroDecimal,
} from "./activity-csv";

describe("montants en micro-CAD : formatage exact (bigint, jamais de flottant)", () => {
  it("garde toujours six décimales", () => {
    expect(formatMicroDecimal(0n)).toBe("0.000000");
    expect(formatMicroDecimal(5n)).toBe("0.000005");
    expect(formatMicroDecimal(250n)).toBe("0.000250");
    expect(formatMicroDecimal(1_000_000n)).toBe("1.000000");
    expect(formatMicroDecimal(1_234_567_890_123n)).toBe("1234567.890123");
  });

  it("reste exact au-delà de 2^53 (un flottant arrondirait)", () => {
    // 9 007 199 254 740 993 n'est pas représentable en Number : il deviendrait ...992.
    expect(formatMicroDecimal(9_007_199_254_740_993n)).toBe(
      "9007199254.740993",
    );
    expect(formatMicroDecimal(123_456_789_012_345_678_901n)).toBe(
      "123456789012345.678901",
    );
  });

  it("garde le signe d'un montant négatif", () => {
    expect(formatMicroDecimal(-5n)).toBe("-0.000005");
    expect(formatMicroDecimal(-1_500_000n)).toBe("-1.500000");
  });
});

describe("cellule de texte CSV : protection contre l'injection de formules", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+33 1 23", "'+33 1 23"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tTabulation", "'\tTabulation"],
    ["\rRetour", `"'\rRetour"`],
  ])("préfixe une apostrophe devant %j", (input, expected) => {
    expect(csvText(input)).toBe(expected);
  });

  it("neutralise une formule malveillante dans un nom de clé, puis la met entre guillemets", () => {
    expect(csvText('=HYPERLINK("http://evil.example","clic")')).toBe(
      `"'=HYPERLINK(""http://evil.example"",""clic"")"`,
    );
  });

  it("ne touche pas au texte ordinaire", () => {
    expect(csvText("nexora/test")).toBe("nexora/test");
    expect(csvText("agent/facturation")).toBe("agent/facturation");
    expect(csvText("a=b")).toBe("a=b"); // seul le premier caractère compte
    expect(csvText("Clé de production")).toBe("Clé de production");
  });

  it("met entre guillemets les virgules, guillemets et sauts de ligne, et double les guillemets", () => {
    expect(csvText("a,b")).toBe('"a,b"');
    expect(csvText('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvText("ligne1\nligne2")).toBe('"ligne1\nligne2"');
    expect(csvText("ligne1\r\nligne2")).toBe('"ligne1\r\nligne2"');
  });

  it("une valeur absente ou vide donne une cellule vide", () => {
    expect(csvText(null)).toBe("");
    expect(csvText(undefined)).toBe("");
    expect(csvText("")).toBe("");
  });
});

const row: ActivityRow = {
  id: "11111111-1111-4111-8111-111111111111",
  requestId: "req_abc",
  createdAt: new Date("2026-10-29T12:34:56.789Z"),
  model: "nexora/test",
  endpoint: "chat.completions",
  apiKeyId: "22222222-2222-4222-8222-222222222222",
  apiKeyName: "Production",
  apiKeyPrefix: "nxk_abcdefg",
  status: "ok",
  httpStatus: 200,
  errorCode: null,
  stream: true,
  promptTokens: 100,
  completionTokens: 50,
  cachedTokens: 20,
  reasoningTokens: 0,
  costMicro: 250n,
  valueMicro: 250n,
  billed: true,
  latencyMs: 812,
};

describe("ligne du journal en CSV", () => {
  it("l'en-tête porte les colonnes, dans l'ordre, avec des fins de ligne CRLF", () => {
    const header = activityCsvHeader();
    expect(header.endsWith("\r\n")).toBe(true);
    expect(header.trimEnd().split(",")).toEqual([...ACTIVITY_CSV_COLUMNS]);
    expect(ACTIVITY_CSV_COLUMNS).toContain("cost_cad");
    expect(CSV_BOM).toBe("\uFEFF");
  });

  it("sérialise une requête avec des montants exacts et sans contenu de requête", () => {
    expect(activityCsvRow(row)).toBe(
      "2026-10-29T12:34:56.789Z,req_abc,nexora/test,chat.completions,Production,nxk_abcdefg,ok,200,,true,100,50,20,0,0.000250,0.000250,true,812\r\n",
    );
  });

  it("chaque cellule de texte venant du client est protégée (nom de clé, code d'erreur)", () => {
    const line = activityCsvRow({
      ...row,
      apiKeyName: "=cmd|' /C calc'!A0",
      errorCode: "+upstream",
      status: "error",
      httpStatus: 502,
    });
    expect(line).toContain("'=cmd|' /C calc'!A0");
    expect(line).toContain(",'+upstream,");
    // Aucune cellule ne commence par un caractère de formule.
    for (const cell of line.trimEnd().split(","))
      expect(cell).not.toMatch(/^[=+\-@\t\r]/);
  });

  it("autant de cellules que de colonnes", () => {
    expect(activityCsvRow(row).trimEnd().split(",")).toHaveLength(
      ACTIVITY_CSV_COLUMNS.length,
    );
  });
});
