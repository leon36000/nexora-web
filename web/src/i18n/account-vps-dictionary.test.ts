import { describe, expect, it } from "vitest";
import { PROGRESS_STEPS } from "@/components/account/vps-logic";
import { OPAQUE_MESSAGE_KINDS } from "@/server/vps/account";
import { getAccountVpsDictionary } from "./account-vps";
import { accountEnCA } from "./dictionaries/account-en-CA";
import { accountFrCA } from "./dictionaries/account-fr-CA";

/** Chemins de toutes les chaînes d'un dictionnaire (`a.b.c`) avec leur valeur. */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) =>
      leaves(v, path ? `${path}.${k}` : k),
    );
  throw new Error(`valeur inattendue à ${path}`);
}
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const fr = leaves(getAccountVpsDictionary("fr"));
const en = leaves(getAccountVpsDictionary("en"));

describe("dictionnaires « Mes VPS »", () => {
  it("fr-CA et en-CA ont exactement les mêmes clés, dans le même ordre", () => {
    expect(en.map(([k]) => k)).toEqual(fr.map(([k]) => k));
  });

  it("aucune chaîne vide, et les mêmes marqueurs {nom} dans les deux langues", () => {
    const enByKey = new Map(en);
    for (const [key, text] of fr) {
      expect(text.trim(), `fr ${key}`).not.toBe("");
      expect(enByKey.get(key)?.trim(), `en ${key}`).not.toBe("");
      expect(placeholders(enByKey.get(key) ?? ""), key).toEqual(
        placeholders(text),
      );
    }
  });

  it("l'anglais ne recopie pas le français (phrases de trois mots et plus)", () => {
    const enByKey = new Map(en);
    const words = (text: string) =>
      text
        .replace(/\{\w+\}/g, "")
        .split(/\s+/)
        .filter((w) => /[a-zà-ÿ]{2,}/i.test(w));
    const same = fr.filter(
      ([key, text]) => text === enByKey.get(key) && words(text).length >= 3,
    );
    expect(same).toEqual([]);
  });

  it("le journal traduit chaque type dont le texte d'origine n'est pas rendu, et les événements courants", () => {
    for (const lang of ["fr", "en"] as const) {
      const kinds = getAccountVpsDictionary(lang).journal.kinds as Record<
        string,
        string
      >;
      for (const kind of [
        ...OPAQUE_MESSAGE_KINDS,
        "order_created",
        "paid",
        "active",
        "power_start",
        "power_stop",
        "power_reboot",
        "suspended",
        "resumed",
        "canceled",
        "cancel_requested",
        "deleted",
        "reinstall_started",
        "reinstall_done",
      ])
        expect(kinds[kind], `${lang} ${kind}`).toBeTruthy();
    }
  });

  it("chaque étape de progression et chaque erreur de l'API d'action a son libellé", () => {
    for (const lang of ["fr", "en"] as const) {
      const t = getAccountVpsDictionary(lang);
      for (const stage of PROGRESS_STEPS)
        expect(t.progress.stages[stage]).toBeTruthy();
      for (const code of [
        "not_active",
        "confirmation_required",
        "forbidden",
        "rate_limited",
        "no_subscription",
        "not_found",
        "unauthenticated",
        "generic",
      ])
        expect(t.errors, `${lang} ${code}`).toHaveProperty(code);
    }
  });

  it("l'avertissement de réinstallation nomme les 7 jours et la récupération par l'équipe, sans promettre une sauvegarde", () => {
    const fr = getAccountVpsDictionary("fr").dialog.reinstall.warning;
    expect(fr).toContain("Toutes les données du disque seront effacées");
    expect(fr).toContain("7 jours");
    expect(fr).toContain("ce n’est pas une sauvegarde en libre-service");
    const en = getAccountVpsDictionary("en").dialog.reinstall.warning;
    expect(en).toContain("7 days");
    expect(en).toMatch(/not a self-service backup/);
  });
});

describe("lien du tableau de bord", () => {
  it("le tableau de bord du compte a sa carte « Mes VPS » dans les deux langues", () => {
    expect(accountFrCA.dashboard.vps).toMatchObject({ title: "Mes VPS" });
    expect(accountEnCA.dashboard.vps).toMatchObject({ title: "My VPS" });
    expect(accountFrCA.dashboard.vps.link).not.toBe(
      accountEnCA.dashboard.vps.link,
    );
  });
});
