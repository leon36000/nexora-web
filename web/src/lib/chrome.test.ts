import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import { buildAlternates } from "./alternates";
import { buildChrome } from "./chrome";
import type { NavItem } from "@/server/cms/model";

const item = (over: Partial<NavItem> & { id: string; label: string }): NavItem => ({
  placement: "header",
  style: "link",
  parent: null,
  href: "/x",
  description: null,
  children: [],
  ...over,
});

const alt = buildAlternates([{ "fr-CA": "souverainete", "en-CA": "sovereignty" }]);

describe("en-tête, pied de page et légal depuis Directus", () => {
  it("sans navigation (Directus muet), reprend exactement les dictionnaires", () => {
    const chrome = buildChrome("fr", getDictionary("fr"), [], alt);
    const dict = getDictionary("fr");
    expect(chrome.fromCms).toBe(false);
    // même ordre que le §6 : IA souveraine · Solutions · Produits (menu) · Tarifs · Ressources
    expect(chrome.header.nav.map((n) => n.label)).toEqual([
      dict.nav.sovereignty.label,
      dict.nav.solutions.label,
      dict.nav.products.label,
      dict.nav.pricing.label,
      dict.nav.resources.label,
    ]);
    const menu = chrome.header.nav.find((n) => n.type === "menu");
    expect(menu?.type === "menu" && menu.items).toHaveLength(6);
    expect(chrome.header.login.href).toBe("/compte");
    expect(chrome.header.cta.href).toBe("/contact");
    expect(chrome.footer.columns).toHaveLength(4);
    expect(chrome.footer.legal).toHaveLength(4);
  });

  it("construit l'en-tête : liens, menu Produits (parent sans lien), Connexion (utilitaire) et bouton", () => {
    const nav: NavItem[] = [
      item({ id: "1", label: "IA souveraine", href: "/souverainete" }),
      item({
        id: "2",
        label: "Produits",
        href: "",
        children: [
          item({ id: "2a", label: "VPS", href: "/vps", description: "Au Québec." }),
          item({ id: "2b", label: "OPSYS-AI", href: "/opsys-ai", description: "Équipe." }),
        ],
      }),
      item({ id: "3", label: "Compte", style: "utility", href: "/compte" }),
      item({ id: "4", label: "Diagnostic", style: "button", href: "/contact" }),
    ];
    const { header, fromCms } = buildChrome("fr", getDictionary("fr"), nav, alt);
    expect(fromCms).toBe(true);
    expect(header.nav.map((n) => `${n.type}:${n.label}`)).toEqual([
      "link:IA souveraine",
      "menu:Produits",
    ]);
    const menu = header.nav[1];
    expect(menu?.type === "menu" && menu.items.map((i) => i.label)).toEqual([
      "VPS",
      "OPSYS-AI",
    ]);
    expect(menu?.type === "menu" && menu.items[0]?.description).toBe(
      "Au Québec.",
    );
    expect(header.login.label).toBe("Compte");
    expect(header.cta.label).toBe("Diagnostic");
  });

  it("les liens écrits avec le slug de l'autre langue sont résolus avant d'être rendus", () => {
    const nav: NavItem[] = [
      item({ id: "1", label: "Sovereign AI", href: "/en/souverainete" }),
    ];
    const { header } = buildChrome("en", getDictionary("en"), nav, alt);
    expect(header.nav[0]).toMatchObject({
      type: "link",
      href: "/en/sovereignty",
      path: "/sovereignty",
    });
  });

  it("garde le bouton et Connexion du dictionnaire s'ils manquent dans Directus", () => {
    const nav: NavItem[] = [item({ id: "1", label: "Solutions", href: "/solutions" })];
    const dict = getDictionary("fr");
    const { header } = buildChrome("fr", dict, nav, alt);
    expect(header.cta.label).toBe(dict.nav.cta.label);
    expect(header.login.label).toBe(dict.nav.login.label);
  });

  it("construit le pied de page : colonnes (parents) et mentions légales", () => {
    const nav: NavItem[] = [
      item({ id: "1", label: "Solutions", href: "/solutions" }),
      item({
        id: "f1",
        placement: "footer",
        label: "Produits",
        href: "",
        children: [
          item({ id: "f1a", placement: "footer", label: "VPS", href: "/vps" }),
        ],
      }),
      item({ id: "l1", placement: "legal", label: "Confidentialité", href: "/confidentialite" }),
    ];
    const { footer } = buildChrome("fr", getDictionary("fr"), nav, alt);
    expect(footer.columns).toEqual([
      { title: "Produits", links: [{ label: "VPS", href: "/vps" }] },
    ]);
    expect(footer.legal).toEqual([{ label: "Confidentialité", href: "/confidentialite" }]);
  });
});
