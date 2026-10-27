import { hostedAgents, sql } from "@nexora/db";
import { createTestDatabase, type TestDatabase } from "@nexora/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AgentError,
  addAgentPrice,
  agentIssues,
  applyDiscovery,
  createInstance,
  currentAgentPrice,
  findCallableAgent,
  getEmbedSettings,
  listCallableAgents,
  saveEmbedSettings,
  slugify,
  updateAgent,
} from "./catalog";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.drop();
});

let n = 0;
async function instance(options: { secretRef?: string | null } = {}) {
  n += 1;
  return createInstance(t.db, {
    code: `ws-${n}`,
    name: `WorkStudio ${n}`,
    baseUrl: "http://127.0.0.1:3200",
    secretRef:
      options.secretRef === undefined ? `workstudio.k${n}` : options.secretRef,
  });
}

/** Un agent découvert puis complété comme le ferait un administrateur. */
async function draftAgent(name = "Assistant général") {
  const inst = await instance();
  const found = await applyDiscovery(
    t.db,
    inst.id,
    [
      {
        upstreamId: `agent:${name}`,
        name,
        description: "Répond aux questions.",
      },
    ],
    new Date(),
  );
  const agent = found.created[0];
  if (!agent) throw new Error("agent non créé");
  return { inst, agent };
}

const complete = {
  nameEn: "General assistant",
  descriptionEn: "Answers questions.",
};

describe("slugify", () => {
  it("produit un identifiant public sûr", () => {
    expect(slugify("Assistant général")).toBe("assistant-general");
    expect(slugify("  Agent_Facturation  (v2) ")).toBe("agent-facturation-v2");
    expect(slugify("!!!")).toBe("agent");
    expect(slugify("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });
});

describe("découverte des agents", () => {
  it("crée des brouillons et ne publie jamais seule", async () => {
    const inst = await instance();
    const result = await applyDiscovery(
      t.db,
      inst.id,
      [
        {
          upstreamId: "agent:Factures",
          name: "Factures",
          description: "Lit les factures.",
        },
        { upstreamId: "agent:Courriels", name: "Courriels", description: "" },
      ],
      new Date(),
    );
    expect(result.created.map((a) => a.slug).sort()).toEqual([
      "courriels",
      "factures",
    ]);
    for (const a of result.created) {
      expect(a.status).toBe("draft");
      expect(a.nameFr).toBe(a.upstreamName);
      // L'anglais n'est jamais prérempli avec du français : l'administrateur le rédige.
      expect(a.nameEn).toBe("");
      expect(a.descriptionEn).toBe("");
    }
    expect(await listCallableAgents(t.db, new Date())).toEqual([]);
  });

  it("est idempotente et ne touche pas aux champs édités", async () => {
    const { inst, agent } = await draftAgent("Idempotent");
    await updateAgent(t.db, agent.id, { nameFr: "Nom édité", ...complete });
    const again = await applyDiscovery(
      t.db,
      inst.id,
      [
        {
          upstreamId: "agent:Idempotent",
          name: "Idempotent",
          description: "Autre texte",
        },
      ],
      new Date(),
    );
    expect(again.created).toEqual([]);
    expect(again.seen.map((a) => a.id)).toEqual([agent.id]);
    const [row] = await t.db.select().from(hostedAgents);
    expect(row).toBeDefined();
    const kept = again.seen[0];
    expect(kept?.nameFr).toBe("Nom édité");
  });

  it("retrouve un agent dont l'identifiant amont a été remplacé par celui du workflow", async () => {
    const { inst, agent } = await draftAgent("Retrouvé");
    await updateAgent(t.db, agent.id, {
      upstreamId: "agent:641a6a96-ce5c-43e2-9be4-b41a6c9e1c21",
    });
    const again = await applyDiscovery(
      t.db,
      inst.id,
      [{ upstreamId: "agent:Retrouvé", name: "Retrouvé", description: "" }],
      new Date(),
    );
    expect(again.created).toEqual([]);
    expect(again.seen[0]?.id).toBe(agent.id);
  });

  it("signale les agents qui ne sont plus publiés chez WorkStudio, sans les retirer", async () => {
    const { inst, agent } = await draftAgent("Disparu");
    const result = await applyDiscovery(t.db, inst.id, [], new Date());
    expect(result.missing.map((a) => a.id)).toEqual([agent.id]);
    expect(result.missing[0]?.status).toBe("draft");
  });

  it("donne un slug unique aux homonymes", async () => {
    const inst = await instance();
    const other = await instance();
    const a = await applyDiscovery(
      t.db,
      inst.id,
      [{ upstreamId: "agent:Doublon", name: "Doublon", description: "" }],
      new Date(),
    );
    const b = await applyDiscovery(
      t.db,
      other.id,
      [{ upstreamId: "agent:Doublon", name: "Doublon", description: "" }],
      new Date(),
    );
    expect(a.created[0]?.slug).toBe("doublon");
    expect(b.created[0]?.slug).toBe("doublon-2");
  });
});

describe("prix", () => {
  it("garde l'historique et applique la ligne en vigueur", async () => {
    const { agent } = await draftAgent("Prix historique");
    const t0 = new Date("2026-01-01T00:00:00Z");
    await addAgentPrice(
      t.db,
      agent.id,
      { perRunCadMicro: 10_000n, effectiveAt: t0 },
      t0,
    );
    await addAgentPrice(
      t.db,
      agent.id,
      {
        perRunCadMicro: 20_000n,
        effectiveAt: new Date("2026-06-01T00:00:00Z"),
      },
      t0,
    );
    const march = await currentAgentPrice(
      t.db,
      agent.id,
      new Date("2026-03-01T00:00:00Z"),
    );
    const july = await currentAgentPrice(
      t.db,
      agent.id,
      new Date("2026-07-01T00:00:00Z"),
    );
    expect(march?.perRunCadMicro).toBe(10_000n);
    expect(july?.perRunCadMicro).toBe(20_000n);
    expect(
      await currentAgentPrice(t.db, agent.id, new Date("2025-01-01T00:00:00Z")),
    ).toBeNull();
  });

  it("refuse un prix à 0 $ et marque l'essai par défaut", async () => {
    const { agent } = await draftAgent("Prix zéro");
    await expect(
      addAgentPrice(t.db, agent.id, { perRunCadMicro: 0n }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    const row = await addAgentPrice(t.db, agent.id, { perRunCadMicro: 1n });
    expect(row.isTrial).toBe(true);
  });
});

describe("publication", () => {
  it("liste tout ce qui manque pour publier", async () => {
    const { agent } = await draftAgent("Incomplet");
    const issues = await agentIssues(t.db, agent.id, new Date());
    expect(issues.map((i) => i.code).sort()).toEqual([
      "description_en_missing",
      "name_en_missing",
      "price_missing",
    ]);
    await expect(
      updateAgent(t.db, agent.id, { status: "published" }),
    ).rejects.toMatchObject({ code: "publication_refused" });
  });

  it("refuse la publication d'une instance sans clé ou désactivée", async () => {
    const inst = await instance({ secretRef: null });
    const found = await applyDiscovery(
      t.db,
      inst.id,
      [{ upstreamId: "agent:SansCle", name: "SansCle", description: "Texte" }],
      new Date(),
    );
    const agent = found.created[0];
    if (!agent) throw new Error("agent");
    await updateAgent(t.db, agent.id, complete);
    await addAgentPrice(t.db, agent.id, { perRunCadMicro: 5_000n });
    const issues = await agentIssues(t.db, agent.id, new Date());
    expect(issues.map((i) => i.code)).toEqual(["instance_unavailable"]);
  });

  it("publie un agent complet, puis le rend appelable seulement tant qu'il est publié", async () => {
    const { agent } = await draftAgent("Publiable");
    await updateAgent(t.db, agent.id, complete);
    const now = new Date();
    await addAgentPrice(
      t.db,
      agent.id,
      {
        inputCadMicro: 1_000_000n,
        outputCadMicro: 3_000_000n,
        perRunCadMicro: 50_000n,
        effectiveAt: new Date(now.getTime() - 1000),
      },
      now,
    );
    const published = await updateAgent(
      t.db,
      agent.id,
      { status: "published" },
      now,
    );
    expect(published.status).toBe("published");
    expect(published.publishedAt).not.toBeNull();

    const callable = await findCallableAgent(t.db, `agent/${agent.slug}`, now);
    expect(callable).toMatchObject({
      publicId: `agent/${agent.slug}`,
      upstreamId: "agent:Publiable",
      runTokenCap: 32000,
    });
    expect(callable?.price).toMatchObject({
      inputCadMicro: 1_000_000n,
      outputCadMicro: 3_000_000n,
      perRunCadMicro: 50_000n,
      isTrial: true,
    });
    expect(callable?.instance.secretRef).toMatch(/^workstudio\./);

    await updateAgent(t.db, agent.id, { status: "retired" }, now);
    expect(
      await findCallableAgent(t.db, `agent/${agent.slug}`, now),
    ).toBeNull();
  });

  it("n'expose pas un agent publié dont l'instance est désactivée ou dont le prix n'est pas encore en vigueur", async () => {
    const { inst, agent } = await draftAgent("Instance coupée");
    await updateAgent(t.db, agent.id, complete);
    const now = new Date();
    await addAgentPrice(
      t.db,
      agent.id,
      { perRunCadMicro: 5_000n, effectiveAt: new Date(now.getTime() - 1000) },
      now,
    );
    await updateAgent(t.db, agent.id, { status: "published" }, now);
    expect(
      await findCallableAgent(t.db, `agent/${agent.slug}`, now),
    ).not.toBeNull();
    await t.sql`UPDATE hosted_agent_instances SET enabled = false WHERE id = ${inst.id}`;
    expect(
      await findCallableAgent(t.db, `agent/${agent.slug}`, now),
    ).toBeNull();
    await t.sql`UPDATE hosted_agent_instances SET enabled = true WHERE id = ${inst.id}`;
    expect(
      await findCallableAgent(
        t.db,
        `agent/${agent.slug}`,
        new Date(now.getTime() - 3_600_000),
      ),
    ).toBeNull();
  });

  it("n'accepte que des transitions valides", async () => {
    const { agent } = await draftAgent("Transitions");
    await updateAgent(t.db, agent.id, { status: "retired" });
    await expect(
      updateAgent(t.db, agent.id, { status: "published" }),
    ).rejects.toBeInstanceOf(AgentError);
    await updateAgent(t.db, agent.id, { status: "draft" });
  });

  it("refuse un identifiant amont sans le préfixe agent:", async () => {
    const { agent } = await draftAgent("Prefixe");
    await expect(
      updateAgent(t.db, agent.id, { upstreamId: "gpt-4" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("réglage de la bulle WorkStudio", () => {
  it("est désactivé par défaut", async () => {
    const s = await getEmbedSettings(t.db);
    expect(s).toMatchObject({ enabled: false, origin: null, pages: [] });
  });

  it("normalise l'origine et les pages, et refuse le reste", async () => {
    const saved = await saveEmbedSettings(t.db, {
      enabled: true,
      origin: "HTTPS://IA.Exemple.CA/",
      chatIdentifier: "support",
      pages: ["/agents/", "/workstudio"],
      position: "left",
      color: "#0a7d33",
    });
    expect(saved).toMatchObject({
      enabled: true,
      origin: "https://ia.exemple.ca",
      pages: ["/agents", "/workstudio"],
      position: "left",
    });
    for (const origin of [
      "http://ia.exemple.ca",
      "https://ia.exemple.ca/chemin",
      "https://*.exemple.ca",
      "https://user:pw@ia.exemple.ca",
      "javascript:alert(1)",
    ])
      await expect(saveEmbedSettings(t.db, { origin })).rejects.toMatchObject({
        code: "invalid_request",
      });
    await expect(
      saveEmbedSettings(t.db, { pages: ["agents"] }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      saveEmbedSettings(t.db, { chatIdentifier: "Pas Valide!" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      saveEmbedSettings(t.db, { color: "rouge" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("refuse d'activer la bulle sans origine ni identifiant de chat", async () => {
    await saveEmbedSettings(t.db, {
      enabled: false,
      origin: null,
      chatIdentifier: null,
    });
    await expect(
      saveEmbedSettings(t.db, { enabled: true }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("accepte http seulement pour un hôte local de développement", async () => {
    const saved = await saveEmbedSettings(t.db, {
      origin: "http://localhost:3200",
      chatIdentifier: "assistant-1",
      enabled: true,
    });
    expect(saved.origin).toBe("http://localhost:3200");
  });
});

void sql;
