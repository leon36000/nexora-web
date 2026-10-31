import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAlternates } from "@/lib/alternates";

const state = vi.hoisted(() => ({
  lang: "fr" as "fr" | "en",
  pairs: [] as { "fr-CA": string; "en-CA": string }[],
}));
vi.mock("next/root-params", () => ({ lang: async () => state.lang }));
vi.mock("@/server/cms/read", async () => {
  const { buildAlternates: build } = await import("@/lib/alternates");
  return { getAlternates: async () => build(state.pairs) };
});
// Le formulaire est un composant client (adresse, session) : il n'est pas l'objet de ce test.
vi.mock("@/components/account/signup-form", () => ({
  SignupForm: () => <form data-testid="signup-form" />,
}));

import SignupPage from "./page";

const PUBLISHED = [
  { "fr-CA": "conditions", "en-CA": "terms" },
  { "fr-CA": "confidentialite", "en-CA": "privacy" },
];
const render = async (lang: "fr" | "en") => {
  state.lang = lang;
  return renderToStaticMarkup(await SignupPage());
};

describe("inscription : ce que le compte donne, avant le formulaire", () => {
  beforeEach(() => {
    state.lang = "fr";
    state.pairs = PUBLISHED;
  });

  it("dit en vérité ce que donne le compte et que souscription et recharge ne sont pas ouvertes (fr-CA)", async () => {
    const html = await render("fr");
    expect(html).toContain(
      "Un compte donne accès à Mes outils : vos crédits, votre espace et vos produits, avec l’état réel de chacun. La souscription et la recharge ne sont pas encore ouvertes : un compte neuf n’a pas de crédits.",
    );
    // avant le formulaire
    expect(html.indexOf("Un compte donne accès")).toBeLessThan(
      html.indexOf('data-testid="signup-form"'),
    );
  });

  it("même texte en en-CA", async () => {
    const html = await render("en");
    expect(html).toContain(
      "An account gives access to My tools: your credits, your space and your products, with the real state of each. Subscribing and topping up are not open yet: a new account has no credits.",
    );
  });

  it("lie Tarifs, Conditions d'utilisation et Confidentialité, localisés", async () => {
    const fr = await render("fr");
    expect(fr).toMatch(/<a [^>]*href="\/tarifs"[^>]*>[^<]*Tarifs/);
    expect(fr).toMatch(
      /<a [^>]*href="\/conditions"[^>]*>[^<]*Conditions d’utilisation/,
    );
    expect(fr).toMatch(
      /<a [^>]*href="\/confidentialite"[^>]*>[^<]*Confidentialité/,
    );
    const en = await render("en");
    expect(en).toMatch(/<a [^>]*href="\/en\/pricing"[^>]*>[^<]*Pricing/);
    expect(en).toMatch(/<a [^>]*href="\/en\/terms"[^>]*>[^<]*Terms of use/);
    expect(en).toMatch(/<a [^>]*href="\/en\/privacy"[^>]*>[^<]*Privacy/);
  });

  it("omet un lien dont la page n'est pas publiée (jamais de 404) ; Tarifs reste", async () => {
    // seule la confidentialité est publiée
    state.pairs = [{ "fr-CA": "confidentialite", "en-CA": "privacy" }];
    const html = await render("fr");
    expect(html).toContain('href="/tarifs"');
    expect(html).toContain('href="/confidentialite"');
    expect(html).not.toContain('href="/conditions"');
    expect(buildAlternates(state.pairs).fr.conditions).toBeUndefined();
  });
});
