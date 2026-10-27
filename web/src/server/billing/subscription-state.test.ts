import { describe, expect, it } from "vitest";
import {
  accessLevel,
  applySubscriptionEvent,
  type SubState,
} from "./subscription-state";

const T = (iso: string) => new Date(iso);
const base: SubState = {
  status: "incomplete",
  graceEndsAt: null,
  canceledAt: null,
  lastEventCreated: 0,
};
const GRACE = 7;

describe("machine à états des abonnements", () => {
  it("incomplete -> active au paiement de la facture", () => {
    const next = applySubscriptionEvent(
      base,
      { type: "invoice_paid", created: 100 },
      { graceDays: GRACE, now: T("2026-01-01") },
    );
    expect(next.status).toBe("active");
    expect(next.graceEndsAt).toBeNull();
  });

  it("active -> past_due à l'échec de paiement, avec une fin de grâce à J+7", () => {
    const next = applySubscriptionEvent(
      { ...base, status: "active", lastEventCreated: 100 },
      { type: "invoice_payment_failed", created: 200 },
      { graceDays: GRACE, now: T("2026-01-01T00:00:00Z") },
    );
    expect(next.status).toBe("past_due");
    expect(next.graceEndsAt?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("une nouvelle tentative échouée ne prolonge pas la grâce", () => {
    const first = applySubscriptionEvent(
      { ...base, status: "active" },
      { type: "invoice_payment_failed", created: 200 },
      { graceDays: GRACE, now: T("2026-01-01T00:00:00Z") },
    );
    const second = applySubscriptionEvent(
      first,
      { type: "invoice_payment_failed", created: 300 },
      { graceDays: GRACE, now: T("2026-01-04T00:00:00Z") },
    );
    expect(second.graceEndsAt?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("past_due -> active quand une facture est enfin payée, la grâce est effacée", () => {
    const next = applySubscriptionEvent(
      {
        ...base,
        status: "past_due",
        graceEndsAt: T("2026-01-08"),
        lastEventCreated: 300,
      },
      { type: "invoice_paid", created: 400 },
      { graceDays: GRACE, now: T("2026-01-05") },
    );
    expect(next.status).toBe("active");
    expect(next.graceEndsAt).toBeNull();
  });

  it("canceled est terminal : une facture payée en retard ne le réactive pas", () => {
    const canceled: SubState = {
      status: "canceled",
      graceEndsAt: null,
      canceledAt: T("2026-01-02"),
      lastEventCreated: 500,
    };
    for (const type of ["invoice_paid", "invoice_payment_failed"] as const) {
      const next = applySubscriptionEvent(
        canceled,
        { type, created: 600 },
        { graceDays: GRACE, now: T("2026-01-03") },
      );
      expect(next.status).toBe("canceled");
    }
  });

  it("subscription_updated reprend le statut de Stripe", () => {
    const next = applySubscriptionEvent(
      { ...base, status: "active", lastEventCreated: 10 },
      { type: "subscription_updated", created: 20, stripeStatus: "unpaid" },
      { graceDays: GRACE, now: T("2026-01-01") },
    );
    expect(next.status).toBe("unpaid");
  });

  it("subscription_updated vers past_due ouvre la grâce si elle n'existe pas", () => {
    const next = applySubscriptionEvent(
      { ...base, status: "active" },
      { type: "subscription_updated", created: 20, stripeStatus: "past_due" },
      { graceDays: GRACE, now: T("2026-01-01T00:00:00Z") },
    );
    expect(next.graceEndsAt?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("subscription_deleted -> canceled et date d'annulation", () => {
    const next = applySubscriptionEvent(
      { ...base, status: "active" },
      { type: "subscription_deleted", created: 30 },
      { graceDays: GRACE, now: T("2026-02-01") },
    );
    expect(next.status).toBe("canceled");
    expect(next.canceledAt?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(next.graceEndsAt).toBeNull();
  });

  it("ignore un événement plus ancien que le dernier appliqué (livraison dans le désordre)", () => {
    const current: SubState = {
      status: "canceled",
      graceEndsAt: null,
      canceledAt: T("2026-02-01"),
      lastEventCreated: 1000,
    };
    const next = applySubscriptionEvent(
      current,
      { type: "subscription_updated", created: 900, stripeStatus: "active" },
      { graceDays: GRACE, now: T("2026-02-02") },
    );
    expect(next).toEqual(current);
  });

  it("un statut Stripe inconnu est refusé", () => {
    expect(() =>
      applySubscriptionEvent(
        base,
        { type: "subscription_updated", created: 1, stripeStatus: "weird" },
        { graceDays: GRACE, now: T("2026-01-01") },
      ),
    ).toThrow();
  });
});

describe("niveau d'accès dérivé (suspension après la grâce)", () => {
  const at = T("2026-01-10T00:00:00Z");
  const mk = (s: Partial<SubState>): SubState => ({ ...base, ...s });

  it("active et trialing -> full", () => {
    expect(accessLevel(mk({ status: "active" }), at)).toBe("full");
    expect(accessLevel(mk({ status: "trialing" }), at)).toBe("full");
  });
  it("past_due pendant la grâce -> grace, après -> suspended", () => {
    expect(
      accessLevel(mk({ status: "past_due", graceEndsAt: T("2026-01-12") }), at),
    ).toBe("grace");
    expect(
      accessLevel(mk({ status: "past_due", graceEndsAt: T("2026-01-09") }), at),
    ).toBe("suspended");
  });
  it("past_due sans date de fin de grâce -> suspended (échoue fermé)", () => {
    expect(accessLevel(mk({ status: "past_due" }), at)).toBe("suspended");
  });
  it("unpaid et paused -> suspended", () => {
    expect(accessLevel(mk({ status: "unpaid" }), at)).toBe("suspended");
    expect(accessLevel(mk({ status: "paused" }), at)).toBe("suspended");
  });
  it("canceled, incomplete et incomplete_expired -> none", () => {
    for (const status of [
      "canceled",
      "incomplete",
      "incomplete_expired",
    ] as const)
      expect(accessLevel(mk({ status }), at)).toBe("none");
  });
});
