import { describe, expect, it } from "vitest";
import { parseActivityParams } from "@/server/gateway/activity";
import { activityQuery } from "./activity-links";

const NOW = new Date("2026-10-29T15:00:00.000Z");
const KEY = "3f2b8c1e-5d4a-4b6c-9e7f-0a1b2c3d4e5f";

describe("adresses de l'activité (filtres, pagination, export)", () => {
  it("période prédéfinie : seulement les critères choisis, dans un ordre stable", () => {
    expect(activityQuery({ period: "7d" })).toBe("period=7d");
    expect(
      activityQuery({
        period: "30d",
        model: "agent/facturation",
        apiKeyId: KEY,
        status: "error",
      }),
    ).toBe(`period=30d&model=agent%2Ffacturation&key=${KEY}&status=error`);
  });

  it("période personnalisée : dates ISO complètes à la place de la période", () => {
    expect(
      activityQuery({
        period: "custom",
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-02-01T00:00:00Z"),
      }),
    ).toBe("from=2026-01-01T00%3A00%3A00.000Z&to=2026-02-01T00%3A00%3A00.000Z");
  });

  it("le curseur s'ajoute en dernier", () => {
    expect(activityQuery({ period: "24h", cursor: "abc_-123" })).toBe(
      "period=24h&cursor=abc_-123",
    );
    expect(activityQuery({ period: "24h", cursor: null })).toBe("period=24h");
  });

  it("l'adresse produite est relue à l'identique par l'API (aller-retour)", () => {
    const query = activityQuery({
      period: "90d",
      model: "nexora/test",
      apiKeyId: KEY,
      status: "aborted",
    });
    const parsed = parseActivityParams(new URLSearchParams(query), NOW);
    expect(parsed).toMatchObject({
      ok: true,
      period: "90d",
      filter: { model: "nexora/test", apiKeyId: KEY, status: "aborted" },
    });
    const custom = parseActivityParams(
      new URLSearchParams(
        activityQuery({
          period: "custom",
          from: new Date("2026-03-01T00:00:00Z"),
          to: new Date("2026-04-01T12:30:00Z"),
        }),
      ),
      NOW,
    );
    expect(custom).toMatchObject({ ok: true, period: "custom" });
  });
});
