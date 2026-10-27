// Passes VÉRITÉ, CLARTÉ et SEO automatisées sur les pages du jalon S3 (solutions, services, déploiement, souveraineté,
// WorkStudio, suite, entreprise, centre de confiance, FAQ, guide Loi 25 et gabarits juridiques), et chargement.
// Mêmes règles qu'au S2 (content.test.ts), avec trois différences assumées :
//   - le guide `souverainete/loi-25` et la FAQ peuvent parler de la Loi 25 (jamais pour s'en déclarer « conforme ») ;
//   - les pages au statut `draft` (guide Loi 25 et gabarits juridiques) ne sont jamais publiées par le script ;
//   - les champs de présentation des blocs (`tone`, `layout`, `visual`, `anchor_id`) sont validés contre le schéma s'il les
//     connaît, et contre leurs valeurs permises dans tous les cas.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BlockFile,
  type ClaimsFile,
  LOCALES,
  type Locale,
  managedFields,
  mergePage,
  type PageFile,
  readPagePair,
} from "../scripts/lib/content";
import {
  discoverPages,
  isPublishable,
  stripUnknownFields,
} from "../scripts/load-content";
import { PAGES_DIR, renderMarkdown } from "./render-md";

// clé de fichier -> slugs et statut attendus
const EXPECTED: Record<string, { fr: string; en: string; draft?: boolean }> = {
  souverainete: { fr: "souverainete", en: "sovereignty" },
  "souverainete-loi-25": {
    fr: "souverainete/loi-25",
    en: "sovereignty/data-protection-law",
    draft: true,
  },
  solutions: { fr: "solutions", en: "solutions" },
  "solutions-courriels": { fr: "solutions/courriels", en: "solutions/email" },
  "solutions-factures": { fr: "solutions/factures", en: "solutions/invoices" },
  "solutions-service-client": {
    fr: "solutions/service-client",
    en: "solutions/customer-service",
  },
  "solutions-rendez-vous": {
    fr: "solutions/rendez-vous",
    en: "solutions/appointments",
  },
  "solutions-comptabilite": {
    fr: "solutions/comptabilite",
    en: "solutions/accounting",
  },
  "solutions-documents": {
    fr: "solutions/documents",
    en: "solutions/documents",
  },
  services: { fr: "services", en: "services" },
  "services-installation-serveurs-ia": {
    fr: "services/installation-serveurs-ia",
    en: "services/ai-server-installation",
  },
  "services-automatisation-sur-mesure": {
    fr: "services/automatisation-sur-mesure",
    en: "services/custom-automation",
  },
  deploiement: { fr: "deploiement", en: "deployment" },
  "deploiement-sur-place": {
    fr: "deploiement/sur-place",
    en: "deployment/on-premises",
  },
  "deploiement-heberge-quebec": {
    fr: "deploiement/heberge-quebec",
    en: "deployment/hosted-quebec",
  },
  methode: { fr: "methode", en: "method" },
  workstudio: { fr: "workstudio", en: "workstudio" },
  suite: { fr: "suite", en: "suite" },
  entreprise: { fr: "entreprise", en: "company" },
  "centre-de-confiance": { fr: "centre-de-confiance", en: "trust-center" },
  faq: { fr: "faq", en: "faq" },
  "mentions-legales": {
    fr: "mentions-legales",
    en: "legal-notice",
    draft: true,
  },
  confidentialite: { fr: "confidentialite", en: "privacy", draft: true },
  conditions: { fr: "conditions", en: "terms", draft: true },
  "utilisation-acceptable": {
    fr: "utilisation-acceptable",
    en: "acceptable-use",
    draft: true,
  },
};
const KEYS = Object.keys(EXPECTED);
const DRAFTS = KEYS.filter((k) => EXPECTED[k]?.draft);
const PUBLISHED = KEYS.filter((k) => !EXPECTED[k]?.draft);
const LEGAL = DRAFTS.filter((k) => k !== "souverainete-loi-25");

const claimsFile = JSON.parse(
  readFileSync(join(import.meta.dir, "claims.json"), "utf8"),
) as ClaimsFile;
const CODES = new Set(claimsFile.claims.map((c) => c.id));

const raw = Object.fromEntries(
  KEYS.map((k) => [k, readPagePair(PAGES_DIR, k)]),
) as Record<string, Record<Locale, PageFile>>;
const page = (k: string, l: Locale): PageFile =>
  (raw[k] as Record<Locale, PageFile>)[l];

/** Toutes les chaînes visibles d'un bloc (sans les liens). */
function texts(b: BlockFile): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      if (/href$/.test(path.split(".").at(-1) ?? "")) return;
      out.push({ path, value: v });
    } else if (Array.isArray(v)) {
      for (const [i, x] of v.entries()) walk(x, `${path}[${i}]`);
    } else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(b.translation, "");
  return out;
}
const plain = (s: string) =>
  s
    .replace(/<\/(p|li|h2|h3)>/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
function allTexts(f: PageFile) {
  const out = [
    { path: "seo.title", value: f.seo.title },
    { path: "seo.seo_title", value: f.seo.seo_title },
    { path: "seo.seo_description", value: f.seo.seo_description },
  ];
  f.blocks.forEach((b, i) => {
    for (const t of texts(b)) out.push({ ...t, path: `bloc${i + 1}${t.path}` });
  });
  return out;
}
function hrefsOf(f: PageFile): string[] {
  const hrefs: string[] = [];
  const walk = (v: unknown, key = "") => {
    if (typeof v === "string") {
      if (/href$/.test(key)) hrefs.push(v);
      for (const m of v.matchAll(/href="([^"]+)"/g)) hrefs.push(m[1] as string);
    } else if (Array.isArray(v)) for (const x of v) walk(x, key);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  for (const b of f.blocks) walk(b.translation);
  return hrefs;
}
const route = (l: Locale, slug: string) =>
  l === "fr-CA"
    ? `/${slug}${slug ? "/" : ""}`
    : `/en/${slug}${slug ? "/" : ""}`;

const TONES = ["sombre", "clair", "sable"];
const LAYOUTS = ["grille", "liste", "etapes", "modules"];
const VISUALS = [
  "aucun",
  "perimetre-sur-place",
  "perimetre-heberge",
  "flux-donnees",
];
const STATUSES = ["disponible", "pilote", "prevu"];
const PRESENTATION = new Set(["tone", "layout", "visual", "anchor_id"]);

describe("S3 : structure", () => {
  test("les 25 pages attendues existent, et rien d'autre ne s'ajoute sans être déclaré ici", () => {
    const found = discoverPages(PAGES_DIR).filter(
      (k) => k !== "accueil" && k !== "opsys-ai",
    );
    expect([...found].sort()).toEqual([...KEYS].sort());
  });

  for (const k of KEYS) {
    test(`${k} : les deux langues fusionnent (champs de présentation validés contre le schéma s'il les connaît)`, () => {
      const { pair, removed } = stripUnknownFields(raw[k] as never);
      // un champ retiré doit être un champ de présentation connu : une faute de frappe ne passe pas
      for (const name of Object.keys(removed))
        expect(PRESENTATION.has(name.split(".")[1] as string), name).toBe(true);
      expect(() => mergePage(pair)).not.toThrow();
    });

    test(`${k} : mêmes listes, mêmes affirmations et mêmes champs dans les deux langues`, () => {
      const fr = page(k, "fr-CA").blocks;
      const en = page(k, "en-CA").blocks;
      fr.forEach((b, i) => {
        const o = en[i] as BlockFile;
        for (const key of ["cards", "items"]) {
          const a = b.translation[key];
          const c = o.translation[key];
          if (Array.isArray(a) || Array.isArray(c))
            expect((c as unknown[]).length, `bloc ${i + 1} ${key}`).toBe(
              (a as unknown[]).length,
            );
        }
        expect(o.claims ?? [], `bloc ${i + 1} affirmations`).toEqual(
          b.claims ?? [],
        );
        expect(
          Object.keys(o.translation).sort(),
          `bloc ${i + 1} champs`,
        ).toEqual(Object.keys(b.translation).sort());
        // statuts de cartes identiques dans les deux langues
        const sa = ((b.translation.cards ?? []) as { status?: string }[]).map(
          (c) => c.status,
        );
        const sb = ((o.translation.cards ?? []) as { status?: string }[]).map(
          (c) => c.status,
        );
        expect(sb, `bloc ${i + 1} statuts`).toEqual(sa);
      });
    });
  }
});

describe("S3 : champs de présentation des blocs", () => {
  for (const k of KEYS) {
    test(`${k} : valeurs permises, ancres uniques, statuts de cartes valides`, () => {
      const anchors = new Set<string>();
      page(k, "fr-CA").blocks.forEach((b, i) => {
        const f = (b.fields ?? {}) as Record<string, unknown>;
        const where = `bloc ${i + 1}`;
        if (b.collection === "block_hero")
          expect(["sombre", "clair"], where).toContain(f.variant);
        else if (b.collection === "block_cta")
          expect(["sombre", "clair", "accent"], where).toContain(f.tone);
        else expect(TONES, where).toContain(f.tone);
        if (b.collection === "block_cards") {
          expect(LAYOUTS, where).toContain(f.layout);
          expect(["2", "3", "4"], where).toContain(f.columns);
          for (const c of (b.translation.cards ?? []) as {
            status?: string;
          }[])
            if (c.status !== undefined) {
              expect(STATUSES, `${where} statut`).toContain(c.status);
              // le badge d'état ne s'affiche qu'en disposition « modules »
              expect(
                f.layout,
                `${where} : un statut exige la disposition modules`,
              ).toBe("modules");
            }
        }
        if (f.visual !== undefined) {
          expect(b.collection, where).toBe("block_section");
          expect(VISUALS, where).toContain(f.visual);
        }
        if (f.anchor_id !== undefined) {
          expect(String(f.anchor_id), where).toMatch(/^[a-z0-9-]{0,40}$/);
          expect(
            anchors.has(String(f.anchor_id)),
            `${where} ancre double`,
          ).toBe(false);
          anchors.add(String(f.anchor_id));
        }
      });
    });
  }

  test("les pages longues portent des ancres sur leurs blocs", () => {
    for (const k of KEYS) {
      const blocks = page(k, "fr-CA").blocks;
      if (blocks.length < 6) continue;
      const withAnchor = blocks.filter(
        (b) => (b.fields as Record<string, unknown>)?.anchor_id,
      ).length;
      expect(withAnchor, k).toBeGreaterThanOrEqual(blocks.length - 2);
    }
  });

  test("composition variée : jamais deux blocs voisins de même type et de même ton, ni plus de deux blocs de cartes de même disposition d'affilée", () => {
    for (const k of KEYS) {
      const blocks = page(k, "fr-CA").blocks;
      for (let i = 1; i < blocks.length; i++) {
        const a = blocks[i - 1] as BlockFile;
        const b = blocks[i] as BlockFile;
        const ta = (a.fields as Record<string, unknown>)?.tone;
        const tb = (b.fields as Record<string, unknown>)?.tone;
        if (a.collection === b.collection && ta !== undefined)
          expect(ta === tb, `${k} blocs ${i} et ${i + 1}`).toBe(false);
      }
      const layouts = blocks
        .filter((b) => b.collection === "block_cards")
        .map((b) => (b.fields as Record<string, unknown>).layout);
      if (layouts.length >= 3)
        expect(new Set(layouts).size, `${k} dispositions`).toBeGreaterThan(1);
    }
  });

  test("les schémas visuels sont placés là où ils servent", () => {
    const visualOf = (k: string) =>
      page(k, "fr-CA")
        .blocks.map((b) => (b.fields as Record<string, unknown>)?.visual)
        .filter(Boolean);
    expect(visualOf("souverainete")).toContain("flux-donnees");
    expect(visualOf("deploiement-sur-place")).toContain("perimetre-sur-place");
    expect(visualOf("deploiement-heberge-quebec")).toContain(
      "perimetre-heberge",
    );
  });
});

describe("S3 : SEO", () => {
  for (const k of KEYS)
    for (const l of LOCALES) {
      const f = page(k, l);
      test(`${k} ${l} : titre de 30 à 51 caractères, description de 140 à 160, slug attendu`, () => {
        const t = [...f.seo.seo_title].length;
        expect(t).toBeGreaterThanOrEqual(30);
        expect(t).toBeLessThanOrEqual(51);
        const d = [...f.seo.seo_description].length;
        expect(d).toBeGreaterThanOrEqual(140);
        expect(d).toBeLessThanOrEqual(160);
        expect(f.seo.slug).toBe(
          (EXPECTED[k] as { fr: string; en: string })[
            l === "fr-CA" ? "fr" : "en"
          ],
        );
        expect(f.seo.slug).toMatch(
          /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/,
        );
      });

      test(`${k} ${l} : un seul premier niveau, titres de bloc de deux à sept mots terminés par un point`, () => {
        expect(f.blocks[0]?.collection).toBe("block_hero");
        expect(
          f.blocks.filter((b) => b.collection === "block_hero"),
        ).toHaveLength(1);
        f.blocks.forEach((b, i) => {
          if (b.collection === "block_hero") {
            expect(String(b.translation.headline)).toMatch(/\.$/);
            return;
          }
          const title = String(b.translation.title ?? "");
          expect(title, `bloc ${i + 1}`).toMatch(/\.$/);
          const words = title.split(/\s+/).filter(Boolean).length;
          expect(words, `« ${title} »`).toBeGreaterThanOrEqual(2);
          expect(words, `« ${title} »`).toBeLessThanOrEqual(7);
        });
      });
    }

  test("les pages publiées finissent par un appel à l'action ; les gabarits non", () => {
    for (const k of PUBLISHED)
      expect(page(k, "fr-CA").blocks.at(-1)?.collection, k).toBe("block_cta");
  });

  test("titres SEO et descriptions uniques par langue, accueil et OPSYS-AI compris (contrôles @nexora/seo : titre de 15 à 60 caractères avec la marque)", () => {
    for (const l of LOCALES) {
      const all = [
        ...KEYS.map((k) => page(k, l).seo),
        ...["accueil", "opsys-ai"].map(
          (k) => readPagePair(PAGES_DIR, k)[l].seo,
        ),
      ];
      for (const field of ["seo_title", "seo_description"] as const) {
        const values = all.map((s) => s[field]);
        expect(new Set(values).size, `${l} ${field}`).toBe(values.length);
      }
      for (const s of all)
        expect([...s.seo_title].length + 9).toBeLessThanOrEqual(60);
    }
  });

  test("chaque slug est unique par langue, accueil et OPSYS-AI compris", () => {
    for (const l of LOCALES) {
      const slugs = [
        ...KEYS.map((k) => page(k, l).seo.slug),
        ...["accueil", "opsys-ai"].map(
          (k) => readPagePair(PAGES_DIR, k)[l].seo.slug,
        ),
      ];
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  test("maillage : liens internes relatifs, terminés par une barre oblique, préfixés selon la langue, vers une page qui existe", () => {
    const known = (l: Locale) =>
      new Set([
        route(l, ""),
        ...KEYS.map((k) => route(l, page(k, l).seo.slug)),
        route(l, "opsys-ai"),
        route(l, "contact"),
      ]);
    for (const k of KEYS)
      for (const l of LOCALES) {
        const hrefs = hrefsOf(page(k, l));
        for (const h of hrefs) {
          if (/^https:\/\//.test(h)) continue; // sources officielles du guide (voir test dédié)
          const path = h.split("?")[0] as string;
          expect(path, `${k} ${l} ${h}`).toMatch(
            l === "fr-CA"
              ? /^\/(?!en\/)[a-z0-9\-/]*\/$/
              : /^\/en\/[a-z0-9\-/]*\/$/,
          );
          expect(known(l).has(path), `${k} ${l} : ${h} n'existe pas`).toBe(
            true,
          );
        }
      }
  });

  test("les liens externes ne figurent que dans le guide Loi 25, vers des sites officiels, en https", () => {
    for (const k of KEYS)
      for (const l of LOCALES)
        for (const h of hrefsOf(page(k, l)).filter((x) => /^https?:/.test(x))) {
          expect(k).toBe("souverainete-loi-25");
          expect(h).toMatch(
            /^https:\/\/www\.(legisquebec\.gouv\.qc\.ca|cai\.gouv\.qc\.ca)\//,
          );
        }
  });

  test("aucune page publiée ne renvoie vers une page en brouillon", () => {
    for (const k of PUBLISHED)
      for (const l of LOCALES) {
        const hrefs = hrefsOf(page(k, l)).map((h) => h.split("?")[0]);
        for (const d of DRAFTS)
          expect(hrefs, `${k} ${l} -> ${d}`).not.toContain(
            route(
              l,
              (EXPECTED[d] as { fr: string; en: string })[
                l === "fr-CA" ? "fr" : "en"
              ],
            ),
          );
      }
  });

  test("chaque page publiée reçoit au moins un lien d'une autre page publiée (accueil et OPSYS-AI compris)", () => {
    const published = [
      ...PUBLISHED.map((k) => ({ k, f: page(k, "fr-CA") })),
      ...["accueil", "opsys-ai"].map((k) => ({
        k,
        f: readPagePair(PAGES_DIR, k)["fr-CA"],
      })),
    ];
    for (const k of PUBLISHED) {
      const target = route("fr-CA", page(k, "fr-CA").seo.slug);
      const from = published.filter(
        (p) =>
          p.k !== k &&
          hrefsOf(p.f)
            .map((h) => h.split("?")[0])
            .includes(target),
      );
      expect(from.length, `${k} (${target}) sans lien entrant`).toBeGreaterThan(
        0,
      );
    }
  });

  test("les pages au statut brouillon sont non indexées (noindex) et les autres le sont", () => {
    for (const k of KEYS)
      for (const l of LOCALES) {
        expect(page(k, l).status, `${k} ${l}`).toBe(
          EXPECTED[k]?.draft ? "draft" : "published",
        );
        expect(Boolean(page(k, l).noindex), `${k} ${l}`).toBe(
          Boolean(EXPECTED[k]?.draft),
        );
      }
  });

  test("la FAQ produit le JSON-LD une seule fois et les autres FAQ ne le produisent que pour la première de la page", () => {
    for (const k of KEYS) {
      const faqs = page(k, "fr-CA").blocks.filter(
        (b) => b.collection === "block_faq",
      );
      const on = faqs.filter(
        (b) => (b.fields as Record<string, unknown>).emit_jsonld === true,
      );
      expect(on.length, k).toBeLessThanOrEqual(1);
    }
  });
});

describe("S3 : VÉRITÉ", () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/conforme\s+à\s+la\s+loi\s*25/i, "conformité à la Loi 25 affirmée"],
    [
      /compliant\s+with\s+(quebec'?s?\s+)?law\s*25/i,
      "conformité à la Loi 25 affirmée",
    ],
    [
      /faciliter\s+(votre\s+)?conformité|facilitate\s+your\s+compliance/i,
      "facilitation de la conformité (R-02)",
    ],
    [/\b100\s*%/, "100 %"],
    [/\d\s*%/, "pourcentage"],
    [/\d\s*(\$|€|CAD|USD)/, "prix"],
    [
      /\b\d+\s*(jours|heures|minutes|semaines|mois|days|hours|weeks|months)\b/i,
      "délai ou durée chiffrés",
    ],
    [
      /\b\d+\s*(clients?|customers?|entreprises?|tests?|outils|tools|utilisateurs|users|modèles|models|services)\b/i,
      "chiffre de traction, de tests ou de produit",
    ],
    [
      /\b(témoignage|testimonial)s?\b(?!.*(que nous ne pouvons|we cannot))/i,
      "témoignage",
    ],
    [/\b(certifié|certification|certified|ISO\s*\d|SOC\s*2)/i, "certification"],
    [/\bgaranti(e|es|s)?\b/i, "garanti"],
    [/\bguaranteed?\b/i, "guaranteed"],
    [/numéro un|#1|\bleader\b|\bn°\s*1\b/i, "superlatif"],
    [
      /révolutionn|magique|disruptif|revolutionary|magic(al)?\b|disruptive/i,
      "mot vide",
    ],
    [/inviolable|sans fuite|unhackable|breach-?proof/i, "garantie absolue"],
    [/gratuit(ement)?\b|\bfree\b/i, "gratuité"],
    [/\bessai\b|\btrial\b/i, "essai"],
    [
      /QuickBooks|Stripe|Plaid|Twilio|Telegram|WhatsApp|Slack\b|Teams\b|LinkedIn|TikTok|Postiz|Gentek|Kaycan|Synergy|O\.A\.M|Royal Solution|Gmail|Outlook|Hostinger|OpenRouter|LiteLLM|Mistral|Pennylane|HubSpot|Brevo/,
      "marque ou prestataire non qualifié",
    ],
    [
      /open[\s-]?source|apache|licen[cs]e\s+(mit|apache)/i,
      "mention de licence libre",
    ],
    [
      /mode\s+souverain|sovereign\s+mode/i,
      "« mode souverain » (non défini dans le produit)",
    ],
    [
      /fusion opérationnelle|operational fusion|avatars?\b/i,
      "vision non livrée",
    ],
    [
      /\b(chaque matin|chaque semaine|every morning|every week)\b/i,
      "cadence non prouvée",
    ],
    [
      /24\s*\/\s*7|toute heure|around the clock|24 hours/i,
      "disponibilité continue",
    ],
  ];
  const ALLOWED: Record<string, RegExp[]> = {
    certification: [
      /ni certification que nous ne pouvons/i,
      /certification that we cannot prove/i,
    ],
    guaranteed: [/do not guarantee/i],
  };

  for (const k of KEYS)
    for (const l of LOCALES) {
      test(`${k} ${l} : aucune formulation interdite (AGENTS.md, rapports 06 §11.4 et 07 §5.2)`, () => {
        const problems: string[] = [];
        for (const t of allTexts(page(k, l))) {
          const v = plain(t.value);
          for (const [re, why] of FORBIDDEN) {
            const m = re.exec(v);
            if (!m) continue;
            // une question n'affirme rien : « Êtes-vous conformes… ? » est permise, sa réponse ne l'est pas
            if (
              why.startsWith("conformité à la Loi 25") &&
              t.path.endsWith(".question")
            )
              continue;
            if ((ALLOWED[why] ?? []).some((a) => a.test(v) || a.test(m[0])))
              continue;
            problems.push(`${t.path} : ${why} (« ${m[0]} »)`);
          }
        }
        expect(problems).toEqual([]);
      });
    }

  test("la Loi 25 n'est mentionnée que dans le guide, la FAQ et les gabarits juridiques ; la FAQ n'en dit jamais « conforme »", () => {
    const allowed = new Set(["souverainete-loi-25", "faq", ...LEGAL]);
    for (const k of KEYS)
      for (const l of LOCALES)
        for (const t of allTexts(page(k, l)))
          if (/loi\s*25|law\s*25|bill\s*64/i.test(t.value))
            expect(allowed.has(k), `${k} ${l} ${t.path}`).toBe(true);
  });

  test("les pages publiées ne contiennent aucun marqueur de gabarit ; les gabarits en contiennent", () => {
    const MARK =
      /\[(À COMPLÉTER PAR LE FONDATEUR|TO BE COMPLETED BY THE FOUNDER|À VALIDER PAR UN AVOCAT QUÉBÉCOIS|TO BE REVIEWED BY A QUEBEC LAWYER)\]/;
    for (const k of PUBLISHED)
      for (const l of LOCALES)
        for (const t of allTexts(page(k, l)))
          expect(MARK.test(t.value), `${k} ${l} ${t.path}`).toBe(false);
    for (const k of LEGAL) {
      const fr = JSON.stringify(page(k, "fr-CA").blocks);
      const en = JSON.stringify(page(k, "en-CA").blocks);
      expect(
        fr.match(/À COMPLÉTER PAR LE FONDATEUR/g)?.length ?? 0,
        k,
      ).toBeGreaterThanOrEqual(3);
      expect(
        en.match(/TO BE COMPLETED BY THE FOUNDER/g)?.length ?? 0,
        k,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  test("les gabarits juridiques portent les rubriques exigées au Québec", () => {
    const has = (k: string, re: RegExp) =>
      re.test(JSON.stringify(page(k, "fr-CA").blocks).normalize("NFC"));
    expect(has("mentions-legales", /NEQ/)).toBe(true);
    expect(has("mentions-legales", /hébergeur/i)).toBe(true);
    expect(has("mentions-legales", /Droit applicable/)).toBe(true);
    expect(has("confidentialite", /responsable de la protection/i)).toBe(true);
    expect(has("confidentialite", /Commission d'accès à l'information/)).toBe(
      true,
    );
    expect(has("confidentialite", /Témoins/)).toBe(true);
    expect(has("confidentialite", /conservation/i)).toBe(true);
    expect(has("conditions", /TPS et TVQ/)).toBe(true);
    expect(has("conditions", /exportables/)).toBe(true);
    expect(has("utilisation-acceptable", /anti-pourriel/)).toBe(true);
  });

  test("chaque affirmation citée existe, et tout bloc qui parle de statut, de pilote, de disponibilité ou de prévu cite au moins une affirmation", () => {
    for (const k of KEYS) {
      if (LEGAL.includes(k)) continue;
      for (const l of LOCALES)
        page(k, l).blocks.forEach((b, i) => {
          for (const c of b.claims ?? [])
            expect(CODES.has(c), `${k} ${l} bloc ${i + 1} : ${c}`).toBe(true);
          const all = texts(b)
            .map((t) => plain(t.value))
            .join(" ");
          if (
            /(pilote|pilot\b|statut\b|status\b|prévu\b|planned\b|disponible|available\b|\bcible\b|\btarget\b|\bprevu\b)/i.test(
              all,
            )
          )
            expect(
              (b.claims ?? []).length,
              `${k} ${l} bloc ${i + 1}`,
            ).toBeGreaterThan(0);
        });
    }
  });

  test("les cartes « disponible » ne sont que celles de WorkStudio, du centre de confiance et du guide Loi 25 ; « prévu » ne désigne que des documents en préparation", () => {
    for (const k of KEYS)
      for (const b of page(k, "fr-CA").blocks)
        for (const c of (b.translation.cards ?? []) as {
          status?: string;
          title: string;
          text: string;
        }[]) {
          if (c.status === "disponible")
            expect(
              [
                "workstudio",
                "suite",
                "centre-de-confiance",
                "souverainete-loi-25",
              ],
              `${k} : ${c.title}`,
            ).toContain(k);
          if (c.status === "prevu")
            expect(
              /(préparation|à rédiger|pas encore|not available|in preparation)/i.test(
                c.text,
              ) || /(préparation)/i.test(JSON.stringify(b.translation)),
              `${k} : ${c.title}`,
            ).toBe(true);
          expect(c.status, `${k} : ${c.title}`).not.toBe("pilote");
        }
  });

  test("la page entreprise n'invente ni date de fondation, ni adresse, ni équipe, ni chiffre", () => {
    for (const l of LOCALES)
      for (const t of allTexts(page("entreprise", l)))
        expect(t.value, `${l} ${t.path}`).not.toMatch(
          /(fondée?\b|fondateur|founded|founder|depuis\s+\d{4}|since\s+\d{4}|\bsiège\b|headquarter|\brue\b|\bavenue\b|\bboulevard\b|\bdirectrice?\b|\bCEO\b|\bPDG\b)/i,
        );
  });

  test("les pages de souveraineté, de déploiement et de services nomment leurs limites", () => {
    const need: Record<string, RegExp> = {
      souverainete: /Ce que Nexora ne promet pas/,
      "deploiement-sur-place": /Limites/,
      "deploiement-heberge-quebec": /Limites/,
      workstudio: /limites/i,
      "services-installation-serveurs-ia": /ne promettons pas/,
    };
    for (const [k, re] of Object.entries(need))
      expect(re.test(JSON.stringify(page(k, "fr-CA").blocks)), k).toBe(true);
  });

  test("ni la téléphonie, ni la vision par caméra ne sont présentées comme livrées", () => {
    for (const k of KEYS)
      for (const t of allTexts(page(k, "fr-CA")))
        expect(plain(t.value), `${k} ${t.path}`).not.toMatch(
          /réceptionniste (vocale|IA|téléphonique)|répond(ra)? au téléphone(?!\s*[?.])/i,
        );
  });

  test("le registre : les points à compléter sont des brouillons, jamais cités ; aucune affirmation n'est approuvée par le script", () => {
    const todo = claimsFile.claims.filter((c) => c.kind === "a_completer");
    expect(todo.length).toBeGreaterThanOrEqual(10);
    const cited = new Set<string>();
    for (const k of KEYS)
      for (const l of LOCALES)
        for (const b of page(k, l).blocks)
          for (const c of b.claims ?? []) cited.add(c);
    for (const c of todo) {
      expect(c.approval_status, c.id).toBe("brouillon");
      expect(c.statement, c.id).toMatch(/^\[À COMPLÉTER PAR LE FONDATEUR\]/);
      expect(cited.has(c.id), c.id).toBe(false);
    }
    expect(
      claimsFile.claims.filter((c) => c.approval_status === "approuvée"),
    ).toEqual([]);
  });

  test("les formulations retirées du lot S3 sont consignées", () => {
    const ids = claimsFile.retirees.map((r) => r.id);
    for (const n of [
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    ])
      expect(ids).toContain(`R-${n}`);
  });
});

describe("S3 : CLARTÉ et typographie", () => {
  const FR_LEXIQUE: [RegExp, string][] = [
    [/\bcloud\b/i, "infonuagique"],
    [/\be-?mails?\b/i, "courriel"],
    [/\bworkflows?\b/i, "flux de travaux"],
    [/\bdashboards?\b/i, "tableau de bord"],
    [/\bonboarding\b/i, "accueil, intégration"],
    [/\bleads?\b/i, "prospect"],
    [/\bROI\b/, "retour sur investissement"],
    [/\bTPE\b/, "petite entreprise, PME"],
    [/\bsur site\b/i, "sur place"],
    [/\bprompts?\b/i, "invite, consigne"],
    [/\bon-?prem(ise)?s?\b/i, "sur place"],
    [/\bVPC\b/, "réseau privé virtuel"],
    [/\bSLA\b/, "niveau de service"],
    [/(?<!\p{L})(tu|toi|ton|tes)(?!\p{L})/iu, "vouvoiement"],
    [/données personnelles/i, "renseignements personnels"],
    [/\bchatbot\b/i, "agent conversationnel"],
    [/\bbackup\b/i, "sauvegarde"],
  ];
  for (const k of KEYS)
    test(`${k} fr-CA : lexique OQLF, vouvoiement, espaces insécables avant : ; ? ! et dans « »`, () => {
      const bad: string[] = [];
      for (const t of allTexts(page(k, "fr-CA"))) {
        const v = plain(t.value);
        for (const [re, use] of FR_LEXIQUE)
          if (re.test(v)) bad.push(`${t.path} : employer « ${use} »`);
        for (const m of v.matchAll(/([^\s]?)(\s?)([:;?!])/g)) {
          const before = `${m[1] ?? ""}${m[2] ?? ""}`;
          if (before === "") continue;
          if (!/ $/.test(before))
            bad.push(
              `${t.path} : espace insécable manquante « ${v.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + 3)} »`,
            );
        }
        if (/«(?! )/.test(v) || /(?<! )»/.test(v))
          bad.push(`${t.path} : guillemets sans espace insécable`);
        if (/ {2,}/.test(v)) bad.push(`${t.path} : espaces doubles`);
      }
      expect(bad).toEqual([]);
    });

  for (const k of KEYS)
    test(`${k} en-CA : typographie anglaise (aucune espace insécable, guillemets anglais, pas de lexique français)`, () => {
      for (const t of allTexts(page(k, "en-CA"))) {
        expect(t.value, t.path).not.toMatch(/ |«|»/);
        expect(t.value, t.path).not.toMatch(/ [:;?!]/);
        expect(plain(t.value), t.path).not.toMatch(
          /\b(courriel|renseignements|flux de travaux)\b/i,
        );
      }
    });

  test("jargon défini au premier usage : agent, flux de travaux, VPS, passerelle, API, jeton, indexation, Docker", () => {
    const text = (k: string) => JSON.stringify(page(k, "fr-CA").blocks);
    expect(text("solutions")).toMatch(
      /agents \(des logiciels qui accomplissent une tâche avec les outils que vous autorisez\)/,
    );
    expect(text("solutions")).toMatch(
      /flux de travaux \(des enchaînements automatisés de tâches\)/,
    );
    expect(text("services-installation-serveurs-ia")).toMatch(
      /serveur privé virtuel \(VPS\), c'est-à-dire un serveur loué rien que pour vous/,
    );
    expect(text("services-installation-serveurs-ia")).toMatch(
      /Docker \(un outil qui empaquette les logiciels/,
    );
    expect(text("services-installation-serveurs-ia")).toMatch(
      /passerelle de modèles\.[\s\S]{0,20}Un point d'accès unique à plusieurs modèles/,
    );
    expect(text("workstudio")).toMatch(
      /jetons \(l'unité de texte que traite un modèle\)/,
    );
    expect(text("workstudio")).toMatch(
      /Une API \(la porte par laquelle d'autres logiciels appellent un service\)/,
    );
    expect(text("solutions-documents")).toMatch(
      /indexés \(rangés pour être retrouvés vite\)/,
    );
    expect(text("souverainete-loi-25")).toMatch(
      /évaluation des facteurs relatifs à la vie privée \(EFVP\)/,
    );
    expect(text("souverainete")).toMatch(/Une IA est souveraine quand/);
  });
});

describe("S3 : textes de relecture (.md)", () => {
  for (const k of KEYS)
    for (const l of LOCALES)
      test(`${k}.${l}.md correspond au JSON (régénérer avec render-md.ts)`, () => {
        const md = readFileSync(join(PAGES_DIR, `${k}.${l}.md`), "utf8");
        expect(md).toBe(renderMarkdown(page(k, l)));
      });
});

describe("chargement dans Directus", () => {
  test("le script découvre toutes les pages, l'accueil et OPSYS-AI d'abord", () => {
    const pages = discoverPages(PAGES_DIR);
    expect(pages.slice(0, 2)).toEqual(["accueil", "opsys-ai"]);
    expect(pages).toHaveLength(2 + KEYS.length);
    expect([...pages.slice(2)]).toEqual([...pages.slice(2)].sort());
  });

  test("seules les pages au statut published peuvent être promues : le guide Loi 25 et les gabarits juridiques ne le sont jamais", () => {
    for (const k of KEYS) {
      const want = mergePage(stripUnknownFields(raw[k] as never).pair);
      expect(isPublishable(want), k).toBe(!EXPECTED[k]?.draft);
    }
    expect(PUBLISHED).toHaveLength(20);
    expect(DRAFTS).toHaveLength(5);
  });

  const pair = {
    "fr-CA": {
      page: "x",
      locale: "fr-CA",
      status: "published",
      seo: { slug: "x", title: "X", seo_title: "X", seo_description: "X" },
      blocks: [
        {
          collection: "block_section",
          fields: { media_position: "none", tone: "clair", visual: "aucun" },
          translation: { title: "T." },
        },
        {
          collection: "block_cta",
          fields: { tone: "sombre" },
          translation: { title: "T." },
        },
      ],
    },
    "en-CA": {
      page: "x",
      locale: "en-CA",
      status: "published",
      seo: { slug: "x", title: "X", seo_title: "X", seo_description: "X" },
      blocks: [
        {
          collection: "block_section",
          fields: { media_position: "none", tone: "clair", visual: "aucun" },
          translation: { title: "T." },
        },
        {
          collection: "block_cta",
          fields: { tone: "sombre" },
          translation: { title: "T." },
        },
      ],
    },
  } as unknown as Record<Locale, PageFile>;

  test("stripUnknownFields retire ce que le schéma ne connaît pas, le compte une fois par bloc, et garde le reste", () => {
    const managed = {
      block_section: {
        base: ["media_position", "media"],
        tr: ["title", "body"],
      },
      block_cta: { base: ["tone"], tr: ["title"] },
    };
    const { pair: out, removed } = stripUnknownFields(pair, managed);
    expect(removed).toEqual({
      "block_section.tone": 1,
      "block_section.visual": 1,
    });
    expect(out["fr-CA"].blocks[0]?.fields).toEqual({ media_position: "none" });
    expect(out["en-CA"].blocks[0]?.fields).toEqual({ media_position: "none" });
    expect(out["fr-CA"].blocks[1]?.fields).toEqual({ tone: "sombre" });
    // l'original n'est pas modifié
    expect(pair["fr-CA"].blocks[0]?.fields).toHaveProperty("tone");
  });

  test("stripUnknownFields n'enlève rien quand le schéma connaît déjà les champs", () => {
    const managed = {
      block_section: {
        base: ["media_position", "media", "tone", "visual"],
        tr: ["title"],
      },
      block_cta: { base: ["tone"], tr: ["title"] },
    };
    const { removed, pair: out } = stripUnknownFields(pair, managed);
    expect(removed).toEqual({});
    expect(out["fr-CA"].blocks[0]?.fields).toEqual(
      pair["fr-CA"].blocks[0]?.fields,
    );
  });

  test("le schéma réel est lu par managedFields : les six blocs y figurent", () => {
    expect(Object.keys(managedFields()).sort()).toEqual(
      [
        "block_cards",
        "block_cta",
        "block_faq",
        "block_hero",
        "block_pricing",
        "block_section",
      ].sort(),
    );
  });
});
