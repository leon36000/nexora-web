import { describe, expect, test } from "bun:test";
import {
  countEntries,
  type ExistingNav,
  flattenNavigation,
  NAVIGATION,
  planNavigation,
} from "./navigation";

describe("navigation du §6", () => {
  const header = NAVIGATION.filter((n) => n.placement === "header");

  test("en-tête : IA souveraine, Solutions, Produits (8 entrées), Tarifs, Ressources, puis Connexion et le bouton", () => {
    expect(header.map((n) => n.fr.label)).toEqual([
      "IA souveraine",
      "Solutions",
      "Produits",
      "Tarifs",
      "Ressources",
      "Connexion",
      "Planifier un diagnostic",
    ]);
    expect(
      header.find((n) => n.fr.label === "Produits")?.children,
    ).toHaveLength(8);
    expect(header.find((n) => n.fr.label === "Connexion")?.style).toBe(
      "utility",
    );
    expect(
      header.find((n) => n.fr.label === "Planifier un diagnostic")?.style,
    ).toBe("button");
  });

  test("OPSYS-AI et la souveraineté restent au premier niveau (D13)", () => {
    expect(header.some((n) => n.fr.label === "IA souveraine")).toBe(true);
    const produits = header.find((n) => n.fr.label === "Produits");
    expect(produits?.children?.map((c) => c.fr.label)).toContain("OPSYS-AI");
    // vague 2 : Croissance et Vision sont au menu, et « Vos données » dans la colonne de confiance du pied de page
    expect(produits?.children?.map((c) => c.fr.href)).toEqual(
      expect.arrayContaining(["/croissance/", "/vision/"]),
    );
    const confiance = NAVIGATION.find(
      (n) => n.placement === "footer" && n.fr.label === "Centre de confiance",
    );
    expect(confiance?.children?.map((c) => c.fr.href)).toContain(
      "/vos-donnees/",
    );
  });

  test("chaque entrée existe dans les deux langues, avec un lien propre à sa langue", () => {
    const all = NAVIGATION.flatMap((n) => [n, ...(n.children ?? [])]);
    for (const e of all) {
      expect(e.fr.label.length).toBeGreaterThan(0);
      expect(e.en.label.length).toBeGreaterThan(0);
      if (e.fr.href === "") {
        expect(e.en.href).toBe("");
        continue;
      }
      expect(e.fr.href.startsWith("/")).toBe(true);
      expect(e.fr.href.startsWith("/en/")).toBe(false);
      expect(e.en.href.startsWith("/en/")).toBe(true);
    }
  });

  test("les entrées du menu Produits ont une description dans les deux langues", () => {
    const produits = header.find((n) => n.fr.label === "Produits");
    for (const c of produits?.children ?? []) {
      expect(c.fr.description?.length ?? 0).toBeGreaterThan(10);
      expect(c.en.description?.length ?? 0).toBeGreaterThan(10);
    }
  });

  test("le pied de page a quatre colonnes ; le légal quatre liens", () => {
    expect(NAVIGATION.filter((n) => n.placement === "footer")).toHaveLength(4);
    expect(NAVIGATION.filter((n) => n.placement === "legal")).toHaveLength(4);
    expect(countEntries()).toBeGreaterThan(30);
  });
});

describe("rapprochement avec l'existant", () => {
  const flat = flattenNavigation();
  const existingTarifs: ExistingNav = {
    id: "n1",
    placement: "header",
    style: "link",
    sort: 3,
    status: "published",
    parent: null,
    translations: [
      {
        id: 1,
        languages_code: "fr-CA",
        label: "Tarifs",
        href: "/tarifs/",
        description: null,
      },
      {
        id: 2,
        languages_code: "en-CA",
        label: "Pricing",
        href: "/en/pricing/",
        description: null,
      },
    ],
  };

  test("un parent précède ses enfants et le rang est propre à l'emplacement", () => {
    const iProduits = flat.findIndex(
      (f) => f.fr.label === "Produits" && f.placement === "header",
    );
    const iVps = flat.findIndex(
      (f) => f.parentLabel === "Produits" && f.fr.label === "VPS",
    );
    expect(iProduits).toBeLessThan(iVps);
    expect(
      flat
        .filter((f) => f.parentLabel === null && f.placement === "header")
        .map((f) => f.sort),
    ).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  test("sans alignement, seules les entrées absentes sont créées ; rien n'est modifié", () => {
    const plan = planNavigation([existingTarifs], flat, false);
    expect(plan.updates).toEqual([]);
    expect(plan.creates.length).toBe(flat.length - 1);
    expect(
      plan.creates.some(
        (c) => c.fr.label === "Tarifs" && c.placement === "header",
      ),
    ).toBe(false);
  });

  test("avec alignement, rang et lien sont réalignés ; un second passage ne change rien", () => {
    const plan = planNavigation([existingTarifs], flat, true);
    const upd = plan.updates.find((u) => u.id === "n1");
    expect(upd?.body.sort).toBe(40);
    expect(JSON.stringify(upd?.body.translations)).toContain("/en/tarifs/");
    // jamais un simple tableau (il remplacerait toutes les traductions et supprimerait les absentes)
    expect(Array.isArray(upd?.body.translations)).toBe(false);
    const tr = upd?.body.translations as { delete: unknown[] } | undefined;
    expect(tr?.delete).toEqual([]);
    const aligned: ExistingNav = {
      ...existingTarifs,
      sort: 40,
      translations: existingTarifs.translations.map((t) => ({
        ...t,
        href: t.languages_code === "fr-CA" ? "/tarifs/" : "/en/tarifs/",
        label: t.label,
      })),
    };
    expect(planNavigation([aligned], flat, true).updates).toEqual([]);
  });
});
