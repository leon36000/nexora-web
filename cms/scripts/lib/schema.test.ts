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

  test("layout des cartes : grille par défaut, liste, étapes, modules", () => {
    const f = field("block_cards", "layout");
    expect(choices(f)).toEqual(["grille", "liste", "etapes", "modules"]);
    expect(f.schema?.default_value).toBe("grille");
  });

  test("visuel des sections : aucun par défaut, deux périmètres, flux de données", () => {
    const f = field("block_section", "visual");
    expect(choices(f)).toEqual([
      "aucun",
      "perimetre-sur-place",
      "perimetre-heberge",
      "flux-donnees",
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

  test("le statut d'une carte : disponible, pilote, prévu ou vide", () => {
    expect(CARD_STATUSES).toEqual(["disponible", "pilote", "prevu"]);
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
  test("aucun automate n'écrit les identifiants Stripe dans Directus : ils ne sont pas en lecture seule pour l'administrateur", () => {
    for (const f of ["stripe_product_id", "stripe_price_id"]) {
      const def = field("subscription_plans", f);
      expect(def.meta?.readonly ?? false).toBe(false);
      expect(String(def.meta?.note)).toContain("publish-plan");
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
