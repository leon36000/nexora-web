// Pages de la vague 2 (27/10/2026) : Nexora Vision, Nexora Croissance, Vos données, politique de confidentialité.
// Ce que ces tests protègent : les statuts honnêtes (D8), les cinq engagements (D7), l'absence de promesse de résultat (recherche 09 §4-5),
// l'absence de ce que la recherche 08 §6.9 classe « à ne pas affirmer », et le maillage vers les pages publiées seulement.

import { describe, expect, test } from "bun:test";
import {
  LOCALES,
  type Locale,
  type PageFile,
  readPagePair,
} from "../scripts/lib/content";
import { PAGES_DIR } from "./render-md";

const read = (k: string) => readPagePair(PAGES_DIR, k);
const vision = read("vision");
const croissance = read("croissance");
const donnees = read("vos-donnees");
const privacy = read("confidentialite");
const accueil = read("accueil");

/** Toutes les chaînes d'une page, avec leur chemin. */
function strings(f: PageFile): { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [
    { path: "seo.seo_title", value: f.seo.seo_title },
    { path: "seo.seo_description", value: f.seo.seo_description },
  ];
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") out.push({ path, value: v });
    else if (Array.isArray(v))
      for (const [i, x] of v.entries()) walk(x, `${path}[${i}]`);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  f.blocks.forEach((b, i) => {
    walk(b.translation, `bloc${i + 1}`);
  });
  return out;
}
const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const text = (f: PageFile) =>
  strings(f)
    .map((s) => plain(s.value))
    .join("\n");
const anchors = (f: PageFile) =>
  f.blocks.map((b) => (b.fields as Record<string, unknown>)?.anchor_id);

describe("Nexora Vision : projet pilote sur invitation, confidentiel par conception", () => {
  for (const l of LOCALES) {
    const f = vision[l];
    const t = text(f);
    const fr = l === "fr-CA";

    test(`${l} : le statut est visible dès le surtitre du héros et rappelé au bas de la page`, () => {
      const hero = f.blocks[0]?.translation;
      expect(String(hero?.eyebrow)).toMatch(
        fr ? /Projet pilote sur invitation/ : /Pilot project, by invitation/,
      );
      expect(String(hero?.subheadline)).toMatch(
        fr ? /projet pilote sur invitation/i : /pilot project by invitation/i,
      );
      expect(f.blocks[0]?.claims).toContain("CL-V01");
      expect(t).toMatch(
        fr
          ? /Aucune installation, aucune mesure/
          : /No installation, no measurement/,
      );
    });

    test(`${l} : jamais présenté comme disponible, installé ou conforme`, () => {
      // « accès anticipé » n'est que l'étape suivante, jamais le statut affiché en tête de page
      expect(JSON.stringify(f.blocks[0])).not.toMatch(
        /accès anticipé|early access/i,
      );
      expect(t).not.toMatch(
        /\b(déjà installé|disponible dès|available now|already installed)\b/i,
      );
      expect(t).not.toMatch(
        /certifi|approuvé par la CAI|agréé|approved by the CAI/i,
      );
      expect(t).not.toMatch(
        /Frigate|Genetec|Verkada|Rhombus|Milestone|Avigilon/,
      );
    });

    test(`${l} : refus écrits (reconnaissance faciale, employés, identité) et avertissement juridique`, () => {
      expect(t).toMatch(
        fr ? /Pas de reconnaissance faciale/ : /No facial recognition/,
      );
      expect(t).toMatch(
        fr ? /Pas d'analyse des employés/ : /No employee analytics/,
      );
      expect(t).toMatch(
        fr ? /n'est pas un avis juridique/ : /not legal advice/,
      );
      expect(t).toMatch(
        fr
          ? /pas l'identité ni l'intention|Pas d'identité, pas d'intention/
          : /No identity, no intent/,
      );
    });

    test(`${l} : aucun taux de détection, aucune réduction de vols, aucun chiffre de performance`, () => {
      for (const s of strings(f))
        expect(plain(s.value), s.path).not.toMatch(
          /\d\s*(%|fois|x)\b|précision|accuracy|taux de détection de|réduit les vols|reduces theft/i,
        );
      expect(t).toMatch(
        fr
          ? /Aucun taux de détection, de fausses alertes ni de baisse des vols/
          : /No detection rate, false-alert rate or drop in theft/,
      );
    });

    test(`${l} : l'appel à rejoindre le pilote mène au formulaire de contact présélectionné`, () => {
      const cta = f.blocks.at(-1)?.translation;
      expect(String(cta?.primary_href)).toBe(
        fr
          ? "/contact/?sujet=pilote-vision"
          : "/en/contact/?sujet=pilote-vision",
      );
      expect(f.blocks[0]?.translation.primary_href).toBe(cta?.primary_href);
    });

    test(`${l} : la FAQ répond sur la reconnaissance faciale, l'entraînement, les employés et la loi`, () => {
      const faq = f.blocks.find((b) => b.collection === "block_faq");
      expect(
        (faq?.fields as Record<string, unknown> | undefined)?.emit_jsonld,
      ).toBe(true);
      const qs = ((faq?.translation.items ?? []) as { question: string }[]).map(
        (q) => q.question,
      );
      expect(qs.length).toBeGreaterThanOrEqual(8);
      expect(qs.join("\n")).toMatch(
        fr ? /reconnaissance faciale/ : /facial recognition/,
      );
      expect(qs.join("\n")).toMatch(fr ? /entraîner une IA/ : /train an AI/);
      expect(qs.join("\n")).toMatch(fr ? /employés/ : /employees/);
    });
  }

  test("le schéma de principe et les engagements de données sont dans la page", () => {
    const visuals = vision["fr-CA"].blocks.map(
      (b) => (b.fields as Record<string, unknown>)?.visual,
    );
    expect(visuals).toContain("vision-sur-place");
    expect(visuals).toContain("engagements-donnees");
  });
});

describe("Nexora Croissance : accès anticipé, transparence, aucune garantie de résultat", () => {
  const PLATFORMS = [
    "Google Ads",
    "Microsoft Advertising",
    "Meta",
    "Facebook",
    "Instagram",
    "Threads",
    "LinkedIn",
    "X",
    "TikTok",
    "YouTube",
    "Pinterest",
    "Snapchat",
    "Bluesky",
    "Mastodon",
    "Telegram",
    "Discord",
    "WhatsApp Business",
    "Reddit",
    "Google Business Profile",
    "Google Search Console",
    "Bing Webmaster Tools",
    "IndexNow",
  ];
  for (const l of LOCALES) {
    const f = croissance[l];
    const t = text(f);
    const fr = l === "fr-CA";

    test(`${l} : statut « accès anticipé » dès le surtitre`, () => {
      expect(String(f.blocks[0]?.translation.eyebrow)).toMatch(
        fr ? /Accès anticipé/ : /Early access/,
      );
      expect(f.blocks[0]?.claims).toContain("CL-G01");
    });

    test(`${l} : tous les éléments demandés sont présents (site, hébergement, SEO, Google Ads, Microsoft, mots-clés, réseaux, notoriété)`, () => {
      for (const re of fr
        ? [
            /site/i,
            /hébergement web gratuit/i,
            /référencement/i,
            /Google Ads/,
            /Microsoft Advertising/,
            /mots-clés/,
            /réseaux sociaux/,
            /notoriété/,
            /Google Business Profile/,
            /analyse de marché/i,
          ]
        : [
            /website/i,
            /free web hosting/i,
            /search/i,
            /Google Ads/,
            /Microsoft Advertising/,
            /keyword/i,
            /social networks/i,
            /reputation/i,
            /Google Business Profile/,
            /market/i,
          ])
        expect(t).toMatch(re);
    });

    test(`${l} : la liste nominative des réseaux et plateformes de la recherche 09 §3 est complète`, () => {
      const block = f.blocks.find(
        (b) =>
          (b.fields as Record<string, unknown>)?.anchor_id === "plateformes",
      );
      const list = JSON.stringify(block?.translation);
      for (const p of PLATFORMS)
        expect(list, p).toMatch(new RegExp(`(^|[^A-Za-z])${p}([^A-Za-z]|$)`));
      expect(plain(String(block?.translation.intro))).toMatch(
        fr
          ? /Aucune connexion n'est annoncée comme active/
          : /No connection is announced as active/,
      );
    });

    test(`${l} : « gratuit » ne paraît jamais sans ses conditions dans la même phrase ; jamais dans le titre ni la description SEO`, () => {
      expect(f.seo.seo_title).not.toMatch(/gratuit|free/i);
      expect(f.seo.seo_description).not.toMatch(/gratuit|free/i);
      for (const s of strings(f).filter((x) => x.path.startsWith("bloc"))) {
        const v = plain(s.value);
        if (!/gratuit|\bfree\b/i.test(v) || s.path.endsWith(".question"))
          continue;
        expect(v, s.path).toMatch(
          fr
            ? /condition|domaine|frais|tant que vous êtes client|ce serait faux/i
            : /condition|domain|fee|as long as you are a client|that would be false/i,
        );
      }
    });

    test(`${l} : l'hébergement inclus affiche ses conditions (domaine, publicité, sortie du client) et refuse « gratuit pour toujours »`, () => {
      const block = f.blocks.find(
        (b) =>
          (b.fields as Record<string, unknown>)?.anchor_id === "hebergement",
      );
      const h = plain(JSON.stringify(block?.translation));
      expect(h).toMatch(fr ? /nom de domaine/ : /domain name/);
      expect(h).toMatch(fr ? /frais de publicité/ : /advertising costs/);
      expect(h).toMatch(
        fr
          ? /Vous repartez avec votre contenu et votre nom de domaine/
          : /leave with your content and your domain name/,
      );
      expect(h).toMatch(
        fr
          ? /pas « gratuit pour toujours »|ni « gratuit pour toujours »/
          : /free forever/,
      );
    });

    test(`${l} : aucune garantie de position, de clients ou de rendement ; transparence et contrôle affichés`, () => {
      expect(t).toMatch(
        fr ? /Aucune position garantie/ : /No ranking guaranteed/,
      );
      expect(t).toMatch(
        fr
          ? /Aucun nombre de clients garanti/
          : /No number of customers guaranteed/,
      );
      expect(t).toMatch(fr ? /plafond de dépenses/ : /spending cap/);
      expect(t).toMatch(fr ? /Vous validez/ : /You validate/);
      expect(t).not.toMatch(
        /première (page|place) (de|sur) Google (garantie|assurée)|top spot guaranteed/i,
      );
    });

    test(`${l} : l'appel à l'action demande l'accès anticipé ; aucun prix`, () => {
      const cta = f.blocks.at(-1)?.translation;
      expect(String(cta?.primary_href)).toBe(
        fr
          ? "/contact/?sujet=acces-croissance"
          : "/en/contact/?sujet=acces-croissance",
      );
      expect(t).not.toMatch(/\d\s*(\$|€|CAD|USD)|prix à partir|pricing from/i);
    });
  }
});

describe("Vos données : les cinq engagements (D7)", () => {
  for (const l of LOCALES) {
    const f = donnees[l];
    const fr = l === "fr-CA";

    test(`${l} : cinq engagements numérotés, chacun cité au registre`, () => {
      const block = f.blocks.find(
        (b) =>
          (b.fields as Record<string, unknown>)?.anchor_id === "engagements",
      );
      const cards = (block?.translation.cards ?? []) as {
        title: string;
        label: string;
        text: string;
      }[];
      expect(cards).toHaveLength(5);
      expect(cards.map((c) => c.label)).toEqual(
        [1, 2, 3, 4, 5].map((n) => `${fr ? "Engagement" : "Commitment"} ${n}`),
      );
      for (const c of ["CL-E01", "CL-E02", "CL-E03", "CL-E04", "CL-E05"])
        expect(block?.claims, c).toContain(c);
      const t = cards.map((c) => `${c.title} ${c.text}`);
      expect(t[0]).toMatch(fr ? /sur votre serveur/ : /on your server/);
      expect(t[1]).toMatch(fr ? /au Québec/ : /in Quebec/);
      expect(t[2]).toMatch(
        fr ? /Jamais d'entraînement/ : /Never used for training/,
      );
      expect(t[3]).toMatch(fr ? /Jamais vendues/ : /Never sold/);
      // l'engagement 5 est une activation explicite, pas un accord tacite
      expect(t[4]).toMatch(
        fr
          ? /Aucun modèle externe sans votre activation/
          : /No external model without your activation/,
      );
    });

    test(`${l} : la comparaison parle de pratiques, jamais d'une entreprise nommée`, () => {
      const t = text(f);
      expect(t).not.toMatch(
        /Google|Microsoft|\bMeta\b|Amazon|OpenAI|Apple|Anthropic|ChatGPT|Copilot|Mistral|Facebook|Azure|\bAWS\b|Gemini|Claude/,
      );
      expect(t).toMatch(fr ? /Nous ne nommons personne/ : /We name no one/);
      const cmp = f.blocks.find(
        (b) =>
          (b.fields as Record<string, unknown>)?.anchor_id === "comparaison",
      );
      for (const c of ["CL-E07", "CL-E08", "CL-E09"])
        expect(cmp?.claims, c).toContain(c);
    });

    test(`${l} : comment c'est vérifié (existant = disponible, en préparation = prévu) et limites écrites`, () => {
      const proofs = f.blocks.find(
        (b) => (b.fields as Record<string, unknown>)?.anchor_id === "preuves",
      );
      const cards = (proofs?.translation.cards ?? []) as {
        status?: string;
        text: string;
      }[];
      expect(
        cards.filter((c) => c.status === "disponible").length,
      ).toBeGreaterThanOrEqual(3);
      const planned = cards.filter((c) => c.status === "prevu");
      expect(planned.length).toBeGreaterThanOrEqual(2);
      for (const c of planned)
        expect(c.text).toMatch(fr ? /préparation/ : /preparation/);
      expect(text(f)).toMatch(
        fr
          ? /Nos limites, écrites noir sur blanc/
          : /Our limits, in black and white/,
      );
    });

    test(`${l} : aucune affirmation de conformité à la Loi 25, aucune comparaison nominative de prix`, () => {
      const t = text(f);
      expect(t).not.toMatch(/conforme à la loi\s*25|compliant with law\s*25/i);
      expect(t).toMatch(
        fr
          ? /Aucun logiciel ni aucun fournisseur ne peut/
          : /No software or supplier can/,
      );
    });
  }

  test("la page ne renvoie pas à la politique de confidentialité tant qu'elle est en brouillon", () => {
    for (const l of LOCALES)
      expect(JSON.stringify(donnees[l].blocks)).not.toMatch(
        /\/confidentialite\/|\/privacy\//,
      );
    expect(privacy["fr-CA"].status).toBe("draft");
  });
});

describe("Politique de confidentialité : complète, en brouillon, marqueurs explicites", () => {
  const SECTIONS = [
    "essentiel",
    "responsable",
    "recueillis",
    "finalites",
    "donnees-clients",
    "partage",
    "hors-quebec",
    "conservation",
    "droits",
    "decisions",
    "temoins",
    "securite",
    "incidents",
    "recours",
    "modifications",
    "a-completer",
  ];
  for (const l of LOCALES) {
    const f = privacy[l];
    const fr = l === "fr-CA";
    test(`${l} : reste en brouillon non indexé, avec les seize rubriques du plan (recherche 10 §6.4)`, () => {
      expect(f.status).toBe("draft");
      expect(f.noindex).toBe(true);
      expect(anchors(f).filter(Boolean)).toEqual(SECTIONS);
    });
    test(`${l} : chaque information propre à l'entreprise est un marqueur explicite avec son objet`, () => {
      const re = fr
        ? /\[À COMPLÉTER PAR LE FONDATEUR : [^\]]+\]/g
        : /\[TO BE COMPLETED BY THE FOUNDER: [^\]]+\]/g;
      const all = JSON.stringify(f.blocks.map((b) => b.translation));
      const found = all.match(re) ?? [];
      expect(found.length).toBeGreaterThanOrEqual(12);
      // aucun marqueur nu (sans objet)
      expect(all).not.toMatch(
        fr
          ? /\[À COMPLÉTER PAR LE FONDATEUR\]/
          : /\[TO BE COMPLETED BY THE FOUNDER\]/,
      );
      for (const topic of fr
        ? [
            "raison sociale",
            "nom, titre",
            "durée de conservation",
            "liste des sous-traitants",
            "pays",
            "date",
          ]
        : [
            "legal name",
            "name, title",
            "retention period",
            "list of sub-processors",
            "countries",
            "date",
          ])
        expect(all, topic).toContain(topic);
    });
    test(`${l} : dit l'essentiel (jamais vendus, jamais d'entraînement), le responsable et le recours à la Commission`, () => {
      const t = text(f);
      expect(t).toMatch(fr ? /Jamais vendus/ : /Never sold/);
      expect(t).toMatch(
        fr ? /Jamais pour entraîner une IA/ : /Never used to train an AI/,
      );
      expect(t).toMatch(
        fr
          ? /responsable de la protection des renseignements personnels/
          : /person in charge of the protection of personal information/,
      );
      expect(t).toMatch(/Commission d'accès à l'information/);
      expect(t).not.toMatch(/données personnelles/);
    });
  }
});

describe("maillage et navigation", () => {
  test("l'accueil renvoie vers Vision, Croissance et Vos données avec le statut honnête de chaque produit", () => {
    for (const l of LOCALES) {
      const json = JSON.stringify(accueil[l].blocks);
      const fr = l === "fr-CA";
      for (const p of fr
        ? ["/vision/", "/croissance/", "/vos-donnees/"]
        : ["/en/vision/", "/en/growth/", "/en/your-data/"])
        expect(json, p).toContain(`"${p}"`);
      const suite = accueil[l].blocks.find(
        (b) =>
          b.translation.title ===
          (fr ? "Une suite, pas une pile." : "A suite, not a pile."),
      );
      const labels = (
        (suite?.translation.cards ?? []) as { title: string; label: string }[]
      ).map((c) => `${c.title} ${c.label}`);
      expect(labels.join("|")).toMatch(
        fr
          ? /Nexora Croissance\. Accès anticipé/
          : /Nexora Croissance\. Early access/,
      );
      expect(labels.join("|")).toMatch(
        fr ? /Nexora Vision\. Projet pilote/ : /Nexora Vision\. Pilot project/,
      );
      expect(labels.join("|")).toMatch(
        fr ? /Nexora WorkStudio\. Disponible/ : /Nexora WorkStudio\. Available/,
      );
    }
  });

  test("les trois pages portent leurs slugs fr / en attendus et sont publiées et indexées", () => {
    const want: [PageFile, PageFile, string, string][] = [
      [vision["fr-CA"], vision["en-CA"], "vision", "vision"],
      [croissance["fr-CA"], croissance["en-CA"], "croissance", "growth"],
      [donnees["fr-CA"], donnees["en-CA"], "vos-donnees", "your-data"],
    ];
    for (const [fr, en, sf, se] of want) {
      expect(fr.seo.slug).toBe(sf);
      expect(en.seo.slug).toBe(se);
      for (const f of [fr, en]) {
        expect(f.status).toBe("published");
        expect(f.noindex).toBeFalsy();
      }
    }
  });

  test("chaque page de la vague 2 a ses ancres de sommaire (au moins trois)", () => {
    for (const pair of [vision, croissance, donnees])
      for (const l of LOCALES as readonly Locale[])
        expect(anchors(pair[l]).filter(Boolean).length).toBeGreaterThanOrEqual(
          3,
        );
  });
});
