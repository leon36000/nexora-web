import { describe, expect, it } from "vitest";
import { CONTACT_SUBJECTS, resolveContactSubject } from "@/lib/contact-subject";
import {
  APP_SLUG,
  APP_STATES,
  APPS,
  type AppDef,
  appContactHref,
  appMeta,
  findApp,
  getAppContent,
  getAppsDictionary,
  listMeta,
} from "./apps";
import { LANGS, type Lang } from "./config";
import { getDictionary } from "./get-dictionary";

/** Toutes les chaînes d'un objet de dictionnaire (valeurs seulement). */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object")
    return Object.values(value).flatMap(strings);
  return [];
}

const eachApp = (fn: (slug: string, lang: Lang) => void) => {
  for (const app of APPS) for (const lang of LANGS) fn(app.slug, lang);
};

describe("registre des Nexora Apps", () => {
  it("les identifiants sont uniques et sûrs pour une adresse, les états sont valides", () => {
    const slugs = APPS.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const app of APPS) {
      expect(app.slug, app.slug).toMatch(APP_SLUG);
      expect(APP_STATES, app.slug).toContain(app.state);
    }
  });

  it("chaque produit a ses deux langues : nom, accroche, public, une chose à venir et trois questions au moins", () => {
    eachApp((slug, lang) => {
      const c = getAppContent(lang, slug);
      const where = `${slug} ${lang}`;
      expect(c, where).toBeDefined();
      if (!c) return;
      expect(c.name.trim(), where).not.toBe("");
      expect(c.hook.trim(), where).not.toBe("");
      expect(c.audience.trim(), where).not.toBe("");
      expect(c.accessLabel.trim(), where).not.toBe("");
      expect(c.accessText.trim(), where).not.toBe("");
      expect(c.coming.length, where).toBeGreaterThanOrEqual(1);
      expect(c.faq.length, where).toBeGreaterThanOrEqual(3);
      for (const q of c.faq) {
        expect(q.question.trim(), where).not.toBe("");
        expect(q.answer.trim(), where).not.toBe("");
      }
    });
  });

  it("mêmes listes dans les deux langues (prêt, à venir, questions) et aucun contenu sans entrée au registre", () => {
    for (const app of APPS) {
      const fr = getAppContent("fr", app.slug);
      const en = getAppContent("en", app.slug);
      expect(en?.ready.length, app.slug).toBe(fr?.ready.length);
      expect(en?.coming.length, app.slug).toBe(fr?.coming.length);
      expect(en?.faq.length, app.slug).toBe(fr?.faq.length);
    }
    const registered = APPS.map((a) => a.slug).sort();
    for (const lang of LANGS)
      expect(Object.keys(getAppsDictionary(lang).apps).sort(), lang).toEqual(
        registered,
      );
  });

  it("l'état est honnête : « disponible » exige du livré, « plus tard » n'en annonce pas", () => {
    const apps: readonly AppDef[] = APPS;
    for (const app of apps) {
      const ready = getAppContent("fr", app.slug)?.ready ?? [];
      if (app.state === "disponible")
        expect(ready.length, app.slug).toBeGreaterThan(0);
      if (app.state === "plus_tard") expect(ready, app.slug).toEqual([]);
    }
  });

  it("aucun chiffre de performance, prix, date ni promesse absolue dans les textes", () => {
    const forbidden: [RegExp, string][] = [
      [/\d\s*(%|\$|€|CAD|USD|ms\b|fois|x\b|Go\b|To\b|ko\b|Mo\b)/i, "chiffre"],
      [/\b20\d{2}\b/, "année ou date"],
      [/garanti|guarantee/i, "garantie"],
      [/\bleader\b|numéro un|#1|meilleur que|better than/i, "superlatif"],
      [/loi\s*25|law\s*25/i, "Loi 25"],
      [/certifi/i, "certification"],
      [/conforme|compliant/i, "conformité"],
      [/révolutionn|magique|revolutionary|magic(al)?\b/i, "mot vide"],
    ];
    for (const lang of LANGS) {
      const t = getAppsDictionary(lang);
      for (const s of strings(t)) {
        for (const [re, why] of forbidden)
          expect(re.test(s), `${lang} « ${s} » : ${why}`).toBe(false);
      }
    }
  });

  it("les métadonnées respectent les longueurs de l'audit SEO et ne se répètent pas dans une langue", () => {
    for (const lang of LANGS) {
      const metas = [listMeta(lang), ...APPS.map((a) => appMeta(lang, a.slug))];
      for (const m of metas) {
        expect(m, lang).not.toBeNull();
        if (!m) continue;
        const title = [...m.title].length;
        const description = [...m.description].length;
        expect(title, m.title).toBeGreaterThanOrEqual(15);
        expect(title, m.title).toBeLessThanOrEqual(65);
        expect(description, m.description).toBeGreaterThanOrEqual(70);
        expect(description, m.description).toBeLessThanOrEqual(160);
        expect(m.title).toMatch(/ \| Nexora AI$/);
      }
      const titles = metas.map((m) => m?.title);
      const descriptions = metas.map((m) => m?.description);
      expect(new Set(titles).size, `titres ${lang}`).toBe(titles.length);
      expect(new Set(descriptions).size, `descriptions ${lang}`).toBe(
        descriptions.length,
      );
    }
  });
});

describe("recherche d'une fiche", () => {
  it("un identifiant inconnu ou hostile ne trouve rien (aucune propriété héritée)", () => {
    for (const slug of [
      "",
      "inconnu",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "../webpilot",
      "WEBPILOT",
      "webpilot/",
      "webpilot ",
    ]) {
      expect(findApp(slug), slug).toBeUndefined();
      for (const lang of LANGS) {
        expect(getAppContent(lang, slug), `${lang} ${slug}`).toBeUndefined();
        expect(appMeta(lang, slug), `${lang} ${slug}`).toBeNull();
      }
    }
  });
});

describe("Nexora Privacy Router", () => {
  it("dit clairement, dans les deux langues, qu'elle est incluse par défaut et jamais payante", () => {
    expect(findApp("privacy-router")?.access).toBe("inclus");
    const fr = getAppContent("fr", "privacy-router");
    const en = getAppContent("en", "privacy-router");
    expect(`${fr?.accessLabel} ${fr?.accessText}`).toMatch(/incluse/i);
    expect(`${fr?.accessLabel} ${fr?.accessText}`).toMatch(/jamais payante/i);
    expect(`${en?.accessLabel} ${en?.accessText}`).toMatch(/included/i);
    expect(`${en?.accessLabel} ${en?.accessText}`).toMatch(/never (a )?paid/i);
  });

  it("aucun autre produit n'est annoncé comme « inclus » : l'inclusion ne vaut que pour elle", () => {
    expect(
      APPS.filter((a) => a.access === "inclus").map((a) => a.slug),
    ).toEqual(["privacy-router"]);
  });
});

describe("appel à l'action", () => {
  it("WebPilot renvoie à la liste d'attente", () => {
    expect(findApp("webpilot")?.cta).toBe("waitlist");
  });

  it("le lien de contact porte ?sujet=, localisé selon la langue", () => {
    expect(appContactHref("fr", "webpilot")).toBe(
      "/contact?sujet=apps-webpilot",
    );
    expect(appContactHref("en", "webpilot")).toBe(
      "/en/contact?sujet=apps-webpilot",
    );
  });

  it("le formulaire de contact reconnaît le sujet de chaque fiche et préremplit un message dans les deux langues", () => {
    const needs = Object.keys(getDictionary("fr").contact.form.need.options);
    eachApp((slug, lang) => {
      const subject = `apps-${slug}`;
      const prefills = getDictionary(lang).contact.form.message.prefill;
      const r = resolveContactSubject(subject, prefills);
      expect(r.need, `${slug} ${lang}`).toBeDefined();
      expect(needs, `${slug} ${lang}`).toContain(r.need);
      expect(r.message?.trim(), `${slug} ${lang}`).toBeTruthy();
      expect(CONTACT_SUBJECTS).toHaveProperty(subject);
    });
  });
});
