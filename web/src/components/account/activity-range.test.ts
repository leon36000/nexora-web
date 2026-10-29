import { describe, expect, it } from "vitest";
import {
  applyCustomRange,
  torontoDay,
  torontoDayStart,
} from "./activity-range";

describe("jours de Montréal", () => {
  it("minuit à Montréal en heure avancée (UTC-4) et en heure normale (UTC-5)", () => {
    expect(torontoDayStart("2026-10-01").toISOString()).toBe(
      "2026-10-01T04:00:00.000Z",
    );
    expect(torontoDayStart("2026-12-15").toISOString()).toBe(
      "2026-12-15T05:00:00.000Z",
    );
  });
  it("le changement d'heure de novembre : le 1er novembre 2026 est encore en heure avancée, le 2 non", () => {
    expect(torontoDayStart("2026-11-01").toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(torontoDayStart("2026-11-02").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
  it("torontoDay relit le jour local d'un instant", () => {
    expect(torontoDay(new Date("2026-10-01T03:30:00Z"))).toBe("2026-09-30");
    expect(torontoDay(new Date("2026-10-01T04:30:00Z"))).toBe("2026-10-01");
  });
});

describe("période personnalisée du formulaire", () => {
  const params = (q: string) => new URLSearchParams(q);

  it("deux dates : from/to ISO, le jour de fin est inclus, la période est écartée", () => {
    const out = applyCustomRange(
      params("period=30d&fromDay=2026-10-01&toDay=2026-10-07&model=a"),
    );
    expect(out.get("period")).toBeNull();
    expect(out.get("from")).toBe("2026-10-01T04:00:00.000Z");
    expect(out.get("to")).toBe("2026-10-08T04:00:00.000Z");
    expect(out.get("model")).toBe("a");
    expect(out.get("fromDay")).toBeNull();
  });
  it("une seule date, vide ou mal formée : ignorée, la période choisie s'applique", () => {
    for (const q of [
      "period=7d&fromDay=2026-10-01",
      "period=7d&toDay=2026-10-01",
      "period=7d&fromDay=&toDay=",
      "period=7d&fromDay=pas-une-date&toDay=2026-10-07",
      "period=7d&fromDay=2026-02-31&toDay=2026-03-05",
    ]) {
      const out = applyCustomRange(params(q));
      expect(out.get("period")).toBe("7d");
      expect(out.get("from")).toBeNull();
    }
  });
  it("sans champ de dates : paramètres inchangés (liens existants, API)", () => {
    const out = applyCustomRange(params("from=2026-10-01&to=2026-10-05"));
    expect(out.get("from")).toBe("2026-10-01");
    expect(out.get("to")).toBe("2026-10-05");
  });
  it("fin avant le début : laissée à la validation du serveur (invalid_range, page avec avis)", () => {
    const out = applyCustomRange(params("fromDay=2026-10-07&toDay=2026-10-01"));
    expect(out.get("from")).toBe("2026-10-07T04:00:00.000Z");
    expect(out.get("to")).toBe("2026-10-02T04:00:00.000Z");
  });
});
