import {
  apiKeys,
  eq,
  getAccount,
  ragChunks,
  ragDocuments,
  usageEvents,
} from "@nexora/db";
import { chunkStorageBytes, chunkText, embeddingInput } from "@nexora/rag";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savePolicy } from "../privacy/store";
import {
  createBase,
  createBaseWithKey,
  createRagKey,
  deleteBase,
  getBase,
  listBases,
} from "./bases";
import {
  addDocument,
  deleteDocument,
  getDocument,
  indexSlice,
  listDocuments,
  resolveBillingKey,
} from "./documents";
import { searchBase } from "./search";
import {
  EMBED_MODEL,
  type RagTestEnv,
  RERANK_MODEL,
  ragTestEnv,
} from "./test-support";

let env: RagTestEnv;
beforeAll(async () => {
  env = await ragTestEnv({ config: { inlineMaxChunks: 4, embedBatch: 2 } });
});
afterAll(async () => {
  await env.close();
});
beforeEach(() => {
  env.upstream.embedInputs = [];
  env.upstream.embedCalls = 0;
  env.upstream.rerankCalls = [];
  env.upstream.embedFailStatus = 0;
  env.upstream.embedDims = 1024;
  env.upstream.rerankScores = null;
  env.jobs.length = 0;
  env.logLines.length = 0;
});

const ok = <T>(
  r:
    | { ok: true; value: T }
    | { ok: false; failure: { code: string; message: string } },
): T => {
  if (!r.ok)
    throw new Error(
      `échec inattendu : ${r.failure.code} — ${r.failure.message}`,
    );
  return r.value;
};
const keyRow = async (id: string) => {
  const row = await env.t.db.query.apiKeys.findFirst({
    where: (k, { eq: e }) => e(k.id, id),
  });
  if (!row) throw new Error("clé absente");
  return row;
};

/** Organisation financée, base « en un clic » et sa clé. */
async function setup(balance?: bigint, name = "Base de test") {
  const org = await env.org(balance);
  const made = ok(
    await createBaseWithKey(env.deps, {
      organizationId: org,
      userId: null,
      name,
    }),
  );
  const key = await keyRow(made.keyId);
  return {
    org,
    base: made.base,
    key,
    secret: made.key,
    ctx: { organizationId: org, key },
  };
}
const balanceOf = async (org: string) => {
  return (await getAccount(env.t.db, org)).balanceMicro;
};

const DOCS = {
  facturation:
    "# Facturation\n\nLes factures sont émises le premier jour du mois. Le paiement se fait par carte de crédit ou par virement bancaire. Une facture impayée après trente jours entraîne la suspension du compte.",
  vacances:
    "# Vacances\n\nLes employés ont droit à quinze jours de vacances payées par année. Les demandes de congé se font auprès du gestionnaire au moins deux semaines à l'avance.",
  securite:
    "# Sécurité\n\nTous les mots de passe doivent contenir douze caractères. L'authentification à deux facteurs est obligatoire pour les accès à distance au réseau de l'entreprise.",
};

describe("création d'une base en un clic", () => {
  it("crée la base, sa clé dédiée (écriture, limitée à cette base) et ne montre la valeur de la clé qu'une fois, hachée au repos", async () => {
    const org = await env.org();
    const made = ok(
      await createBaseWithKey(env.deps, {
        organizationId: org,
        userId: "u1",
        name: "Contrats",
      }),
    );
    expect(made.key).toMatch(/^nxk_[A-Za-z0-9_-]{43}$/);
    expect(made.base).toMatchObject({
      organizationId: org,
      name: "Contrats",
      embeddingModel: EMBED_MODEL,
      rerankModel: RERANK_MODEL,
      chunkChars: 3200,
      chunkOverlap: 400,
    });
    const row = await keyRow(made.keyId);
    expect(row.ragAccess).toEqual({ bases: [made.base.id], mode: "write" });
    expect(row.allowedModels?.sort()).toEqual(
      [EMBED_MODEL, RERANK_MODEL].sort(),
    );
    expect(row.keyHash).not.toContain(made.key);
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.name).toContain("Contrats");
  });

  it("refuse un modèle d'embedding non pris en charge, absent du catalogue, ou un nom en double", async () => {
    const org = await env.org();
    const bad = await createBase(env.deps, {
      organizationId: org,
      userId: null,
      name: "A",
      embeddingModel: "nexora/inconnu",
    });
    expect(bad).toMatchObject({
      ok: false,
      failure: { code: "unsupported_embedding_model" },
    });
    const unlisted = await createBase(env.deps, {
      organizationId: org,
      userId: null,
      name: "B",
      embeddingModel: "nexora/embeddinggemma-2",
    });
    expect(unlisted).toMatchObject({
      ok: false,
      failure: { code: "model_unavailable" },
    });
    ok(
      await createBase(env.deps, {
        organizationId: org,
        userId: null,
        name: "Doublon",
      }),
    );
    const again = await createBase(env.deps, {
      organizationId: org,
      userId: null,
      name: "Doublon",
    });
    expect(again).toMatchObject({
      ok: false,
      failure: { code: "base_exists", status: 409 },
    });
  });

  it("limite le nombre de bases par organisation", async () => {
    const org = await env.org();
    const small = {
      ...env.deps,
      config: { ...env.deps.config, maxBasesPerOrg: 2 },
    };
    ok(
      await createBase(small, { organizationId: org, userId: null, name: "1" }),
    );
    ok(
      await createBase(small, { organizationId: org, userId: null, name: "2" }),
    );
    expect(
      await createBase(small, { organizationId: org, userId: null, name: "3" }),
    ).toMatchObject({ ok: false, failure: { code: "base_limit" } });
  });

  it("sans reclassement par défaut : la base se crée, sans modèle de reclassement", async () => {
    const org = await env.org();
    const base = ok(
      await createBase(env.deps, {
        organizationId: org,
        userId: null,
        name: "Sans",
        rerankModel: null,
      }),
    );
    expect(base.rerankModel).toBeNull();
  });
});

describe("ajout de documents : indexation, facturation, espace", () => {
  it("indexe un petit document sur-le-champ, débite les jetons d'embedding, compte l'espace exact et laisse une ligne d'Activité", async () => {
    const { org, base, ctx } = await setup();
    const before = await balanceOf(org);
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Facturation",
        text: DOCS.facturation,
      }),
    );
    expect(added.document).toMatchObject({
      status: "ready",
      title: "Facturation",
    });
    expect(added.duplicate).toBe(false);
    const chunks = chunkText(DOCS.facturation, {
      maxChars: base.chunkChars,
      overlapChars: base.chunkOverlap,
    });
    const rows = await env.t.db
      .select()
      .from(ragChunks)
      .where(eq(ragChunks.baseId, base.id));
    expect(rows).toHaveLength(chunks.length);
    // Espace : texte des extraits + vecteurs, exactement ce qui est enregistré dans le compteur.
    const expected = chunks.reduce((s, c) => s + chunkStorageBytes(c.text), 0);
    expect(env.storage.usedBytes(org)).toBe(expected);
    expect(added.document.bytes).toBe(expected);
    // Jetons d'embedding : une ligne d'usage « embeddings », débit égal au coût réglé.
    const events = await env.t.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.organizationId, org));
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every(
        (e) =>
          e.endpoint === "embeddings" &&
          e.modelPublicId === EMBED_MODEL &&
          e.status === "ok",
      ),
    ).toBe(true);
    const cost = events.reduce((s, e) => s + e.costMicro, 0n);
    expect(cost).toBeGreaterThan(0n);
    expect(before - (await balanceOf(org))).toBe(cost);
    // Le texte envoyé au modèle porte le titre de section (contexte) ; le texte stocké est l'extrait lui-même.
    expect(env.upstream.embedInputs).toEqual(chunks.map(embeddingInput));
    // Le texte en attente est effacé.
    const [doc] = await env.t.db
      .select()
      .from(ragDocuments)
      .where(eq(ragDocuments.id, added.document.id));
    expect(doc?.pendingText).toBeNull();
  });

  it("un même contenu ajouté deux fois ne coûte rien de plus et rend le premier document", async () => {
    const { org, base, ctx } = await setup();
    const first = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "A",
        text: DOCS.vacances,
      }),
    );
    const spent = await balanceOf(org);
    const used = env.storage.usedBytes(org);
    const second = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Autre titre",
        text: DOCS.vacances,
      }),
    );
    expect(second.duplicate).toBe(true);
    expect(second.document.id).toBe(first.document.id);
    expect(await balanceOf(org)).toBe(spent);
    expect(env.storage.usedBytes(org)).toBe(used);
  });

  it("ne garde jamais le contenu des documents dans les journaux", async () => {
    const { base, ctx } = await setup();
    const marker = "CONTENU-SECRET-DU-DOCUMENT-À-NE-JAMAIS-JOURNALISER";
    ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Confidentiel",
        text: `# Titre\n\n${marker} et d'autres mots pour faire un texte.`,
      }),
    );
    expect(env.logLines.join("\n")).not.toContain(marker);
  });

  it("met un gros document en file pour le worker, puis l'indexe par tranches reprenables", async () => {
    const { org, base, ctx } = await setup();
    const big = Array.from(
      { length: 40 },
      (_, i) =>
        `## Section ${i}\n\n${"Un paragraphe de contenu utile pour la recherche. ".repeat(20)}`,
    ).join("\n\n");
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Gros",
        text: big,
      }),
    );
    expect(added.document.status).toBe("queued");
    expect(env.jobs.map((j) => j.type)).toEqual(["rag.index"]);
    expect(env.jobs[0]?.payload.documentId).toBe(added.document.id);
    expect(env.upstream.embedCalls).toBe(0);
    // Première tranche : budget très court = un seul lot (2 extraits).
    const first = await indexSlice(env.deps, ctx.key, added.document.id, {
      budgetMs: 0,
    });
    expect(first.state).toBe("partial");
    const mid = await getDocument(env.deps, org, base.id, added.document.id);
    expect(ok(mid).chunks).toBe(2);
    // Tranche suivante : reprend où elle s'est arrêtée, jusqu'au bout.
    const last = await indexSlice(env.deps, ctx.key, added.document.id, {
      budgetMs: 60_000,
    });
    expect(last.state).toBe("ready");
    const total = chunkText(big, {
      maxChars: base.chunkChars,
      overlapChars: base.chunkOverlap,
    }).length;
    const rows = await env.t.db
      .select()
      .from(ragChunks)
      .where(eq(ragChunks.documentId, added.document.id));
    expect(rows).toHaveLength(total);
    expect(rows.map((r) => r.ord).sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, i) => i),
    );
    // Rejouer une tranche sur un document prêt ne refait rien (ni appel, ni débit).
    const calls = env.upstream.embedCalls;
    expect(
      (
        await indexSlice(env.deps, ctx.key, added.document.id, {
          budgetMs: 60_000,
        })
      ).state,
    ).toBe("gone");
    expect(env.upstream.embedCalls).toBe(calls);
  });

  it("deux tranches simultanées sur le même document ne s'exécutent pas ensemble", async () => {
    const { base, ctx } = await setup();
    const big = Array.from(
      { length: 30 },
      (_, i) => `## S${i}\n\n${"Texte de remplissage assez long. ".repeat(30)}`,
    ).join("\n\n");
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Gros",
        text: big,
      }),
    );
    const [a, b] = await Promise.all([
      indexSlice(env.deps, ctx.key, added.document.id, { budgetMs: 60_000 }),
      indexSlice(env.deps, ctx.key, added.document.id, { budgetMs: 60_000 }),
    ]);
    const states = [a.state, b.state].sort();
    expect(states[1]).toBe("ready");
    expect(["busy", "gone"]).toContain(states[0]);
    const total = chunkText(big, {
      maxChars: base.chunkChars,
      overlapChars: base.chunkOverlap,
    }).length;
    expect(env.upstream.embedInputs.length).toBe(total);
  });

  it("solde nul : refuse avec le message de la passerelle, ne stocke rien et ne garde aucun espace", async () => {
    const { org, base, ctx } = await setup(0n);
    const r = await addDocument(env.deps, ctx, {
      baseId: base.id,
      title: "A",
      text: DOCS.securite,
    });
    expect(r).toMatchObject({
      ok: false,
      failure: {
        status: 402,
        code: "insufficient_quota",
        message:
          "Solde de crédits insuffisant pour cette requête. Rechargez votre compte.",
      },
    });
    expect(
      await env.t.db
        .select()
        .from(ragDocuments)
        .where(eq(ragDocuments.baseId, base.id)),
    ).toHaveLength(0);
    expect(env.storage.usedBytes(org)).toBe(0);
    expect(env.upstream.embedCalls).toBe(0);
  });

  it("solde épuisé en cours d'indexation : le document échoue proprement, ses extraits sont purgés, l'espace est rendu", async () => {
    const costly = await ragTestEnv({
      config: { inlineMaxChunks: 1000, embedBatch: 2 },
      catalog: [
        {
          publicId: EMBED_MODEL,
          kind: "embedding",
          sellInput: 3_000_000_000n,
          sellOutput: 0n,
        },
      ],
    });
    try {
      const org = await costly.org(3_000_000n);
      const made = ok(
        await createBaseWithKey(costly.deps, {
          organizationId: org,
          userId: null,
          name: "Chère",
          rerankModel: null,
        }),
      );
      const key = await costly.t.db.query.apiKeys.findFirst({
        where: (k, { eq: e }) => e(k.id, made.keyId),
      });
      if (!key) throw new Error("clé");
      const text = Array.from(
        { length: 12 },
        (_, i) =>
          `## S${i}\n\n${"Du texte pour remplir un extrait entier. ".repeat(25)}`,
      ).join("\n\n");
      const r = await addDocument(
        costly.deps,
        { organizationId: org, key },
        { baseId: made.base.id, title: "Long", text },
      );
      expect(r).toMatchObject({
        ok: false,
        failure: { code: "insufficient_quota" },
      });
      expect(costly.upstream.embedCalls).toBeGreaterThan(0);
      expect(
        await costly.t.db
          .select()
          .from(ragChunks)
          .where(eq(ragChunks.baseId, made.base.id)),
      ).toHaveLength(0);
      expect(costly.storage.usedBytes(org)).toBe(0);
    } finally {
      await costly.close();
    }
  });

  it("quota d'espace dépassé : refus quota_exceeded avec la marche à suivre, avant tout appel au modèle", async () => {
    const small = await ragTestEnv({ quota: 2_000 });
    try {
      const org = await small.org();
      const made = ok(
        await createBaseWithKey(small.deps, {
          organizationId: org,
          userId: null,
          name: "Pleine",
        }),
      );
      const key = await small.t.db.query.apiKeys.findFirst({
        where: (k, { eq: e }) => e(k.id, made.keyId),
      });
      if (!key) throw new Error("clé");
      const r = await addDocument(
        small.deps,
        { organizationId: org, key },
        { baseId: made.base.id, title: "A", text: DOCS.facturation },
      );
      expect(r).toMatchObject({
        ok: false,
        failure: { status: 507, code: "quota_exceeded" },
      });
      if (!r.ok)
        expect(r.failure.message).toMatch(
          /Supprimez des documents.*Facturation/s,
        );
      expect(small.upstream.embedCalls).toBe(0);
      expect(
        await small.t.db
          .select()
          .from(ragDocuments)
          .where(eq(ragDocuments.baseId, made.base.id)),
      ).toHaveLength(0);
      expect(small.storage.usedBytes(org)).toBe(0);
    } finally {
      await small.close();
    }
  });

  it("refuse un texte vide, trop gros, un type inconnu et des métadonnées démesurées", async () => {
    const { base, ctx } = await setup();
    const small = {
      ...env.deps,
      config: {
        ...env.deps.config,
        maxTextChars: 100,
        maxFileBytes: 1000,
        maxMetadataBytes: 50,
      },
    };
    expect(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "v",
        text: "  ",
      }),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
    expect(
      await addDocument(small, ctx, {
        baseId: base.id,
        title: "g",
        text: "a".repeat(200),
      }),
    ).toMatchObject({ ok: false, failure: { status: 413 } });
    expect(
      await addDocument(small, ctx, {
        baseId: base.id,
        title: "f",
        filename: "x.txt",
        bytes: new Uint8Array(2000).fill(97),
      }),
    ).toMatchObject({ ok: false, failure: { status: 413 } });
    expect(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "i",
        filename: "photo.png",
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      }),
    ).toMatchObject({
      ok: false,
      failure: { status: 415, code: "unsupported_type" },
    });
    expect(
      await addDocument(small, ctx, {
        baseId: base.id,
        title: "m",
        text: "Un petit texte.",
        metadata: { a: "x".repeat(100) },
      }),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
  });

  it("indexe un fichier Markdown téléversé et prend son titre", async () => {
    const { base, ctx } = await setup();
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        filename: "politique.md",
        bytes: new TextEncoder().encode(DOCS.securite),
      }),
    );
    expect(added.document).toMatchObject({
      title: "Sécurité",
      source: "politique.md",
      status: "ready",
    });
  });

  it("coupe un embedding de 4096 dimensions à 1024 (Qwen3 sans paramètre de dimension)", async () => {
    const { base, ctx } = await setup();
    env.upstream.embedDims = 4096;
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Long vecteur",
        text: DOCS.vacances,
      }),
    );
    expect(added.document.status).toBe("ready");
  });

  it("une panne passagère du modèle laisse le document en file pour le worker, sans rien perdre", async () => {
    const { org, base, ctx } = await setup();
    env.upstream.embedFailStatus = 503;
    const added = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "En panne",
        text: DOCS.securite,
      }),
    );
    expect(added.document.status).toBe("queued");
    expect(env.jobs).toHaveLength(1);
    expect(env.storage.usedBytes(org)).toBeGreaterThan(0);
    env.upstream.embedFailStatus = 0;
    expect(
      (
        await indexSlice(env.deps, ctx.key, added.document.id, {
          budgetMs: 60_000,
        })
      ).state,
    ).toBe("ready");
  });
});

describe("recherche", () => {
  async function filled() {
    const s = await setup();
    for (const [title, text] of Object.entries(DOCS))
      ok(
        await addDocument(env.deps, s.ctx, { baseId: s.base.id, title, text }),
      );
    env.upstream.embedInputs = [];
    return s;
  }

  it("trouve le bon passage, avec sources, scores et coût, et facture l'embedding de la requête puis le reclassement", async () => {
    const { org, base, ctx } = await filled();
    const before = await balanceOf(org);
    const res = ok(
      await searchBase(env.deps, ctx, {
        baseId: base.id,
        query: "Quand se fait le paiement des factures par carte de crédit ?",
        topK: 2,
      }),
    );
    expect(res.data[0]).toMatchObject({
      document_title: "facturation",
      heading: "Facturation",
    });
    expect(res.data[0]?.text).toContain("carte de crédit");
    expect(res.data[0]?.scores.rerank).not.toBeNull();
    expect(res.data.length).toBeLessThanOrEqual(2);
    expect(res.rerank).toMatchObject({
      requested: true,
      applied: true,
      model: RERANK_MODEL,
    });
    const events = (
      await env.t.db
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.organizationId, org))
    ).filter((e) => e.createdAt.getTime() > Date.now() - 60_000);
    const endpoints = events.map((e) => e.endpoint);
    expect(endpoints.filter((e) => e === "rerank")).toHaveLength(1);
    expect(res.usage.cost_micro).toBe(String(before - (await balanceOf(org))));
    expect(env.upstream.embedInputs.at(-1)).toContain(
      "Quand se fait le paiement",
    );
    // L'instruction de requête propre au modèle précède la requête, jamais un document.
    expect(env.upstream.embedInputs.at(-1)).toMatch(/^Instruct: /);
  });

  it("sans reclassement demandé : aucun appel de reclassement, aucun débit pour lui", async () => {
    const { base, ctx } = await filled();
    const res = ok(
      await searchBase(env.deps, ctx, {
        baseId: base.id,
        query: "vacances payées",
        topK: 3,
        rerank: false,
      }),
    );
    expect(env.upstream.rerankCalls).toHaveLength(0);
    expect(res.rerank).toMatchObject({ requested: false, applied: false });
    expect(res.data[0]?.document_title).toBe("vacances");
  });

  it("le reclassement peut remettre en ordre les candidats", async () => {
    const { base, ctx } = await filled();
    env.upstream.rerankScores = (_q, d) =>
      d.includes("mots de passe") ? 0.99 : 0.1;
    const res = ok(
      await searchBase(env.deps, ctx, {
        baseId: base.id,
        query: "vacances",
        topK: 3,
      }),
    );
    expect(res.data[0]?.document_title).toBe("securite");
    expect(res.data[0]?.score).toBeCloseTo(0.99, 6);
  });

  it("recherche plein texte : retrouve un identifiant exact que le sens seul manquerait", async () => {
    const s = await setup();
    ok(
      await addDocument(env.deps, s.ctx, {
        baseId: s.base.id,
        title: "Journal",
        text: "Erreur E_4012 : le connecteur de paiement a expiré. Redémarrer le service de facturation.",
      }),
    );
    ok(
      await addDocument(env.deps, s.ctx, {
        baseId: s.base.id,
        title: "Autre",
        text: "Le texte parle d'un tout autre sujet, la cuisine et les recettes de saison.",
      }),
    );
    const res = ok(
      await searchBase(env.deps, s.ctx, {
        baseId: s.base.id,
        query: "E_4012",
        topK: 1,
        rerank: false,
      }),
    );
    expect(res.data[0]?.document_title).toBe("Journal");
    expect(res.data[0]?.scores.lexical).not.toBeNull();
  });

  it("modèle de reclassement indisponible : résultats rendus sans reclassement, avec la raison, sans débit de reclassement", async () => {
    const noRerank = await ragTestEnv({
      catalog: [
        {
          publicId: EMBED_MODEL,
          kind: "embedding",
          sellInput: 1_000_000n,
          sellOutput: 0n,
        },
      ],
    });
    try {
      const org = await noRerank.org();
      const made = ok(
        await createBaseWithKey(noRerank.deps, {
          organizationId: org,
          userId: null,
          name: "Sans reclassement",
        }),
      );
      expect(made.base.rerankModel).toBeNull();
      const key = await noRerank.t.db.query.apiKeys.findFirst({
        where: (k, { eq: e }) => e(k.id, made.keyId),
      });
      if (!key) throw new Error("clé");
      const ctx = { organizationId: org, key };
      ok(
        await addDocument(noRerank.deps, ctx, {
          baseId: made.base.id,
          title: "A",
          text: DOCS.securite,
        }),
      );
      const res = ok(
        await searchBase(noRerank.deps, ctx, {
          baseId: made.base.id,
          query: "mots de passe",
          topK: 3,
        }),
      );
      expect(res.rerank).toMatchObject({
        requested: true,
        applied: false,
        reason: "no_model",
      });
      expect(res.data.length).toBeGreaterThan(0);
    } finally {
      await noRerank.close();
    }
  });

  it("solde nul : la requête est refusée avec le message de la passerelle", async () => {
    const s = await setup(0n);
    const res = await searchBase(env.deps, s.ctx, {
      baseId: s.base.id,
      query: "bonjour",
      topK: 3,
    });
    expect(res).toMatchObject({
      ok: false,
      failure: { status: 402, code: "insufficient_quota" },
    });
  });

  it("une base vide rend une liste vide (et facture seulement l'embedding)", async () => {
    const s = await setup();
    const res = ok(
      await searchBase(env.deps, s.ctx, {
        baseId: s.base.id,
        query: "rien",
        topK: 3,
      }),
    );
    expect(res.data).toEqual([]);
    expect(env.upstream.rerankCalls).toHaveLength(0);
  });

  it("borne top_k et refuse une requête vide", async () => {
    const s = await setup();
    expect(
      await searchBase(env.deps, s.ctx, {
        baseId: s.base.id,
        query: "",
        topK: 3,
      }),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
    expect(
      await searchBase(env.deps, s.ctx, {
        baseId: s.base.id,
        query: "x",
        topK: 999,
      }),
    ).toMatchObject({ ok: false, failure: { code: "invalid_request" } });
  });

  it("la requête hostile reste une donnée (aucune injection SQL, aucune erreur)", async () => {
    const s = await filled();
    const res = ok(
      await searchBase(env.deps, s.ctx, {
        baseId: s.base.id,
        query: "a'); DROP TABLE rag_chunks; -- | & ! ( ) :*",
        topK: 3,
      }),
    );
    expect(Array.isArray(res.data)).toBe(true);
    expect(
      (
        await env.t.db
          .select()
          .from(ragChunks)
          .where(eq(ragChunks.baseId, s.base.id))
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("Privacy Router (inclus par défaut, comme pour tout appel de modèle)", () => {
  it("masque les renseignements personnels avant l'embedding des extraits et de la requête, mais garde l'extrait d'origine pour le client", async () => {
    const { base, ctx } = await setup();
    const text =
      "Pour joindre le service, écrivez à jean.tremblay@exemple.ca ou appelez le 514-555-0199 pendant les heures d'ouverture.";
    ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "Contact",
        text,
      }),
    );
    const sent = env.upstream.embedInputs.join("\n");
    expect(sent).not.toContain("jean.tremblay@exemple.ca");
    expect(sent).not.toContain("514-555-0199");
    expect(sent).toContain("[COURRIEL]");
    const found = ok(
      await searchBase(env.deps, ctx, {
        baseId: base.id,
        query: "écrire à jean.tremblay@exemple.ca",
        topK: 1,
        rerank: false,
      }),
    );
    expect(env.upstream.embedInputs.at(-1)).not.toContain(
      "jean.tremblay@exemple.ca",
    );
    // Le client récupère son propre texte tel qu'il l'a fourni.
    expect(found.data[0]?.text).toContain("jean.tremblay@exemple.ca");
  });

  it("une politique qui refuse le modèle bloque l'indexation (403), sans rien garder, ni payer, ni appeler le modèle", async () => {
    const { org, base, ctx } = await setup();
    await savePolicy(env.t.db, {
      organizationId: org,
      level: "renforce",
      config: { allowedModels: ["nexora/autre"] },
      createdBy: null,
    });
    const before = await balanceOf(org);
    const calls = env.upstream.embedCalls;
    const r = await addDocument(env.deps, ctx, {
      baseId: base.id,
      title: "Refusé",
      text: DOCS.securite,
    });
    expect(r).toMatchObject({
      ok: false,
      failure: { status: 403, code: "privacy_policy_denied" },
    });
    expect(env.upstream.embedCalls).toBe(calls);
    expect(await balanceOf(org)).toBe(before);
    expect(
      await env.t.db
        .select()
        .from(ragDocuments)
        .where(eq(ragDocuments.baseId, base.id)),
    ).toHaveLength(0);
    expect(env.storage.usedBytes(org)).toBe(0);
  });
});

describe("isolation entre organisations", () => {
  it("une clé d'une organisation ne lit, ne liste, ne modifie ni ne supprime jamais rien d'une autre", async () => {
    const a = await setup(undefined, "Base A");
    const b = await setup(undefined, "Base B");
    const doc = ok(
      await addDocument(env.deps, a.ctx, {
        baseId: a.base.id,
        title: "Secret A",
        text: DOCS.securite,
      }),
    );
    // La clé de B cible la base de A : introuvable, pour chaque opération.
    expect(
      await searchBase(env.deps, b.ctx, {
        baseId: a.base.id,
        query: "mots de passe",
        topK: 5,
      }),
    ).toMatchObject({ ok: false, failure: { code: "base_not_found" } });
    expect(await listDocuments(env.deps, b.org, a.base.id, {})).toMatchObject({
      ok: false,
      failure: { code: "base_not_found" },
    });
    expect(
      await getDocument(env.deps, b.org, a.base.id, doc.document.id),
    ).toMatchObject({ ok: false });
    expect(
      await addDocument(env.deps, b.ctx, {
        baseId: a.base.id,
        title: "x",
        text: "intrus",
      }),
    ).toMatchObject({ ok: false, failure: { code: "base_not_found" } });
    expect(
      await deleteDocument(env.deps, b.org, a.base.id, doc.document.id),
    ).toMatchObject({ ok: false });
    expect(await deleteBase(env.deps, b.org, a.base.id)).toMatchObject({
      ok: false,
    });
    expect(await getBase(env.deps, b.org, a.base.id)).toMatchObject({
      ok: false,
    });
    expect((await listBases(env.deps, b.org)).map((x) => x.id)).toEqual([
      b.base.id,
    ]);
    // Rien n'a bougé chez A.
    expect(
      ok(await getDocument(env.deps, a.org, a.base.id, doc.document.id)).status,
    ).toBe("ready");
  });

  it("même une clé dont la portée nomme (par erreur ou par attaque) la base d'une autre organisation ne la voit pas", async () => {
    const a = await setup(undefined, "Base A2");
    const b = await setup(undefined, "Base B2");
    ok(
      await addDocument(env.deps, a.ctx, {
        baseId: a.base.id,
        title: "Secret",
        text: DOCS.facturation,
      }),
    );
    await env.t.db
      .update(apiKeys)
      .set({ ragAccess: { bases: [a.base.id, b.base.id], mode: "write" } })
      .where(eq(apiKeys.id, b.key.id));
    const forged = { organizationId: b.org, key: await keyRow(b.key.id) };
    const res = await searchBase(env.deps, forged, {
      baseId: a.base.id,
      query: "factures",
      topK: 5,
    });
    expect(res).toMatchObject({
      ok: false,
      failure: { code: "base_not_found" },
    });
    // Sa propre base reste accessible et ne contient pas les documents de A.
    expect(
      ok(
        await searchBase(env.deps, forged, {
          baseId: b.base.id,
          query: "factures",
          topK: 5,
        }),
      ).data,
    ).toEqual([]);
  });

  it("refuse de créer une clé RAG pour la base d'une autre organisation", async () => {
    const a = await setup(undefined, "Base A3");
    const b = await setup(undefined, "Base B3");
    const r = await createRagKey(env.deps, {
      organizationId: b.org,
      baseIds: [a.base.id],
      mode: "read",
      name: "intrus",
    });
    expect(r).toMatchObject({ ok: false, failure: { code: "base_not_found" } });
  });
});

describe("suppression", () => {
  it("supprimer un document rend son espace et retire ses extraits", async () => {
    const { org, base, ctx } = await setup();
    const a = ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "A",
        text: DOCS.vacances,
      }),
    );
    ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "B",
        text: DOCS.securite,
      }),
    );
    const used = env.storage.usedBytes(org);
    ok(await deleteDocument(env.deps, org, base.id, a.document.id));
    expect(env.storage.usedBytes(org)).toBe(used - a.document.bytes);
    expect(
      await env.t.db
        .select()
        .from(ragChunks)
        .where(eq(ragChunks.documentId, a.document.id)),
    ).toHaveLength(0);
    expect(
      ok(await listDocuments(env.deps, org, base.id, {})).data.map(
        (d) => d.title,
      ),
    ).toEqual(["B"]);
  });

  it("supprimer la base rend tout l'espace, retire les documents et retire la base des clés (révoque celles qui n'ont plus rien)", async () => {
    const { org, base, ctx, key } = await setup(undefined, "À supprimer");
    const other = ok(
      await createBase(env.deps, {
        organizationId: org,
        userId: null,
        name: "Autre base",
      }),
    );
    const shared = ok(
      await createRagKey(env.deps, {
        organizationId: org,
        baseIds: [base.id, other.id],
        mode: "read",
        name: "partagée",
      }),
    );
    ok(
      await addDocument(env.deps, ctx, {
        baseId: base.id,
        title: "A",
        text: DOCS.facturation,
      }),
    );
    expect(env.storage.usedBytes(org)).toBeGreaterThan(0);
    ok(await deleteBase(env.deps, org, base.id));
    expect(env.storage.usedBytes(org)).toBe(0);
    expect(
      await env.t.db
        .select()
        .from(ragDocuments)
        .where(eq(ragDocuments.baseId, base.id)),
    ).toHaveLength(0);
    const own = await keyRow(key.id);
    expect(own.revokedAt).not.toBeNull();
    const kept = await keyRow(shared.id);
    expect(kept.revokedAt).toBeNull();
    expect(kept.ragAccess).toEqual({ bases: [other.id], mode: "read" });
  });
});

describe("clé de facturation des appels sans clé (compte, worker)", () => {
  it("préfère la clé qui a ajouté le document, puis la plus récente clé active de la base, sinon rien", async () => {
    const { org, base, key } = await setup();
    const second = ok(
      await createRagKey(env.deps, {
        organizationId: org,
        baseIds: [base.id],
        mode: "read",
        name: "2",
      }),
    );
    expect((await resolveBillingKey(env.deps, org, base.id, key.id))?.id).toBe(
      key.id,
    );
    expect((await resolveBillingKey(env.deps, org, base.id))?.id).toBe(
      second.id,
    );
    await env.t.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.organizationId, org));
    expect(await resolveBillingKey(env.deps, org, base.id, key.id)).toBeNull();
  });
});
