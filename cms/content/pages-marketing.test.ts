// Pages SEO et GEO de la deuxième vague (29/10/2026) : piliers P2, P3, P4, P7 (synthèse et 29 fiches), P8, P9, P10, P11.
// Les règles générales (vérité, clarté, typographie, maillage) sont dans pages-s3.test.ts, qui déclare ces pages.
// Ici : ce qui est propre à ces pages. Les exemples de code de P4 sont comparés AUX EXEMPLES DU CODE DE LA
// DOCUMENTATION ; les fiches de gabarits sont comparées à l'inventaire figé de WorkStudio.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  apiExampleModelId,
  apiSamples,
  streamingSample,
} from "../../web/src/lib/api-samples";
import {
  type BlockFile,
  type ClaimsFile,
  LOCALES,
  type Locale,
  type PageFile,
  readPagePair,
} from "../scripts/lib/content";
import { discoverPages } from "../scripts/load-content";
import { PAGES_DIR } from "./render-md";

const claimsFile = JSON.parse(
  readFileSync(join(import.meta.dir, "claims.json"), "utf8"),
) as ClaimsFile;
const claim = (id: string) => claimsFile.claims.find((c) => c.id === id);

const GUIDES = [
  "guides-passerelle-ou-acces-direct",
  "guides-alternative-openrouter",
  "guides-api-compatible-openai",
  "guides-ou-sont-vos-donnees-ia",
  "guides-ia-souveraine-liste-de-controle",
  "guides-serveur-ia-sur-place",
  "guides-vps-quebec-agents-ia",
] as const;
const HUB = "gabarits-flux-de-travaux";

type Inventaire = {
  source: string;
  templates: {
    slug: string;
    name: string;
    description: string;
    inputs: { name: string; type: string; description: string }[];
    steps: { kind: string; name: string }[];
    jsonKeys?: string[];
    references?: string[];
    taxRates?: Record<string, string>;
  }[];
};
const inventaire = JSON.parse(
  readFileSync(join(import.meta.dir, "gabarits-inventaire.json"), "utf8"),
) as Inventaire;
const FICHES = inventaire.templates.map((t) => `gabarit-${t.slug}`);
const ALL = [...GUIDES, HUB, ...FICHES];

const page = (k: string, l: Locale): PageFile => readPagePair(PAGES_DIR, k)[l];
const blocksOf = (k: string, l: Locale) => page(k, l).blocks;
const anchorOf = (b: BlockFile) =>
  (b.fields as Record<string, unknown>)?.anchor_id as string | undefined;
const plain = (s: string) =>
  s
    .replace(/<\/(p|li|h2|h3|tr)>/g, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const firstParagraph = (html: string) =>
  plain(/<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");

describe("GEO : la réponse d'abord, sur chacune des pages", () => {
  for (const k of ALL)
    for (const l of LOCALES)
      test(`${k} ${l} : un bloc « réponse » juste après le héros, de 38 à 66 mots, qui commence par une phrase autonome`, () => {
        const b = blocksOf(k, l);
        expect(b[0]?.collection).toBe("block_hero");
        expect(anchorOf(b[1] as BlockFile)).toBe("reponse");
        const first = firstParagraph(String(b[1]?.translation.body));
        const n = words(first);
        expect(n, first).toBeGreaterThanOrEqual(38);
        expect(n, first).toBeLessThanOrEqual(66);
        // aucune phrase d'ouverture qui dépend de la précédente : pas de pronom sans sujet au début
        expect(first, k).not.toMatch(
          l === "fr-CA"
            ? /^(Elle|Il|Ils|Elles|Ceci|Cela|Celui|Celle)\b/
            : /^(It|They|This|That|These|Those)\b/,
        );
      });

  for (const k of ALL)
    test(`${k} : une FAQ balisée de trois questions au moins, et une date de dernière vérification possible côté Directus`, () => {
      for (const l of LOCALES) {
        const faqs = blocksOf(k, l).filter((b) => b.collection === "block_faq");
        expect(faqs.length, `${k} ${l}`).toBe(1);
        const f = faqs[0] as BlockFile;
        expect(
          (f.fields as Record<string, unknown>).emit_jsonld,
          `${k} ${l}`,
        ).toBe(true);
        const items = f.translation.items as {
          question: string;
          answer: string;
        }[];
        expect(items.length).toBeGreaterThanOrEqual(3);
        for (const q of items) {
          expect(q.question.trim()).not.toBe("");
          expect(words(q.answer)).toBeGreaterThanOrEqual(8);
        }
      }
    });
});

describe("P2, P3, P8 : tableaux comparatifs", () => {
  for (const k of [
    "guides-passerelle-ou-acces-direct",
    "guides-alternative-openrouter",
    "guides-ou-sont-vos-donnees-ia",
    "guides-api-compatible-openai",
  ])
    for (const l of LOCALES)
      test(`${k} ${l} : au moins un tableau avec légende, en-têtes et lignes`, () => {
        const html = blocksOf(k, l)
          .map((b) => String(b.translation.body ?? ""))
          .join("");
        expect(html).toMatch(/<table><caption>[^<]+<\/caption><thead>/);
        expect((html.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(4);
      });

  test("P2 : le tableau ne chiffre aucune latence, ni aucun nom de marque (comparatif sans marque)", () => {
    for (const l of LOCALES) {
      const html = JSON.stringify(
        blocksOf("guides-passerelle-ou-acces-direct", l),
      );
      expect(html).not.toMatch(/OpenRouter|LiteLLM|Portkey|Helicone/);
      expect(html).not.toMatch(/\d\s*(ms|milliseconde|millisecond)/i);
    }
    expect(claim("CL-M08")?.statement).toMatch(/aucune mesure/);
  });
});

describe("P4 : les exemples de code sont ceux de la documentation de l'API", () => {
  const BASE = "https://www.example.com/v1";
  const decode = (s: string) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const codeBlocks = (l: Locale) =>
    [
      ...blocksOf("guides-api-compatible-openai", l)
        .map((b) => String(b.translation.body ?? ""))
        .join("")
        .matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/g),
    ].map((m) => decode(m[1] as string));

  for (const l of LOCALES) {
    const lang = l === "fr-CA" ? "fr" : "en";
    test(`${l} : cURL, Python et JavaScript reprennent mot pour mot apiSamples, et le flux reprend streamingSample`, () => {
      const blocks = codeBlocks(l);
      const model = apiExampleModelId(lang);
      for (const s of apiSamples(BASE, model, "chat", lang))
        expect(blocks, `${l} ${s.id}`).toContain(s.code);
      expect(blocks, `${l} flux`).toContain(streamingSample(model, lang));
    });
  }

  test("l'erreur montrée est celle qu'un serveur de développement a réellement renvoyée (401, format d'erreur d'OpenAI)", () => {
    for (const l of LOCALES) {
      const err = codeBlocks(l).find((c) => c.startsWith("HTTP 401"));
      expect(err, l).toBeDefined();
      const json = JSON.parse((err as string).split("\n")[1] as string);
      expect(json.error.code).toBe("invalid_api_key");
      expect(json.error.type).toBe("authentication_error");
      expect(json.error).toHaveProperty("param", null);
    }
    expect(claim("CL-M07")?.evidence).toMatch(/401 invalid_api_key/);
  });

  test("aucun faux résultat : la page n'affiche aucune réponse d'un modèle et dit qu'aucun résultat n'est montré", () => {
    for (const l of LOCALES) {
      const text = JSON.stringify(blocksOf("guides-api-compatible-openai", l));
      expect(text).not.toMatch(/"choices"|chatcmpl-|"finish_reason"/);
      expect(text).toMatch(
        l === "fr-CA" ? /n'affichent aucun résultat/ : /show no output/,
      );
    }
    expect(
      claimsFile.retirees.some((r) => r.id === "R-52"),
      "formulation retirée R-52",
    ).toBe(true);
  });
});

describe("P3 : comparatif nommé, honnête, à relire", () => {
  const K = "guides-alternative-openrouter";
  const EXTERNAL = [
    "CL-X01",
    "CL-X02",
    "CL-X03",
    "CL-X04",
    "CL-X05",
    "CL-X06",
    "CL-X07",
  ];

  test("la page est un brouillon non indexé tant que le fondateur n'a pas décidé (R-47, CL-A10)", () => {
    for (const l of LOCALES) {
      expect(page(K, l).status).toBe("draft");
      expect(page(K, l).noindex).toBe(true);
    }
  });

  test("chaque fait d'OpenRouter est au registre avec sa source publique, sa date de lecture, et l'état « à relire » (échéance de trois mois)", () => {
    for (const id of EXTERNAL) {
      const c = claim(id);
      expect(c, id).toBeDefined();
      expect(c?.approval_status, id).toBe("en_revue");
      expect(c?.scope, id).toMatch(/^À RELIRE/);
      expect(c?.scope, id).toMatch(/29\/10\/2026/);
      expect(c?.evidence_url, id).toMatch(
        /^https:\/\/openrouter\.ai\/(pricing|docs\/faq)$/,
      );
      expect(c?.valid_until, id).toBe("2027-01-29");
    }
  });

  test("le tableau cite la date de lecture et renvoie aux deux pages sources ; toutes les affirmations externes sont citées", () => {
    for (const l of LOCALES) {
      const text = JSON.stringify(blocksOf(K, l));
      expect(text).toMatch(/29 octobre 2026|October 29, 2026/);
      expect(text).toContain("https://openrouter.ai/pricing");
      expect(text).toContain("https://openrouter.ai/docs/faq");
      const cited = new Set(blocksOf(K, l).flatMap((b) => b.claims ?? []));
      for (const id of EXTERNAL) expect(cited.has(id), `${l} ${id}`).toBe(true);
    }
  });

  test("honnêteté : une section « quand choisir l'autre », la divulgation du fournisseur amont, et aucun adjectif de valeur", () => {
    for (const l of LOCALES) {
      const b = blocksOf(K, l);
      expect(b.some((x) => anchorOf(x) === "choisir-lautre")).toBe(true);
      const donnees = b.find((x) => anchorOf(x) === "donnees") as BlockFile;
      expect(donnees.claims).toContain("CL-M09");
      expect(plain(String(donnees.translation.body))).toMatch(
        l === "fr-CA"
          ? /s'appuie elle-même sur OpenRouter/
          : /relies on OpenRouter/,
      );
      const text = plain(JSON.stringify(b));
      const valeur =
        l === "fr-CA"
          ? /\b(meilleure?s?|moins chère?s?|plus sûre?s?|plus sécuritaires?|supérieure?s?|répond mieux)\b/i
          : /\b(better|cheaper|safer|superior|best)\b/i;
      // seul le mot fautif est affiché en cas d'échec
      expect(valeur.exec(text)?.[0]).toBeUndefined();
    }
  });

  test("aucune autre page ne nomme OpenRouter : le comparatif nommé est le seul lieu où le nom figure", () => {
    for (const k of discoverPages(PAGES_DIR))
      for (const l of LOCALES) {
        if (k === K) continue;
        expect(JSON.stringify(page(k, l)), `${k} ${l}`).not.toMatch(
          /OpenRouter/,
        );
      }
  });
});

describe("P7 : les gabarits, d'après l'inventaire réel de WorkStudio", () => {
  test("l'inventaire figé compte vingt-neuf gabarits aux adresses distinctes, et sa source est tracée", () => {
    expect(inventaire.templates).toHaveLength(29);
    expect(new Set(inventaire.templates.map((t) => t.slug)).size).toBe(29);
    expect(inventaire.source).toMatch(/commit 0888af53/);
    expect(claim("CL-M01")?.statement).toMatch(/vingt-neuf gabarits/);
  });

  test("le registre cite le commit de l'inventaire pour chaque fait sur les gabarits (CL-M01 à CL-M05, CL-M12 à CL-M15)", () => {
    const commit = /commit ([0-9a-f]{7,})/.exec(inventaire.source)?.[1];
    expect(commit).toBeDefined();
    for (const id of [
      "CL-M01",
      "CL-M02",
      "CL-M03",
      "CL-M04",
      "CL-M05",
      "CL-M12",
      "CL-M13",
      "CL-M14",
      "CL-M15",
    ])
      expect(claim(id)?.source_version, id).toContain(commit as string);
  });

  test("les noms de l'inventaire sont ceux des fiches renommées : « Tri des courriels entrants » et « Infolettre mensuelle »", () => {
    const name = (slug: string) =>
      inventaire.templates.find((t) => t.slug === slug)?.name;
    expect(name("tri-emails")).toBe("Tri des courriels entrants");
    expect(name("newsletter")).toBe("Infolettre mensuelle");
    for (const slug of ["tri-emails", "newsletter"]) {
      const f = page(`gabarit-${slug}`, "fr-CA");
      const hero = blocksOf(`gabarit-${slug}`, "fr-CA")[0] as BlockFile;
      expect(f.seo.title).toBe(name(slug) as string);
      expect(f.seo.seo_title).toContain(name(slug) as string);
      expect(String(hero.translation.headline)).toBe(`${name(slug)}.`);
      expect(JSON.stringify({ seo: f.seo, blocks: f.blocks })).not.toMatch(
        /Newsletter|\be-mails?\b/,
      );
    }
  });

  test("une fiche par gabarit de l'inventaire, ni plus ni moins", () => {
    const found = discoverPages(PAGES_DIR).filter((k) =>
      k.startsWith("gabarit-"),
    );
    expect([...found].sort()).toEqual([...FICHES].sort());
  });

  for (const t of inventaire.templates)
    for (const l of LOCALES)
      test(`${t.slug} ${l} : la fiche liste exactement les champs de départ et dit si le gabarit envoie un courriel`, () => {
        const b = blocksOf(`gabarit-${t.slug}`, l);
        const champs = b.find((x) => anchorOf(x) === "champs") as BlockFile;
        const items = (String(champs.translation.body).match(/<li>/g) ?? [])
          .length;
        expect(items, "champs de départ").toBe(t.inputs.length);
        const envoie = t.steps.some((s) => s.kind === "email");
        const adapter = b.find((x) => anchorOf(x) === "adapter") as BlockFile;
        const titres = (adapter.translation.cards as { title: string }[]).map(
          (c) => c.title,
        );
        const attendu = envoie
          ? l === "fr-CA"
            ? "Une personne valide avant l'envoi."
            : "A person approves before sending."
          : l === "fr-CA"
            ? "Rien n'est envoyé."
            : "Nothing is sent.";
        expect(titres.map((x) => x.replace(/ /g, " "))).toContain(attendu);
        // un gabarit qui envoie passe par une validation : étape d'approbation dans l'inventaire
        if (envoie) {
          const kinds = t.steps.map((s) => s.kind);
          expect(kinds.indexOf("approval")).toBeGreaterThan(-1);
          expect(kinds.indexOf("approval")).toBeLessThan(
            kinds.indexOf("email"),
          );
        }
        // le nombre de cartes d'étapes suit les étapes réelles (validation et condition comptent pour une)
        const etapes = b.find((x) => anchorOf(x) === "etapes") as BlockFile;
        const reel = t.steps.filter((s) => s.kind !== "gate").length;
        const cartes = (etapes.translation.cards as unknown[]).length;
        const fusion = t.steps.some((s) => s.kind === "approval") ? 1 : 0;
        const attenduCartes = envoie
          ? reel - fusion + (t.steps.some((s) => s.kind === "email") ? 0 : 0)
          : reel + 1;
        // envoi : transcription/rédaction + validation + envoi ; sinon : étapes d'agents + « Relire »
        expect(cartes).toBeGreaterThanOrEqual(envoie ? 3 : 2);
        expect(cartes).toBeLessThanOrEqual(
          envoie ? attenduCartes + 1 : attenduCartes,
        );
      });

  test("exactement cinq gabarits envoient un courriel, et la synthèse le dit", () => {
    const envoient = inventaire.templates.filter((t) =>
      t.steps.some((s) => s.kind === "email"),
    );
    expect(envoient).toHaveLength(5);
    for (const l of LOCALES) {
      const text = JSON.stringify(blocksOf(HUB, l));
      expect(text).toMatch(
        l === "fr-CA" ? /Cinq gabarits envoient/ : /Five templates send/,
      );
    }
    expect(claim("CL-M03")?.statement).toMatch(/Cinq gabarits envoient/);
  });

  test("la synthèse renvoie vers chacune des 29 fiches, dans les deux langues", () => {
    for (const l of LOCALES) {
      const hrefs = new Set<string>();
      for (const b of blocksOf(HUB, l))
        for (const c of (b.translation.cards as { href?: string }[]) ?? [])
          if (c.href) hrefs.add(c.href);
      const slugs = FICHES.map((k) => page(k, l).seo.slug);
      for (const s of slugs)
        expect(hrefs.has(l === "fr-CA" ? `/${s}/` : `/en/${s}/`), s).toBe(true);
      expect(slugs).toHaveLength(29);
    }
  });

  const OBSOLETE: [RegExp, RegExp][] = [
    // [fr-CA, en-CA] : ce que les fiches disaient avant l'adaptation au Québec
    [/PME française/, /French small business/],
    [/rédigés? pour la France/, /written for France/],
    [/TVA de type français|TVA unique/, /French-style VAT|single French/],
    [/\bSIRET\b/, /\bSIRET\b/],
    [/en euros?\b|salaire en euros/, /in euros|euros\b/],
    [/indemnité forfaitaire/, /fixed (recovery )?(indemnity|allowance)/],
    [
      /aucune (logique|règle) de TPS/i,
      /no (GST|QST|logic)[^.]{0,40}(GST|QST)|has no GST/i,
    ],
    [
      /ne suivent pas les règles fiscales du Québec/,
      /do not follow Quebec tax rules/,
    ],
  ];

  test("plus aucune fiche ni la synthèse ne dit que les gabarits sont rédigés pour la France", () => {
    for (const k of [HUB, ...FICHES])
      for (const l of LOCALES) {
        const text = JSON.stringify(blocksOf(k, l));
        for (const [fr, en] of OBSOLETE)
          expect(text, `${k} ${l}`).not.toMatch(l === "fr-CA" ? fr : en);
      }
  });

  test("honnêteté sur le Québec : chaque fiche et la synthèse disent que les gabarits sont adaptés au Québec, à valider, sans garantie de conformité", () => {
    for (const k of [HUB, ...FICHES])
      for (const l of LOCALES) {
        const text = JSON.stringify(blocksOf(k, l));
        const fr = l === "fr-CA";
        expect(text, `${k} ${l}`).toMatch(
          fr ? /adaptés? au Québec|PME du Québec/ : /Quebec/,
        );
        expect(text, `${k} ${l}`).toMatch(
          fr
            ? /ne garantissent aucune conformité fiscale ou légale/
            : /do not guarantee any tax or legal compliance/,
        );
        expect(text, `${k} ${l}`).toMatch(
          fr ? /votre comptable ou votre conseiller/ : /accountant or adviser/,
        );
        expect(text, `${k} ${l}`).toMatch(
          fr
            ? /exemples[^"]{0,40}sont fictifs/
            : /examples[^"]{0,40}are fictional/,
        );
      }
    expect(claim("CL-M02")?.statement).toMatch(/dollars canadiens/);
    expect(claim("CL-M02")?.statement).toMatch(/TPS/);
    expect(claim("CL-M02")?.statement).not.toMatch(/PME française/);
    expect(claim("CL-M12")?.statement).toMatch(/aucune conformité/);
  });

  // Les gabarits qui touchent aux taxes sont ceux dont la description de templates.ts cite la TPS ou la TVQ.
  const FISCAUX = inventaire.templates.filter((t) =>
    /TPS|TVQ/.test(t.description),
  );

  test("les gabarits fiscaux sont ceux de la facture et du devis (déduits de l'inventaire)", () => {
    expect(FISCAUX.map((t) => t.slug).sort()).toEqual([
      "controle-facture",
      "devis",
      "factures-fournisseurs",
    ]);
  });

  for (const t of FISCAUX)
    for (const l of LOCALES)
      test(`${t.slug} ${l} : la fiche cite la TPS et la TVQ avec leurs taux, et les clés de sortie du gabarit`, () => {
        const fr = l === "fr-CA";
        const b = blocksOf(`gabarit-${t.slug}`, l);
        const text = JSON.stringify(b);
        expect(text).toMatch(fr ? /TPS/ : /GST/);
        expect(text).toMatch(fr ? /TVQ/ : /QST/);
        const rates = t.taxRates as Record<string, string>;
        for (const rate of Object.values(rates))
          expect(text).toContain(
            fr ? `${rate}\u00a0%` : `${rate.replace(",", ".")}%`,
          );
        // la TVQ se calcule sur le sous-total, jamais sur la TPS
        expect(text).toMatch(
          fr
            ? /sous-total[^"]{0,120}pas (de|sur) la TPS|jamais (de|sur) la TPS/
            : /subtotal[^"]{0,120}(not|never)[^"]{0,20}GST/,
        );
        const etapes = JSON.stringify(
          (b.find((x) => anchorOf(x) === "etapes") as BlockFile).translation,
        );
        for (const key of (t.jsonKeys ?? []).filter((k) =>
          /^(sous_total|tps|tvq|total|numero_tps|numero_tvq|neq)$/.test(k),
        ))
          expect(etapes, key).toContain(key);
      });

  test("les clés de sortie des gabarits de facture sont celles de l'adaptation au Québec", () => {
    const keys = (slug: string) =>
      inventaire.templates.find((t) => t.slug === slug)?.jsonKeys;
    expect(keys("controle-facture")).toEqual(
      expect.arrayContaining([
        "sous_total",
        "tps",
        "tvq",
        "total",
        "numero_tps",
        "numero_tvq",
        "neq",
      ]),
    );
    expect(keys("controle-facture")).not.toContain("siret");
    expect(keys("factures-fournisseurs")).toEqual(
      expect.arrayContaining(["sous_total", "tps", "tvq", "total"]),
    );
    expect(keys("factures-fournisseurs")).not.toContain("total_ht");
  });

  const LEGAL_EN: Record<string, string> = {
    "Loi sur les normes du travail": "Act respecting labour standards",
    "Charte des droits et libertés de la personne":
      "Charter of human rights and freedoms",
    TD1: "TD1",
    "TP-1015.3-V": "TP-1015.3-V",
  };
  for (const t of inventaire.templates.filter((x) => x.references?.length))
    for (const l of LOCALES)
      test(`${t.slug} ${l} : la fiche nomme chaque référence légale du gabarit, toujours avec « à valider par votre conseiller »`, () => {
        const fr = l === "fr-CA";
        const text = JSON.stringify(blocksOf(`gabarit-${t.slug}`, l));
        for (const ref of t.references as string[])
          expect(text, ref).toContain(fr ? ref : (LEGAL_EN[ref] as string));
        expect(text).toMatch(
          fr
            ? /à valider par votre conseiller/
            : /to be validated by your adviser/,
        );
      });

  test("la synthèse dit que la lecture de documents scannés garde TVA, hors taxes et toutes taxes comprises, et que les pages d'extraction citent ce fait", () => {
    for (const l of LOCALES) {
      const fr = l === "fr-CA";
      const text = JSON.stringify(blocksOf(HUB, l));
      expect(text).toMatch(fr ? /TVA/ : /VAT/);
      expect(text).toMatch(
        fr
          ? /lecture de documents scannés[^"]{0,160}n'est pas visée/
          : /document reading[^"]{0,160}not covered/,
      );
      for (const k of ["solutions-factures", "solutions-comptabilite"]) {
        const claims = blocksOf(k, l).flatMap((b) => b.claims ?? []);
        expect(claims, `${k} ${l}`).toContain("CL-M15");
        expect(claims, `${k} ${l}`).not.toContain("CL-111");
      }
    }
    expect(claim("CL-M15")?.statement).toMatch(/TVA/);
    expect(claim("CL-M15")?.statement).toMatch(/hors taxes/);
  });

  test("les pages qui citent les modèles de départ ne disent plus qu'ils ignorent la fiscalité du Québec", () => {
    for (const k of [
      "workstudio",
      "guides-ia-pme-quebec",
      "guides-agents-ia-pour-pme",
    ])
      for (const l of LOCALES) {
        const text = JSON.stringify(blocksOf(k, l));
        expect(text, `${k} ${l}`).not.toMatch(
          /ne suivent pas les règles fiscales du Québec|do not follow Quebec tax rules|modèles de départ sont généraux|starter templates are general/,
        );
      }
  });

  test("les affirmations d'origine sont tracées : l'ancienne formulation « PME française » est retirée au registre (R-54) et R-53 ne renvoie plus à elle", () => {
    expect(claimsFile.retirees.map((r) => r.id)).toContain("R-54");
    const r54 = claimsFile.retirees.find((r) => r.id === "R-54");
    expect(r54?.formulation).toMatch(/PME française/);
    const r53 = claimsFile.retirees.find((r) => r.id === "R-53");
    expect(r53?.raison).not.toMatch(/rédigés pour une PME française/);
  });
});

describe("tous : méthode, états et maillage", () => {
  test("seul le comparatif nommé est en brouillon ; les autres pages sont publiées et indexables", () => {
    for (const k of ALL)
      for (const l of LOCALES) {
        const p = page(k, l);
        expect(p.status, `${k} ${l}`).toBe(
          k === "guides-alternative-openrouter" ? "draft" : "published",
        );
        expect(Boolean(p.noindex), `${k} ${l}`).toBe(
          k === "guides-alternative-openrouter",
        );
      }
  });

  test("chaque guide renvoie à au moins deux autres pages du site dans son corps ou ses cartes", () => {
    for (const k of GUIDES)
      for (const l of LOCALES) {
        const hrefs = new Set<string>();
        const walk = (v: unknown) => {
          if (typeof v === "string") {
            for (const m of v.matchAll(/href="(\/[^"]+)"/g))
              hrefs.add(m[1] as string);
          } else if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === "object")
            for (const [key, x] of Object.entries(v))
              if (
                /href$/.test(key) &&
                typeof x === "string" &&
                x.startsWith("/")
              )
                hrefs.add(x);
              else walk(x);
        };
        walk(blocksOf(k, l).map((b) => b.translation));
        expect(hrefs.size, `${k} ${l}`).toBeGreaterThanOrEqual(3);
      }
  });

  test("le registre porte les nouvelles affirmations (M, X, AP) et les formulations retirées R-50 à R-53", () => {
    for (const prefix of ["CL-M", "CL-X", "CL-AP"])
      expect(
        claimsFile.claims.filter((c) => c.id.startsWith(prefix)).length,
        prefix,
      ).toBeGreaterThan(3);
    for (const n of [50, 51, 52, 53])
      expect(claimsFile.retirees.map((r) => r.id)).toContain(`R-${n}`);
  });
});
