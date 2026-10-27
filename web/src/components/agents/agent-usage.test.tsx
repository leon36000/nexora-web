import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageRow } from "@/server/gateway/usage";
import { AgentUsage, isAgentUsage } from "./agent-usage";

const row = (model: string, requests: number, cost: bigint): UsageRow => ({
  day: "2026-10-27",
  model,
  requests,
  promptTokens: 100 * requests,
  completionTokens: 10 * requests,
  costMicro: cost,
});

describe("consommation par agent de l'espace client", () => {
  const usage = [
    row("nexora/glm-5-3", 3, 900n),
    row("agent/assistant-general", 2, 100_457n),
    row("agent/factures", 1, 50_000n),
  ];
  it("reconnaît les lignes d'agents par l'identifiant public", () => {
    expect(usage.map(isAgentUsage)).toEqual([false, true, true]);
  });
  it("n'affiche que les agents, avec leur total, et laisse les modèles à leur propre tableau", () => {
    const html = renderToStaticMarkup(<AgentUsage lang="fr" usage={usage} />);
    expect(html).toContain("agent/assistant-general");
    expect(html).toContain("agent/factures");
    expect(html).not.toContain("nexora/glm-5-3");
    expect(html).toMatch(/Total<\/th>[\s\S]*?>3</);
  });
  it("annonce l'absence d'exécution, en français et en anglais", () => {
    expect(
      renderToStaticMarkup(
        <AgentUsage lang="fr" usage={[row("nexora/x", 1, 1n)]} />,
      ),
    ).toContain("Aucune exécution d’agent");
    expect(renderToStaticMarkup(<AgentUsage lang="en" usage={[]} />)).toContain(
      "No agent run",
    );
  });
});
