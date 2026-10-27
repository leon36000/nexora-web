import type { SubscriptionStatus, VpsInstanceStatus } from "@nexora/db";
import { describe, expect, it } from "vitest";
import {
  decideLifecycle,
  type LifecycleDecision,
  orderPaymentAction,
  retentionEnd,
} from "./lifecycle.ts";

const NOW = new Date("2026-11-01T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function decide(
  instance: VpsInstanceStatus,
  sub: SubscriptionStatus | null,
  extra: { graceEndsAt?: Date | null; retentionEndsAt?: Date | null } = {},
): LifecycleDecision["kind"] {
  return decideLifecycle({
    instance: {
      status: instance,
      retentionEndsAt: extra.retentionEndsAt ?? null,
    },
    subscription: sub
      ? { status: sub, graceEndsAt: extra.graceEndsAt ?? null }
      : null,
    now: NOW,
  }).kind;
}

describe("décision du cycle de vie d'un VPS (D7)", () => {
  it("laisse tourner un VPS dont l'abonnement est actif", () => {
    expect(decide("active", "active")).toBe("noop");
    expect(decide("active", "trialing")).toBe("noop");
  });

  it("garde le service pendant le délai de grâce, le suspend après", () => {
    expect(decide("active", "past_due", { graceEndsAt: day(3) })).toBe("noop");
    expect(decide("active", "past_due", { graceEndsAt: day(-1) })).toBe(
      "suspend",
    );
    expect(decide("active", "past_due", { graceEndsAt: null })).toBe("suspend");
    expect(decide("active", "unpaid")).toBe("suspend");
    expect(decide("active", "paused")).toBe("suspend");
  });

  it("reprend un VPS suspendu dès que l'abonnement redevient actif", () => {
    expect(decide("suspended", "active")).toBe("resume");
    expect(decide("suspended", "past_due", { graceEndsAt: day(2) })).toBe(
      "resume",
    );
  });

  it("ne reprend pas un VPS suspendu tant que le paiement manque", () => {
    expect(decide("suspended", "unpaid")).toBe("noop");
    expect(decide("suspended", "past_due", { graceEndsAt: day(-2) })).toBe(
      "noop",
    );
  });

  it("résilie à l'annulation de l'abonnement, quel que soit l'état du service", () => {
    for (const s of [
      "active",
      "suspended",
      "provisioning",
      "reinstalling",
    ] as const)
      expect(decide(s, "canceled")).toBe("terminate");
  });

  it("ne touche pas un service en provisionnement ou en réinstallation pour un simple retard de paiement", () => {
    expect(decide("provisioning", "unpaid")).toBe("noop");
    expect(decide("reinstalling", "past_due", { graceEndsAt: day(-1) })).toBe(
      "noop",
    );
  });

  it("supprime après la rétention, pas avant", () => {
    expect(decide("canceled", "canceled", { retentionEndsAt: day(3) })).toBe(
      "noop",
    );
    expect(
      decide("canceled", "canceled", { retentionEndsAt: day(-0.01) }),
    ).toBe("delete");
    expect(decide("canceled", "canceled", { retentionEndsAt: NOW })).toBe(
      "delete",
    );
    // Sans date de rétention enregistrée, on ne supprime jamais par erreur.
    expect(decide("canceled", "canceled", { retentionEndsAt: null })).toBe(
      "noop",
    );
  });

  it("une résiliation déjà faite ne se refait pas, un service supprimé ou en échec ne bouge plus", () => {
    expect(decide("canceled", "canceled", { retentionEndsAt: day(5) })).toBe(
      "noop",
    );
    expect(decide("deleted", "canceled")).toBe("noop");
    expect(decide("failed", "canceled")).toBe("noop");
    expect(decide("failed", "unpaid")).toBe("noop");
  });

  it("n'agit pas sans abonnement ou avec un premier paiement non abouti", () => {
    expect(decide("active", null)).toBe("noop");
    expect(decide("active", "incomplete")).toBe("noop");
    expect(decide("provisioning", "incomplete_expired")).toBe("noop");
  });
});

describe("rétention de 7 jours", () => {
  it("calcule la date de suppression à partir de la résiliation", () => {
    expect(retentionEnd(NOW, 7).toISOString()).toBe("2026-11-08T12:00:00.000Z");
    expect(retentionEnd(NOW, 0).toISOString()).toBe(NOW.toISOString());
  });
  it("refuse une durée négative ou non entière", () => {
    expect(() => retentionEnd(NOW, -1)).toThrow();
    expect(() => retentionEnd(NOW, 1.5)).toThrow();
  });
});

describe("paiement d'une commande", () => {
  it("provisionne seulement quand l'abonnement donne un accès complet", () => {
    expect(orderPaymentAction("awaiting_payment", "full")).toBe("provision");
    expect(orderPaymentAction("paid", "full")).toBe("provision");
    expect(orderPaymentAction("awaiting_payment", "grace")).toBe("provision");
    expect(orderPaymentAction("awaiting_payment", "none")).toBe("wait");
    expect(orderPaymentAction("awaiting_payment", "suspended")).toBe("wait");
  });
  it("ne reprovisionne jamais une commande déjà traitée", () => {
    for (const s of [
      "provisioning",
      "fulfilled",
      "failed",
      "canceled",
    ] as const)
      expect(orderPaymentAction(s, "full")).toBe("wait");
  });
  it("un paiement confirmé sur une commande expirée (ou en attente de décision) la REPREND, sous réserve de capacité", () => {
    for (const s of ["expired", "late_payment"] as const) {
      expect(orderPaymentAction(s, "full")).toBe("resume");
      expect(orderPaymentAction(s, "grace")).toBe("resume");
      expect(orderPaymentAction(s, "none")).toBe("wait");
      expect(orderPaymentAction(s, "suspended")).toBe("wait");
    }
  });
});
