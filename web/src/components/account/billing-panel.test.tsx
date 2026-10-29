import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import type { DashboardData } from "@/server/billing/dashboard";
import type { Wallet } from "@/server/billing/wallet";
import { BillingPanel, type BillingPanelProps } from "./billing-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

const data: DashboardData = {
  organization: { id: "org_1", name: "Acme" },
  account: {
    organizationId: "org_1",
    balanceMicro: 12_345_678n,
    heldMicro: 0n,
    availableMicro: 12_345_678n,
    blocked: false,
  },
  entries: [],
  subscriptions: [],
  hasStripeCustomer: true,
};

const wallet: Wallet = {
  lots: [
    {
      id: "l1",
      source: "subscription",
      amountMicro: 4_400_000n,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      expiresAt: new Date("2026-10-31T12:00:00Z"),
      usedMicro: 2_200_000n,
      expiredMicro: 0n,
      remainingMicro: 2_200_000n,
      included: true,
    },
    {
      id: "l2",
      source: "purchase",
      amountMicro: 10_000_000n,
      createdAt: new Date("2026-09-01T12:00:00Z"),
      expiresAt: new Date("2027-09-01T12:00:00Z"),
      usedMicro: 0n,
      expiredMicro: 0n,
      remainingMicro: 10_000_000n,
      included: false,
    },
  ],
  included: {
    amountMicro: 4_400_000n,
    usedMicro: 2_200_000n,
    remainingMicro: 2_200_000n,
    expiresAt: new Date("2026-10-31T12:00:00Z"),
  },
};

const config = {
  creditExpiryMonths: 12,
  minPurchaseCents: 2000,
  maxPurchaseCents: 500000,
  graceDays: 7,
} as BillingPanelProps["config"];

const render = (
  lang: "fr" | "en",
  over: Partial<BillingPanelProps> = {},
  role: "owner" | "member" = "owner",
) =>
  renderToStaticMarkup(
    <BillingPanel
      lang={lang}
      t={getAccountDictionary(lang)}
      data={data}
      role={role}
      config={config}
      plans={[]}
      payment={{ liveMode: false, fee: null }}
      wallet={wallet}
      free={false}
      alert={null}
      historyAll={false}
      {...over}
    />,
  );

describe("portefeuille : client ordinaire", () => {
  it("fr : solde, 2,5 M de 5 M de jetons inclus utilisés, échéance, lots, montants proposés", () => {
    const html = render("fr");
    expect(html).toContain("12,3457");
    expect(html).toMatch(/2,5(\s| )M de 5(\s| )M de jetons inclus utilisés/);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("Ajouter des fonds");
    // Montants proposés : 20, 50, 100, 250, 500 $.
    expect(html).toContain('aria-label="20,00');
    expect(html).toContain('name="amount"');
    // Équivalence en valeur expliquée honnêtement.
    expect(html).toContain("équivalence en valeur");
    expect(html).toContain("Crédits inclus (abonnement)");
    expect(html).toContain("Achat de crédits");
  });

  it("en : mêmes éléments en anglais", () => {
    const html = render("en");
    expect(html).toMatch(/2\.5(\s| )M of 5(\s| )M included tokens used/);
    expect(html).toContain("value equivalent");
    expect(html).toContain("Add funds");
  });

  it("recharge automatique : désactivée et expliquée, pas de formulaire", () => {
    const html = render("fr");
    expect(html).toContain("Recharge automatique");
    expect(html).toContain("Bientôt");
    expect(html).not.toMatch(/name="autoTopUp/);
  });

  it("sans forfait : le dit, sans compteur inventé", () => {
    const html = render("fr", {
      wallet: { lots: [], included: null },
    });
    expect(html).toContain("Aucun crédit inclus pour l’instant");
    expect(html).not.toContain('role="progressbar"');
  });

  it("alerte de solde : état actuel et formulaire du propriétaire ; message pour un membre", () => {
    const alert = {
      enabled: true,
      thresholdCad: "10",
      thresholdMicro: 10_000_000n,
    };
    const owner = render("fr", { alert });
    expect(owner).toContain("Alerte active : seuil de");
    expect(owner).toContain('name="thresholdCad"');
    const member = render("fr", { alert }, "member");
    expect(member).not.toContain('name="thresholdCad"');
    expect(member).toContain("Seul le propriétaire");
    expect(render("fr")).toContain("Aucune alerte active.");
  });

  it("un membre ne voit pas le formulaire d'ajout de fonds", () => {
    const html = render("fr", {}, "member");
    expect(html).not.toContain('name="amount"');
  });
});

describe("portefeuille : organisation maison", () => {
  it("accès gratuit à la place du solde, sans formulaire ni compteur", () => {
    const html = render("fr", { free: true });
    expect(html).toContain("Accès administrateur gratuit");
    expect(html).not.toContain('data-testid="balance"');
    expect(html).not.toContain('name="amount"');
    expect(html).not.toContain('role="progressbar"');
  });
  it("un client ordinaire ne voit jamais le texte d'accès gratuit", () => {
    expect(render("fr")).not.toContain("Accès administrateur gratuit");
    expect(render("en")).not.toContain("Free administrator access");
  });
});
