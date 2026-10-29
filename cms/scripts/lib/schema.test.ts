import { describe, expect, test } from "bun:test";
import { managedFields } from "./content";
import {
  ANCHOR_PATTERN,
  BLOCK_TYPES,
  buildSchema,
  CARD_STATUSES,
  type FieldDef,
} from "./schema";

const { collections } = buildSchema();
const field = (collection: string, name: string): FieldDef => {
  const f = collections
    .find((c) => c.collection === collection)
    ?.fields.find((x) => x.field === name);
  if (!f) throw new Error(`champ ${collection}.${name} absent du schéma`);
  return f;
};
const choices = (f: FieldDef): string[] =>
  (
    (f.meta?.options as { choices: { value: string }[] } | undefined)
      ?.choices ?? []
  ).map((c) => c.value);

describe("variantes de composition (S3)", () => {
  test("le ton : sombre, clair ou sable (clair par défaut) sur section, cartes, tarifs et FAQ", () => {
    for (const block of [
      "block_section",
      "block_cards",
      "block_pricing",
      "block_faq",
    ]) {
      const f = field(block, "tone");
      expect(choices(f)).toEqual(["sombre", "clair", "sable"]);
      expect(f.schema?.default_value).toBe("clair");
    }
  });

  test("héros et appel à l'action alignent leurs valeurs sur sombre, clair, sable", () => {
    expect(choices(field("block_hero", "variant"))).toEqual([
      "sombre",
      "clair",
      "sable",
    ]);
    expect(choices(field("block_cta", "tone"))).toEqual([
      "sombre",
      "clair",
      "sable",
    ]);
  });

  test("layout des cartes : grille par défaut, liste, étapes, modules, mosaïque", () => {
    const f = field("block_cards", "layout");
    expect(choices(f)).toEqual([
      "grille",
      "liste",
      "etapes",
      "modules",
      "bento",
    ]);
    expect(f.schema?.default_value).toBe("grille");
  });

  test("visuel des sections : aucun par défaut, schémas de périmètre, maquettes d'interface et schémas de principe", () => {
    const f = field("block_section", "visual");
    expect(choices(f)).toEqual([
      "aucun",
      "perimetre-sur-place",
      "perimetre-heberge",
      "flux-donnees",
      "flux-workstudio",
      "catalogue-modeles",
      "console-vps",
      "tableau-de-bord",
      "vision-sur-place",
      "croissance-canaux",
      "engagements-donnees",
    ]);
    expect(f.schema?.default_value).toBe("aucun");
  });

  test("anchor_id sur les six blocs, avec le motif ^[a-z0-9-]{0,40}$", () => {
    expect(ANCHOR_PATTERN).toBe("^[a-z0-9-]{0,40}$");
    for (const block of BLOCK_TYPES) {
      const f = field(block, "anchor_id");
      expect(f.type).toBe("string");
      expect(JSON.stringify(f.meta?.validation)).toContain(ANCHOR_PATTERN);
      expect(f.schema?.max_length).toBe(40);
    }
  });

  test("le statut d'une carte : disponible, accès anticipé, pilote, prévu ou vide", () => {
    expect(CARD_STATUSES).toEqual([
      "disponible",
      "acces-anticipe",
      "qualifie-localement",
      "en-developpement",
      "pilote",
      "prevu",
    ]);
    const cards = field("block_cards_translations", "cards");
    const options = cards.meta?.options as
      | {
          fields: {
            field: string;
            meta: { options?: { choices: unknown[] } };
          }[];
        }
      | undefined;
    const listFields = options?.fields ?? [];
    const status = listFields.find((x) => x.field === "status");
    expect(status).toBeDefined();
    expect(JSON.stringify(status?.meta.options?.choices)).toContain("prevu");
    expect(JSON.stringify(status?.meta.options?.choices)).toContain(
      "acces-anticipe",
    );
    expect(listFields.map((x) => x.field)).toEqual(
      expect.arrayContaining(["title", "text", "href", "link_label", "label"]),
    );
  });

  test("les nouveaux champs sont des champs de contenu : un fichier de page peut les porter", () => {
    const m = managedFields();
    expect(m.block_section?.base).toEqual(
      expect.arrayContaining(["tone", "visual", "anchor_id"]),
    );
    expect(m.block_cards?.base).toEqual(
      expect.arrayContaining(["tone", "layout", "anchor_id"]),
    );
    expect(m.block_pricing?.base).toContain("tone");
    expect(m.block_faq?.base).toContain("tone");
  });
});

describe("plans d'abonnement : identifiants Stripe", () => {
  test("« Publier vers Stripe » (module Paiements) écrit les identifiants ; ils restent modifiables à la main en dépannage", () => {
    for (const f of ["stripe_product_id", "stripe_price_id"]) {
      const def = field("subscription_plans", f);
      expect(def.meta?.readonly ?? false).toBe(false);
      expect(String(def.meta?.note)).toContain("Publier vers Stripe");
    }
  });
});

describe("navigation", () => {
  test("un lien d'utilité (Connexion) et une description de menu sont possibles", () => {
    expect(choices(field("navigation", "style"))).toEqual([
      "link",
      "button",
      "utility",
    ]);
    expect(field("navigation_translations", "description")).toBeDefined();
    // un parent qui n'ouvre qu'un menu n'a pas de lien
    expect(field("navigation_translations", "href").meta?.required).toBe(false);
  });
});

describe("offres d'abonnement : essai, famille et prix suggéré (vague 2)", () => {
  test("la famille regroupe les lignes mensuelle et annuelle d'une offre", () => {
    expect(field("subscription_plans", "family").type).toBe("string");
  });

  test("l'essai gratuit : durée en jours (0 par défaut) et carte exigée selon le réglage général ou l'offre", () => {
    expect(
      field("subscription_plans", "trial_days").schema?.default_value,
    ).toBe(0);
    const card = field("subscription_plans", "trial_card");
    expect(choices(card)).toEqual(["default", "required", "not_required"]);
    expect(card.schema?.default_value).toBe("default");
  });

  test("le prix suggéré est un champ distinct du prix, jamais obligatoire", () => {
    const suggested = field("subscription_plans", "suggested_price_cents");
    expect(suggested.type).toBe("integer");
    expect(suggested.meta?.required).toBeFalsy();
  });

  test("le prix peut rester vide en brouillon : la publication sans prix est bloquée par le site (jamais à 0 $)", () => {
    expect(
      field("subscription_plans", "price_cents").meta?.required,
    ).toBeFalsy();
  });
});

describe("vidéo : sous-titres et média vidéo d'une section (S10)", () => {
  test("la traduction d'une section porte les sous-titres (fichier, « Sous-titres (.vtt) »)", () => {
    const f = field("block_section_translations", "media_captions");
    expect(f.type).toBe("uuid");
    expect(f.meta?.special).toEqual(["file"]);
    expect(f.meta?.translations).toContainEqual(
      expect.objectContaining({ translation: "Sous-titres (.vtt)" }),
    );
  });

  test("les sous-titres sont une relation vers les fichiers Directus, sans effacer la traduction", () => {
    const { relations } = buildSchema();
    const rel = relations.find(
      (r) =>
        r.collection === "block_section_translations" &&
        r.field === "media_captions",
    );
    expect(rel?.related_collection).toBe("directus_files");
    expect(rel?.schema?.on_delete).toBe("SET NULL");
  });

  test("le média d'une section accepte une vidéo (note d'aide)", () => {
    expect(String(field("block_section", "media").meta?.note)).toMatch(
      /vidéo/i,
    );
  });

  test("aucune collection ajoutée : Directus sans licence est plafonné à 25 (24 utilisées)", () => {
    expect(collections.map((c) => c.collection)).toHaveLength(24);
  });
});

describe("texte riche des sections (tableaux et code)", () => {
  test("la barre d'outils de l'éditeur propose le tableau et le bloc de code, que le site sait rendre", () => {
    const toolbar =
      (
        field("block_section_translations", "body").meta?.options as
          | { toolbar: string[] }
          | undefined
      )?.toolbar ?? [];
    expect(toolbar).toContain("table");
    expect(toolbar).toContain("codeblock");
    // les anciens boutons restent
    for (const b of [
      "bold",
      "italic",
      "link",
      "bullist",
      "numlist",
      "h2",
      "h3",
    ])
      expect(toolbar).toContain(b);
  });
});
