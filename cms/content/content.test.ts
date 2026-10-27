// Passe VÉRITÉ, CLARTÉ et SEO automatisées sur le contenu des pages (S2).
// Ces tests protègent les règles d'AGENTS.md : aucun faux client, chiffre, prix, certification ni « conforme à la Loi 25 ».

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BlockFile,
  type ClaimsFile,
  LOCALES,
  type Locale,
  mergePage,
  type PageFile,
  readPagePair,
} from "../scripts/lib/content";
import {
  PAGES_DIR,
  README_PATH,
  readmeWithTable,
  renderMarkdown,
} from "./render-md";

const PAGES = ["accueil", "opsys-ai"] as const;
const claimsFile = JSON.parse(
  readFileSync(join(import.meta.dir, "claims.json"), "utf8"),
) as ClaimsFile;
const CODES = new Set(claimsFile.claims.map((c) => c.id));
const pairs = Object.fromEntries(
  PAGES.map((p) => [p, readPagePair(PAGES_DIR, p)]),
) as Record<(typeof PAGES)[number], Record<Locale, PageFile>>;

/** Toutes les chaînes de contenu visibles d'un bloc, avec leur chemin (sans les liens ni les réglages). */
function texts(b: BlockFile): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      const key = path.split(".").at(-1) ?? "";
      if (/href$/.test(key)) return;
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

describe("structure", () => {
  for (const page of PAGES) {
    test(`${page} : les deux langues fusionnent sans erreur`, () => {
      expect(() => mergePage(pairs[page])).not.toThrow();
    });

    test(`${page} : mêmes listes (cartes, éléments, questions) et mêmes affirmations dans les deux langues`, () => {
      const fr = pairs[page]["fr-CA"].blocks;
      const en = pairs[page]["en-CA"].blocks;
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
        // mêmes champs renseignés (un bouton présent en français l'est en anglais)
        expect(
          Object.keys(o.translation).sort(),
          `bloc ${i + 1} champs`,
        ).toEqual(Object.keys(b.translation).sort());
      });
    });
  }

  test("l'accueil porte le message directeur dans le héros, dans les deux langues", () => {
    const h = (l: Locale) =>
      pairs.accueil[l].blocks[0]?.translation.headline as string;
    expect(h("fr-CA")).toBe(
      "L'IA qui travaille pour votre entreprise. Sous votre contrôle.",
    );
    expect(h("en-CA")).toBe(
      "AI that works for your business. Under your control.",
    );
  });

  test("la page OPSYS-AI traite les dix départements, M1 à M10", () => {
    for (const l of LOCALES) {
      const cards = pairs["opsys-ai"][l].blocks.find(
        (b) =>
          b.collection === "block_cards" &&
          ((b.translation.cards as { title: string }[]) ?? []).length === 10,
      );
      const titles = (
        (cards?.translation.cards ?? []) as { title: string }[]
      ).map((c) => c.title);
      for (let n = 1; n <= 10; n++)
        expect(
          titles.some((t) => t.startsWith(`M${n} `)),
          `M${n} (${l})`,
        ).toBe(true);
    }
  });
});

describe("SEO", () => {
  for (const page of PAGES)
    for (const l of LOCALES) {
      const f = pairs[page][l];
      test(`${page} ${l} : titre ≤ 51 caractères (60 avec le gabarit « %s — Nexora »), description de 140 à 160`, () => {
        expect([...f.seo.seo_title].length).toBeLessThanOrEqual(51);
        expect([...f.seo.seo_title].length).toBeGreaterThanOrEqual(30);
        const n = [...f.seo.seo_description].length;
        expect(n).toBeGreaterThanOrEqual(140);
        expect(n).toBeLessThanOrEqual(160);
      });

      test(`${page} ${l} : un seul premier niveau, titres de bloc courts et ponctués`, () => {
        expect(f.blocks[0]?.collection).toBe("block_hero");
        expect(
          f.blocks.filter((b) => b.collection === "block_hero"),
        ).toHaveLength(1);
        f.blocks.forEach((b, i) => {
          if (b.collection === "block_hero") {
            expect(String(b.translation.headline)).toMatch(/\.$/);
            return;
          }
          // une frise d'étapes sans titre prolonge le bloc de texte qui la précède (même ton, bande continue)
          if (b.fields?.layout === "etapes" && !("title" in b.translation))
            return;
          const title = String(b.translation.title ?? "");
          expect(title, `bloc ${i + 1}`).toMatch(/\.$/);
          const words = title.split(/\s+/).filter(Boolean).length;
          expect(words, `« ${title} »`).toBeLessThanOrEqual(7);
          expect(words, `« ${title} »`).toBeGreaterThanOrEqual(2);
        });
      });
    }

  test("slugs : vide pour l'accueil, « opsys-ai » pour la page phare, sans barre oblique", () => {
    for (const l of LOCALES) {
      expect(pairs.accueil[l].seo.slug).toBe("");
      expect(pairs["opsys-ai"][l].seo.slug).toBe("opsys-ai");
    }
  });

  test("maillage interne : liens relatifs, terminés par une barre oblique, préfixés selon la langue", () => {
    for (const page of PAGES)
      for (const l of LOCALES) {
        const hrefs: string[] = [];
        for (const b of pairs[page][l].blocks) {
          const walk = (v: unknown, key = "") => {
            if (typeof v === "string") {
              if (/href$/.test(key)) hrefs.push(v);
              for (const m of v.matchAll(/href="([^"]+)"/g))
                hrefs.push(m[1] as string);
            } else if (Array.isArray(v)) for (const x of v) walk(x, key);
            else if (v && typeof v === "object")
              for (const [k, x] of Object.entries(v)) walk(x, k);
          };
          walk(b.translation);
        }
        expect(hrefs.length).toBeGreaterThan(0);
        for (const h of hrefs) {
          const path = h.split("?")[0] as string;
          expect(path, h).toMatch(
            l === "fr-CA"
              ? /^\/(?!en\/)[a-z0-9\-/]*\/$/
              : /^\/en\/[a-z0-9\-/]*\/$/,
          );
        }
      }
  });

  test("l'accueil renvoie aux futures pages de la conception §6", () => {
    const wanted = [
      "/solutions/",
      "/deploiement/sur-place/",
      "/deploiement/heberge-quebec/",
      "/workstudio/",
      "/opsys-ai/",
      "/souverainete/",
      "/contact/",
      "/methode/",
      "/suite/",
      "/vps/",
      "/modeles/",
      "/agents/",
    ];
    const hrefs = JSON.stringify(pairs.accueil["fr-CA"].blocks);
    for (const w of wanted)
      expect(hrefs, w).toContain(`"${w}`.replace(/"$/, '"'));
  });
});

describe("VÉRITÉ", () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/conforme\s+à\s+la\s+loi\s*25/i, "conformité à la Loi 25 affirmée"],
    [
      /compliant\s+with\s+(quebec'?s?\s+)?law\s*25/i,
      "conformité à la Loi 25 affirmée",
    ],
    [/\b100\s*%/, "100 %"],
    [/\d\s*%/, "pourcentage"],
    [/\d\s*(\$|€|CAD|USD)/, "prix"],
    [
      /\b\d+\s*(jours|heures|minutes|semaines|mois|days|hours|weeks|months)\b/i,
      "délai ou durée chiffrés",
    ],
    [
      /\b\d+\s*(clients?|customers?|entreprises?|tests?|outils|tools|utilisateurs|users)\b/i,
      "chiffre de traction ou de tests",
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
      /QuickBooks|Stripe|Plaid|Twilio|Telegram|WhatsApp|Slack\b|Teams\b|LinkedIn|TikTok|Postiz|Gentek|Kaycan|Synergy|O\.A\.M|Royal Solution/i,
      "marque ou prestataire non qualifié",
    ],
    [
      /open[\s-]?source|apache|licen[cs]e\s+(mit|apache)/i,
      "mention de licence",
    ],
    [
      /mode\s+souverain\s+(est|existe|disponible)|sovereign\s+mode\s+(is|exists|available)/i,
      "mode souverain affirmé",
    ],
    [
      /fusion opérationnelle|operational fusion|avatars?\b/i,
      "vision non livrée",
    ],
    [
      /\b(chaque matin|chaque semaine|every morning|every week)\b/i,
      "cadence non prouvée",
    ],
  ];
  // Les négations honnêtes sont permises dans quelques phrases précises (FAQ OPSYS-AI et mentions de prix).
  const ALLOWED: Record<string, RegExp[]> = {
    gratuité: [
      /pas d'essai gratuit/i,
      /Existe-t-il un essai gratuit/i,
      /Is there a free trial/i,
    ],
    certification: [
      /ni certification que nous ne pouvons/i,
      /certification that we cannot prove/i,
    ],
    guaranteed: [/do not guarantee/i],
    essai: [
      /Existe-t-il un essai gratuit/i,
      /Is there a free trial/i,
      /Non, pas en libre-service/i,
      /No, not as self-service/i,
    ],
  };

  for (const page of PAGES)
    for (const l of LOCALES) {
      test(`${page} ${l} : aucune formulation interdite (AGENTS.md, rapports 06 §11.4 et 07 §5.2)`, () => {
        const problems: string[] = [];
        for (const t of allTexts(pairs[page][l])) {
          const v = plain(t.value);
          for (const [re, why] of FORBIDDEN) {
            const m = re.exec(v);
            if (!m) continue;
            if ((ALLOWED[why] ?? []).some((a) => a.test(v) || a.test(m[0])))
              continue;
            problems.push(`${t.path} : ${why} (« ${m[0]} »)`);
          }
        }
        expect(problems).toEqual([]);
      });
    }

  test("« essai gratuit » n'apparaît que sous forme de question et de réponse négative (FAQ)", () => {
    for (const l of LOCALES)
      for (const b of pairs["opsys-ai"][l].blocks) {
        if (b.collection === "block_faq") continue;
        for (const t of texts(b))
          expect(plain(t.value), t.path).not.toMatch(
            /essai gratuit|free trial/i,
          );
      }
  });

  test("toute phrase qui parle de « mode souverain » dit qu'il n'est pas défini", () => {
    for (const l of LOCALES)
      for (const f of [pairs.accueil[l], pairs["opsys-ai"][l]])
        for (const t of allTexts(f))
          for (const s of plain(t.value).split(/(?<=[.?!])\s+/))
            if (
              /mode\s+souverain|sovereign\s+mode/i.test(s) &&
              !s.endsWith("?")
            )
              expect(s).toMatch(
                /pas encore|n'est pas|tant qu'il|until it is|not yet|Pas sous|Not under|ne l'annonçons|do not announce/i,
              );
  });

  test("aucune mention de la Loi 25 tant que les trois documents n'existent pas (R-02)", () => {
    for (const page of PAGES)
      for (const l of LOCALES)
        for (const t of allTexts(pairs[page][l]))
          expect(t.value, t.path).not.toMatch(/loi\s*25|law\s*25|bill\s*64/i);
  });

  // Toutes les pages du dossier (accueil, OPSYS-AI et pages du jalon S3) partagent le même registre.
  const EVERY_PAGE = readdirSync(PAGES_DIR)
    .filter((n) => n.endsWith(".fr-CA.json"))
    .map((n) => n.slice(0, -".fr-CA.json".length));
  const everyPair = Object.fromEntries(
    EVERY_PAGE.map((p) => [p, readPagePair(PAGES_DIR, p)]),
  ) as Record<string, Record<Locale, PageFile>>;

  test("chaque affirmation citée existe dans le registre", () => {
    for (const page of EVERY_PAGE)
      for (const l of LOCALES)
        for (const b of (everyPair[page] as Record<Locale, PageFile>)[l].blocks)
          for (const c of b.claims ?? [])
            expect(CODES.has(c), `${page} ${l} : ${c}`).toBe(true);
  });

  test("chaque entrée du registre est utilisée au moins une fois (aucune affirmation orpheline), sauf les points à compléter par le fondateur", () => {
    const used = new Set<string>();
    for (const page of EVERY_PAGE)
      for (const l of LOCALES)
        for (const b of (everyPair[page] as Record<Locale, PageFile>)[l].blocks)
          for (const c of b.claims ?? []) used.add(c);
    const toComplete = new Set(
      claimsFile.claims
        .filter((c) => c.kind === "a_completer")
        .map((c) => c.id),
    );
    expect(
      [...CODES].filter((c) => !used.has(c) && !toComplete.has(c)),
    ).toEqual([]);
  });

  test("tout bloc qui parle de pilote, de statut, de réel ou de cible cite au moins une affirmation", () => {
    for (const page of PAGES)
      for (const l of LOCALES)
        pairs[page][l].blocks.forEach((b, i) => {
          const all = texts(b)
            .map((t) => plain(t.value))
            .join(" ");
          if (
            /(pilote|pilot\b|statut\b|status\b|prévu\b|planned\b|disponible|available\b|\bcible\b|\btarget\b)/i.test(
              all,
            )
          )
            expect(
              (b.claims ?? []).length,
              `${page} ${l} bloc ${i + 1}`,
            ).toBeGreaterThan(0);
        });
  });

  test("le registre est complet : champs, états valides, preuve et source renseignées", () => {
    const ids = claimsFile.claims.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of claimsFile.claims) {
      expect(c.statement.length, c.id).toBeGreaterThan(10);
      expect(c.evidence.length, c.id).toBeGreaterThan(10);
      expect(c.source_version.length, c.id).toBeGreaterThan(5);
      expect(["brouillon", "en_revue", "approuvée", "retirée"]).toContain(
        c.approval_status,
      );
      expect(c.valid_from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("aucune affirmation n'est marquée « approuvée » par le script : seule une personne habilitée l'approuve", () => {
    expect(
      claimsFile.claims.filter((c) => c.approval_status === "approuvée"),
    ).toEqual([]);
  });

  test("les statuts d'OPSYS-AI correspondent au rapport 07 (départements) : badge prudent, détail dans le texte", () => {
    // Le badge porte le statut le plus prudent du département : « pilote » dès qu'une partie du département
    // n'est que pilote (M3, M7 et M10 mêlent « disponible » et « pilote » : le détail le dit dans le texte).
    // « disponible » n'est affiché que si TOUT le département l'est (aucun cas aujourd'hui).
    const mixed: Record<number, RegExp> = {
      3: /Statut\s*: disponible pour le calcul/,
      7: /Statut\s*: disponible après configuration/,
      10: /Statut\s*: disponible pour le journal/,
    };
    for (const l of LOCALES) {
      const cards = (pairs["opsys-ai"][l].blocks.find(
        (b) =>
          b.collection === "block_cards" &&
          ((b.translation.cards as unknown[]) ?? []).length === 10,
      )?.translation.cards ?? []) as { text: string; status?: string }[];
      expect(cards).toHaveLength(10);
      for (const [i, c] of cards.entries()) {
        expect(c.status, `M${i + 1} (${l})`).toBe("pilote");
        const text = c.text.replace(/\u00a0/g, " ");
        // le premier paragraphe décrit le département, le détail suit
        expect(text.split("\n").length, `M${i + 1} (${l}) détail`).toBe(2);
        const re = mixed[i + 1];
        if (l === "fr-CA" && re) expect(text, `M${i + 1}`).toMatch(re);
        // l'ancien en-tête « Statut : pilote. » est porté par le badge, plus par le texte
        if (!re) expect(text, `M${i + 1}`).not.toMatch(/Statut\s*:/);
      }
    }
  });

  test("ce qui n'est pas livré n'est jamais écrit comme livré : pas de « envoyé automatiquement » ni de mode souverain", () => {
    for (const l of LOCALES)
      for (const t of allTexts(pairs["opsys-ai"][l]).filter(
        (x) => !x.path.endsWith(".question"),
      ))
        expect(plain(t.value), t.path).not.toMatch(
          /envoy(é|ée|és)\s+automatiquement|sent\s+automatically|automatically\s+sent/i,
        );
  });
});

describe("CLARTÉ et typographie", () => {
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
    [/\bprompts?\b/i, "invite"],
    [/\bon-?prem(ise)?s?\b/i, "sur place"],
    [/\bVPC\b/, "réseau privé virtuel"],
    [/\bSLA\b/, "niveau de service"],
    [/(?<!\p{L})(tu|toi|ton|tes)(?!\p{L})/iu, "vouvoiement"],
    [/données personnelles/i, "renseignements personnels"],
  ];
  for (const page of PAGES)
    test(`${page} fr-CA : lexique OQLF et vouvoiement`, () => {
      const bad: string[] = [];
      for (const t of allTexts(pairs[page]["fr-CA"]))
        for (const [re, use] of FR_LEXIQUE)
          if (re.test(plain(t.value)))
            bad.push(`${t.path} : employer « ${use} »`);
      expect(bad).toEqual([]);
    });

  for (const page of PAGES)
    test(`${page} fr-CA : espaces insécables avant : ; ? ! et dans « »`, () => {
      const bad: string[] = [];
      for (const t of allTexts(pairs[page]["fr-CA"])) {
        const v = plain(t.value);
        for (const m of v.matchAll(/([^\s]?)(\s?)([:;?!])/g)) {
          const before = `${m[1] ?? ""}${m[2] ?? ""}`;
          if (before === "") continue;
          if (!/[\u00a0 ]$/.test(before))
            bad.push(
              `${t.path} : « ${v.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + 3)} »`,
            );
        }
        if (/«(?!\u00a0)/.test(v) || /(?<!\u00a0)»/.test(v))
          bad.push(`${t.path} : guillemets sans espace insécable`);
        if (/ {2,}/.test(v.replace(/\s+<\/?[a-z]+>\s+/g, " ").trim()))
          bad.push(`${t.path} : espaces doubles`);
      }
      expect(bad).toEqual([]);
    });

  for (const page of PAGES)
    test(`${page} en-CA : typographie anglaise (aucune espace insécable, guillemets anglais)`, () => {
      for (const t of allTexts(pairs[page]["en-CA"])) {
        expect(t.value, t.path).not.toMatch(/\u00a0|«|»/);
        expect(t.value, t.path).not.toMatch(/ [:;?!]/);
      }
    });

  test("jargon défini au premier usage : flux de travaux, agent, VPS, jeton, bus d'événements, souveraine", () => {
    const home = JSON.stringify(pairs.accueil["fr-CA"].blocks);
    const first = (term: RegExp) => home.search(term);
    // la définition précède (ou accompagne) la première occurrence du terme technique
    expect(home).toMatch(/Une IA est souveraine quand/);
    expect(first(/Une IA est souveraine quand/)).toBeLessThan(
      first(/Nexora WorkStudio/),
    );
    expect(home).toMatch(
      /flux de travaux \(des enchaînements automatisés de tâches\)/,
    );
    expect(home).toMatch(/serveur privé virtuel \(VPS\) est un serveur loué/);
    const o = JSON.stringify(pairs["opsys-ai"]["fr-CA"].blocks);
    expect(o).toMatch(/bus d'événements interne[\s\u00a0]: un journal commun/);
    expect(o).toMatch(/jetons \(l'unité de texte que traite un modèle\)/);
    expect(o).toMatch(/serveur privé virtuel \(VPS\)/);
  });
});

describe("textes de relecture (.md)", () => {
  for (const page of PAGES)
    for (const l of LOCALES)
      test(`${page}.${l}.md correspond au JSON (régénérer avec render-md.ts)`, () => {
        const md = readFileSync(join(PAGES_DIR, `${page}.${l}.md`), "utf8");
        expect(md).toBe(renderMarkdown(pairs[page][l]));
      });

  test("le tableau des affirmations du README correspond au registre (régénérer avec render-md.ts)", () => {
    const readme = readFileSync(README_PATH, "utf8");
    expect(readme).toBe(readmeWithTable(readme));
  });
});
