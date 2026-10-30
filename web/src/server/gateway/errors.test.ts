import { describe, expect, it } from "vitest";
import { E } from "./errors";

async function body(res: Response) {
  return (await res.json()) as {
    error: { message: string; code: string; type: string };
  };
}

describe("402 : messages clairs, avec le chemin vers la recharge et l'abonnement", () => {
  it("plus aucun crédit : le dit franchement et renvoie vers la recharge ET l'abonnement", async () => {
    const res = E.insufficient({}, 0n);
    expect(res.status).toBe(402);
    const { error } = await body(res);
    expect(error.code).toBe("insufficient_quota");
    expect(error.type).toBe("insufficient_quota");
    expect(error.message).toMatch(/^Il ne vous reste plus de crédits\./);
    expect(error.message).toContain("/compte/facturation#ajouter-des-fonds");
    expect(error.message).toContain("/tarifs");
  });

  it("moins d'un crédit (une fraction de cent) compte pour « plus de crédits »", async () => {
    const { error } = await body(E.insufficient({}, 9_999n));
    expect(error.message).toMatch(/^Il ne vous reste plus de crédits\./);
  });

  it("il reste des crédits mais pas assez pour la requête : message distinct, mêmes liens", async () => {
    const { error } = await body(E.insufficient({}, 250_000n));
    expect(error.message).not.toMatch(/^Il ne vous reste plus de crédits\./);
    expect(error.message).toMatch(/pas assez de crédits/);
    expect(error.message).toContain("/compte/facturation#ajouter-des-fonds");
  });

  it("sans information sur le solde : message prudent, mêmes liens", async () => {
    const { error } = await body(E.insufficient());
    expect(error.message).toMatch(/pas assez de crédits/);
    expect(error.message).toContain("/tarifs");
  });

  it("compte bloqué (solde négatif) : garde son code et renvoie vers la recharge", async () => {
    const res = E.blocked();
    expect(res.status).toBe(402);
    const { error } = await body(res);
    expect(error.code).toBe("account_blocked");
    expect(error.message).toContain("/compte/facturation#ajouter-des-fonds");
  });

  it("n'écrit jamais un prix dans le message", async () => {
    for (const res of [E.insufficient({}, 0n), E.insufficient(), E.blocked()])
      expect((await body(res)).error.message).not.toMatch(/\d\s?\$/);
  });
});
