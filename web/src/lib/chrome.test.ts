import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/get-dictionary";
import type { NavItem } from "@/server/cms/model";
import { buildAlternates } from "./alternates";
import { buildChrome, publishedPageHref, targetExists } from "./chrome";

const item = (
  over: Partial<NavItem> & { id: string; label: string },
): NavItem => ({
  placement: "header",
  style: "link",
  parent: null,
  href: "/x",
  description: null,
  children: [],
  ...over,
});

const alt = buildAlternates([
  { "fr-CA": "souverainete", "en-CA": "sovereignty" },
]);

describe("en-tête, pied de page et légal depuis Directus", () => {
  it("sans navigation (Directus muet), reprend exactement les dictionnaires", () => {
    const chrome = buildChrome("fr", getDictionary("fr"), [], alt);
    const dict = getDictionary("fr");
    expect(chrome.fromCms).toBe(false);
    // refonte « Signal » : Espace de travail ▾ · Solutions ▾ · Infrastructure ▾ · Tarifs · Ressources
    // (le menu « Outils » est devenu « Espace de travail » dans le dictionnaire ; l'essai n'avait pas suivi)
    expect(chrome.header.nav.map((n) => n.label)).toEqual([
      "Espace de travail",
      "Solutions",
      "Infrastructure",
      dict.nav.pricing.label,
      dict.nav.resources.label,
    ]);
    const menus = chrome.header.nav.filter((n) => n.type === "menu");
    expect(menus).toHaveLength(3);
    const solutions = menus.find((m) => m.label === "Solutions");
    expect(solutions?.type === "menu" && solutions.items[0]?.href).toBe(
      "/solutions/reception-virtuelle",
    );
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
          item({
            id: "2a",
            label: "VPS",
            href: "/vps",
            description: "Au Québec.",
          }),
          item({
            id: "2b",
            label: "OPSYS-AI",
            href: "/opsys-ai",
            description: "Équipe.",
          }),
        ],
      }),
      item({ id: "3", label: "Compte", style: "utility", href: "/compte" }),
      item({ id: "4", label: "Diagnostic", style: "button", href: "/contact" }),
    ];
    const { header, fromCms } = buildChrome(
      "fr",
      getDictionary("fr"),
      nav,
      alt,
    );
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
    const nav: NavItem[] = [
      item({ id: "1", label: "Solutions", href: "/solutions" }),
    ];
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
      item({
        id: "l1",
        placement: "legal",
        label: "Confidentialité",
        href: "/confidentialite",
      }),
    ];
    const { footer } = buildChrome("fr", getDictionary("fr"), nav, alt);
    expect(footer.columns).toEqual([
      { title: "Produits", links: [{ label: "VPS", href: "/vps" }] },
    ]);
    expect(footer.legal).toEqual([
      { label: "Confidentialité", href: "/confidentialite" },
    ]);
  });
});

describe("liens vers des pages qui n'existent pas encore", () => {
  const nav: NavItem[] = [
    item({ id: "1", label: "IA souveraine", href: "/souverainete/" }),
    item({ id: "2", label: "Tarifs", href: "/tarifs/" }),
    item({ id: "3", label: "Externe", href: "https://exemple.ca/" }),
    item({
      id: "f1",
      placement: "footer",
      label: "Confiance",
      href: "",
      children: [
        item({ id: "f1a", placement: "footer", label: "VPS", href: "/vps/" }),
        item({
          id: "f1b",
          placement: "footer",
          label: "Fiche",
          href: "/vps/hermes-agent/",
        }),
        item({
          id: "f1c",
          placement: "footer",
          label: "Loi 25",
          href: "/souverainete/loi-25/",
        }),
      ],
    }),
    item({
      id: "l1",
      placement: "legal",
      label: "Mentions légales",
      href: "/mentions-legales/",
    }),
  ];

  it("masque un lien interne qui n'est ni une page publiée ni une route de l'application", () => {
    const exists = targetExists(alt, ["/vps", "/contact", "/compte"]);
    const chrome = buildChrome("fr", getDictionary("fr"), nav, alt, exists);
    expect(chrome.header.nav.map((n) => n.label)).toEqual([
      "IA souveraine",
      "Externe",
    ]);
    expect(chrome.footer.columns[0]?.links.map((l) => l.label)).toEqual([
      "VPS",
      "Fiche",
    ]);
    expect(chrome.footer.legal).toEqual([]);
  });

  it("une colonne du pied de page dont tous les liens sont masqués disparaît avec son titre", () => {
    const withEmpty: NavItem[] = [
      item({
        id: "f1",
        placement: "footer",
        label: "Produits",
        href: "",
        children: [
          item({ id: "f1a", placement: "footer", label: "VPS", href: "/vps/" }),
        ],
      }),
      item({
        id: "f2",
        placement: "footer",
        label: "Ressources",
        href: "",
        children: [
          item({
            id: "f2a",
            placement: "footer",
            label: "Guide Loi 25",
            href: "/ressources/loi-25/",
          }),
          item({
            id: "f2b",
            placement: "footer",
            label: "Tarifs",
            href: "/tarifs/",
          }),
        ],
      }),
    ];
    const exists = targetExists(alt, ["/vps"]);
    const chrome = buildChrome(
      "fr",
      getDictionary("fr"),
      withEmpty,
      alt,
      exists,
    );
    expect(chrome.footer.columns.map((c) => c.title)).toEqual(["Produits"]);
  });

  it("le slug de l'autre langue compte comme une page publiée", () => {
    const exists = targetExists(alt, []);
    expect(exists?.("/sovereignty")).toBe(true);
    expect(exists?.("/en/souverainete/")).toBe(true);
    expect(exists?.("/")).toBe(true);
    expect(exists?.("/#contenu")).toBe(true);
  });

  it("sans table des pages publiées (Directus muet), ne masque rien", () => {
    expect(targetExists(buildAlternates([]), ["/vps"])).toBeUndefined();
    const chrome = buildChrome(
      "fr",
      getDictionary("fr"),
      nav,
      buildAlternates([]),
      undefined,
    );
    expect(chrome.footer.legal).toHaveLength(1);
  });
});

describe("publishedPageHref : lien vers une page éditoriale, jamais vers un 404", () => {
  const published = buildAlternates([
    { "fr-CA": "confidentialite", "en-CA": "privacy" },
    { "fr-CA": "souverainete", "en-CA": "sovereignty" },
  ]);

  it("localise le lien d'une page publiée, avec le slug de la langue d'affichage", () => {
    expect(publishedPageHref(published, "fr", "/confidentialite")).toBe(
      "/confidentialite",
    );
    expect(publishedPageHref(published, "en", "/confidentialite")).toBe(
      "/en/privacy",
    );
  });

  it("renvoie null quand la page n'est pas publiée (brouillon) : le lien n'est pas affiché", () => {
    expect(publishedPageHref(alt, "fr", "/confidentialite")).toBeNull();
    expect(publishedPageHref(alt, "en", "/confidentialite")).toBeNull();
  });

  it("garde le lien quand Directus est muet sans instantané (on ne sait pas)", () => {
    expect(
      publishedPageHref(buildAlternates([]), "fr", "/confidentialite"),
    ).toBe("/confidentialite");
  });

  it("une route de l'application passe", () => {
    expect(publishedPageHref(alt, "en", "/contact", ["/contact"])).toBe(
      "/en/contact",
    );
  });
});
