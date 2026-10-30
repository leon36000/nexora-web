import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STORAGE_PRODUCTS } from "@nexora/db";
import { describe, expect, it } from "vitest";
import { findApp } from "@/i18n/apps";
import {
  PRODUCT_IDS,
  PRODUCTS,
  type ProductId,
  productSwitchOn,
  resolveProducts,
} from "./registry";

const resolve = (
  env: Record<string, string | undefined> = {},
  workstudioUrl: string | null = null,
) => resolveProducts({ env, workstudioUrl });
const byId = (list: ReturnType<typeof resolve>, id: ProductId) => {
  const p = list.find((x) => x.id === id);
  if (!p) throw new Error(`produit absent : ${id}`);
  return p;
};

describe("interrupteurs NEXORA_PRODUCT_*", () => {
  it("n'acceptent que des valeurs explicites ; tout le reste est éteint", () => {
    for (const on of ["1", "true", "TRUE", " on ", "oui", "yes"])
      expect(productSwitchOn(on), on).toBe(true);
    for (const off of [undefined, "", "0", "false", "non", "off", "2", "tru"])
      expect(productSwitchOn(off), String(off)).toBe(false);
  });
});

describe("registre des produits du panneau", () => {
  it("chaque produit est au registre une fois, avec un état résolu", () => {
    const list = resolve();
    expect(list.map((p) => p.id).sort()).toEqual([...PRODUCT_IDS].sort());
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    for (const p of list)
      expect(["disponible", "bientot", "plus_tard"], p.id).toContain(p.state);
  });

  it("Nexora Code et RAG sont « Bientôt » par défaut : un outil non livré n'est jamais présenté comme livré", () => {
    const list = resolve();
    expect(byId(list, "code").state).toBe("bientot");
    expect(byId(list, "rag").state).toBe("bientot");
    expect(byId(list, "code").action).toBe("waitlist");
    expect(byId(list, "rag").action).toBe("waitlist");
  });

  it("NEXORA_PRODUCT_CODE allume Nexora Code seul ; NEXORA_PRODUCT_RAG allume RAG seul", () => {
    const code = resolve({ NEXORA_PRODUCT_CODE: "1" });
    expect(byId(code, "code").state).toBe("disponible");
    expect(byId(code, "code").action).toBe("open_code");
    expect(byId(code, "rag").state).toBe("bientot");
    const rag = resolve({ NEXORA_PRODUCT_RAG: "true" });
    expect(byId(rag, "rag").state).toBe("disponible");
    expect(byId(rag, "rag").action).toBe("create_rag");
    expect(byId(rag, "code").state).toBe("bientot");
  });

  it("WorkStudio garde son interrupteur : disponible seulement quand l'adresse de l'instance est connue", () => {
    const pending = byId(resolve({}, null), "workstudio");
    expect(pending.state).toBe("bientot");
    expect(pending.action).toBe("none");
    const ready = byId(resolve({}, "https://workstudio.example"), "workstudio");
    expect(ready.state).toBe("disponible");
    expect(ready.action).toBe("open_workstudio");
    // Aucun interrupteur NEXORA_PRODUCT_* ne commande WorkStudio.
    expect(
      byId(resolve({ NEXORA_PRODUCT_WORKSTUDIO: "1" }, null), "workstudio")
        .state,
    ).toBe("bientot");
  });

  it("Bot, Creative et WebPilot suivent l'état de leur fiche Nexora Apps (une seule vérité)", () => {
    const list = resolve();
    for (const id of ["bot", "creative", "webpilot"] as const) {
      const app = findApp(id);
      expect(app, id).toBeDefined();
      expect(byId(list, id).state, id).toBe(app?.state);
    }
    expect(byId(list, "creative").state).toBe("plus_tard");
    expect(byId(list, "bot").action).toBe("waitlist");
  });

  it("Privacy Router reste « Bientôt » comme sa fiche, mais sa page du panneau existe : l'action est d'y aller", () => {
    const p = byId(resolve(), "privacy-router");
    expect(p.state).toBe(findApp("privacy-router")?.state);
    expect(p.action).toBe("open_page");
    expect(p.panelPath).toBe("/compte/confidentialite");
  });

  it("VPS est un produit vendu à part (abonnement), sans fiche Apps ni liste d'attente", () => {
    const p = byId(resolve(), "vps");
    expect(p.state).toBe("disponible");
    expect(p.access).toBe("abonnement");
    expect(p.appSlug).toBeNull();
    expect(p.storage).toBeNull();
    expect(p.action).toBe("open_page");
  });

  it("l'accès suit le modèle à crédits : ce qui appelle un modèle consomme des crédits, Privacy Router est inclus", () => {
    const list = resolve();
    for (const id of ["workstudio", "code", "rag", "bot", "webpilot"] as const) {
      expect(byId(list, id).access, id).toBe("credits");
      expect(byId(list, id).consumesCredits, id).toBe(true);
    }
    expect(byId(list, "privacy-router").access).toBe("inclus");
    expect(byId(list, "privacy-router").consumesCredits).toBe(false);
    // Creative : le mode d'accès n'est pas arrêté, comme sa fiche.
    expect(byId(list, "creative").access).toBe("a_definir");
  });

  it("chaque produit d'espace du contrat A est tenu par un seul produit du registre", () => {
    const withSpace = PRODUCTS.filter((p) => p.storage !== null).map(
      (p) => p.storage,
    );
    expect([...withSpace].sort()).toEqual([...STORAGE_PRODUCTS].sort());
  });

  it("une liste d'attente n'existe que pour un produit non livré qui a une fiche Apps", () => {
    for (const p of resolve()) {
      if (p.action === "waitlist") {
        expect(p.state, p.id).not.toBe("disponible");
        expect(p.appSlug, p.id).not.toBeNull();
        expect(findApp(p.appSlug ?? ""), p.id).toBeDefined();
      }
    }
  });

  it("les affirmations citées existent au registre et ne sont pas retirées", () => {
    const registry = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "..", "cms", "content", "claims.json"),
        "utf8",
      ),
    ) as { claims: { id: string; approval_status: string }[] };
    const known = new Map(
      registry.claims.map((c) => [c.id, c.approval_status]),
    );
    for (const p of PRODUCTS) {
      expect(p.claims.length, p.id).toBeGreaterThan(0);
      for (const id of p.claims) {
        expect(known.has(id), `${p.id} ${id}`).toBe(true);
        expect(known.get(id), `${p.id} ${id}`).not.toBe("retirée");
        expect(known.get(id), `${p.id} ${id}`).not.toBe("approuvée");
      }
    }
  });
});
