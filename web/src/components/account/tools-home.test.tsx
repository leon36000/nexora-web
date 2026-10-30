import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAccountDictionary } from "@/i18n/account";
import type {
  CreditsView,
  PlanView,
  ProductHint,
  StorageView,
} from "@/server/products/panel-data";
import {
  PRODUCT_IDS,
  type ProductId,
  resolveProducts,
} from "@/server/products/registry";
import { ToolsLoading } from "./tools-loading";
import { ProductGroup } from "./tools-products";
import { CreditsCard, PlanStrip, StorageCard } from "./tools-summary";

const GO = 1_000_000_000;
/** Intl sépare les milliers par des espaces fines insécables : on les ramène à des espaces ordinaires. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

const credits = (over: Partial<CreditsView> = {}): CreditsView => ({
  level: "ok",
  subscription: 700,
  refill: 300,
  total: 1000,
  subscriptionExpiresAt: new Date("2026-11-30T17:00:00Z"),
  canUseModels: true,
  ...over,
});
const storage = (over: Partial<StorageView> = {}): StorageView => ({
  level: "ok",
  totalBytes: GO,
  usedBytes: 250_000_000,
  percent: 25,
  remainingBytes: 750_000_000,
  products: [
    { product: "rag", bytes: 200_000_000, percentOfTotal: 20 },
    { product: "workstudio", bytes: 50_000_000, percentOfTotal: 5 },
  ],
  ...over,
});

const renderCredits = (
  v: CreditsView,
  role: "owner" | "member" = "owner",
  lang: "fr" | "en" = "fr",
) =>
  renderToStaticMarkup(
    <CreditsCard lang={lang} t={getAccountDictionary(lang)} role={role} view={v} />,
  );
const renderStorage = (v: StorageView, lang: "fr" | "en" = "fr") =>
  renderToStaticMarkup(
    <StorageCard lang={lang} t={getAccountDictionary(lang)} view={v} />,
  );
const renderPlan = (
  v: PlanView,
  role: "owner" | "member" = "owner",
  lang: "fr" | "en" = "fr",
) =>
  renderToStaticMarkup(
    <PlanStrip lang={lang} t={getAccountDictionary(lang)} role={role} view={v} />,
  );

describe("carte Crédits", () => {
  it("abonnement et recharge séparés, avec l'échéance de l'abonnement et la mention « n'expirent pas »", () => {
    const html = plain(renderCredits(credits()));
    expect(html).toContain('data-testid="credits-total">1 000 crédits');
    expect(html).toContain('data-testid="credits-subscription">700<');
    expect(html).toContain('data-testid="credits-refill">300<');
    expect(html).toContain("Crédits d’abonnement");
    expect(html).toContain("Crédits de recharge");
    expect(html).toContain("Expirent le 30 novembre 2026");
    expect(html).toContain("N’expirent pas");
  });

  it("un seul crédit s'écrit au singulier", () => {
    expect(
      plain(renderCredits(credits({ total: 1, subscription: 0, refill: 1, subscriptionExpiresAt: null }))),
    ).toContain(">1 crédit<");
  });

  it("sans crédit d'abonnement, aucune échéance n'est inventée", () => {
    const html = renderCredits(
      credits({ subscription: 0, total: 300, subscriptionExpiresAt: null }),
    );
    expect(html).not.toContain("Expirent le");
  });

  it("zéro crédit : le dit en clair et propose de recharger", () => {
    const html = renderCredits(credits({ level: "empty", total: 0, subscription: 0, refill: 0, subscriptionExpiresAt: null }));
    expect(html).toContain("Il ne vous reste plus de crédits");
    expect(html).toContain('href="/compte/facturation#ajouter-des-fonds"');
  });

  it("compte bloqué : l'alerte, pas de message de solde vide", () => {
    const html = renderCredits(credits({ level: "blocked", total: 0 }));
    expect(html).toContain("Compte bloqué");
    expect(html).not.toContain("Il ne vous reste plus de crédits");
  });

  it("maison : accès gratuit, aucun bouton de recharge ni chiffre de solde", () => {
    const html = renderCredits(credits({ level: "free" }));
    expect(html).toContain("Accès administrateur gratuit");
    expect(html).not.toContain("credits-total");
    expect(html).not.toContain("Ajouter des fonds");
  });

  it("membre simple : pas de bouton, le propriétaire seul recharge", () => {
    const html = renderCredits(credits(), "member");
    expect(html).not.toContain("compte/facturation");
    expect(html).toContain("Seul le propriétaire");
  });

  it("la règle du modèle à crédits est écrite : outils gratuits ou inclus, modèles consomment des crédits", () => {
    expect(renderCredits(credits())).toContain(
      "Les outils sont gratuits ou inclus. Tout ce qui appelle un modèle consomme des crédits",
    );
  });

  it("anglais : libellés et adresse préfixée", () => {
    const html = plain(renderCredits(credits(), "owner", "en"));
    expect(html).toContain("1,000 credits");
    expect(html).toContain("Subscription credits");
    expect(html).toContain("Top-up credits");
    expect(html).toContain('href="/en/compte/facturation#ajouter-des-fonds"');
  });
});

describe("carte Espace disque", () => {
  it("barre globale annoncée comme barre de progression, texte « utilisés sur »", () => {
    const html = plain(renderStorage(storage()));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('aria-valuetext="25 % de l’espace utilisé"');
    expect(html).toContain('data-testid="storage-usage">250 Mo utilisés sur 1 Go');
  });

  it("ventilation par produit, dans l'ordre donné, avec la taille de chacun", () => {
    const html = plain(renderStorage(storage()));
    expect(html).toContain("Répartition par outil");
    expect(html.indexOf("Nexora RAG")).toBeGreaterThan(-1);
    expect(html.indexOf("Nexora RAG")).toBeLessThan(html.indexOf("WorkStudio"));
    expect(html).toContain("200 Mo");
    expect(html).toContain("50 Mo");
  });

  it("sous 80 % : aucun avertissement", () => {
    const html = renderStorage(storage({ level: "ok", percent: 79 }));
    expect(html).not.toContain("presque plein");
    expect(html).not.toContain("est plein");
  });

  it("à 80 % : avertissement avec le pourcentage et lien vers les offres", () => {
    const html = renderStorage(
      storage({ level: "warning", percent: 80, usedBytes: 800_000_000 }),
    );
    expect(html).toContain("presque plein : 80 % utilisés");
    expect(html).toContain('href="/tarifs"');
  });

  it("à 100 % : message clair (écritures refusées, lecture et suppression permises), en alerte", () => {
    const html = renderStorage(
      storage({ level: "full", percent: 100, usedBytes: GO, remainingBytes: 0 }),
    );
    expect(html).toContain("Votre espace est plein");
    expect(html).toContain("écritures sont refusées");
    expect(html).toContain("lire et supprimer vos données");
    expect(html).toContain('role="alert"');
  });

  it("sans espace : le dit et renvoie aux offres, sans barre", () => {
    const html = renderStorage(
      storage({ level: "none", totalBytes: 0, usedBytes: 0, percent: 0, products: [] }),
    );
    expect(html).toContain("Aucun espace pour l’instant");
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('href="/tarifs"');
  });

  it("rien d'écrit : « Rien n'est encore enregistré chez Nexora »", () => {
    const html = renderStorage(storage({ usedBytes: 0, percent: 0, products: [] }));
    expect(html).toContain("Rien n’est encore enregistré chez Nexora.");
  });

  it("maison : espace sans limite, aucune barre ni pourcentage", () => {
    const html = renderStorage(storage({ level: "house", percent: 0 }));
    expect(html).toContain("l’espace n’est pas limité");
    expect(html).not.toContain('role="progressbar"');
  });

  it("anglais : unités et libellés anglais", () => {
    const html = plain(renderStorage(storage(), "en"));
    expect(html).toContain("250 MB used of 1 GB");
    expect(html).toContain("Breakdown by tool");
  });
});

describe("bande Mon offre", () => {
  const active: PlanView = {
    kind: "active",
    code: "nexora-base",
    interval: "month",
    renewsAt: new Date("2026-11-30T17:00:00Z"),
    ending: false,
    pastDue: false,
    graceEndsAt: null,
  };

  it("sans abonnement : « Aucun abonnement : rechargez ou choisissez une offre » et lien vers les offres", () => {
    const html = renderPlan({ kind: "none" });
    expect(html).toContain("Aucun abonnement : rechargez ou choisissez une offre.");
    expect(html).toContain('href="/tarifs"');
  });

  it("offre en cours : nom, rythme, renouvellement, et gestion pour le propriétaire seulement", () => {
    const html = renderPlan(active);
    expect(html).toContain("Nexora Base");
    expect(html).toContain("Facturation mensuelle");
    expect(html).toContain("Renouvellement le 30 novembre 2026");
    expect(html).toContain("Gérer mon abonnement");
    expect(renderPlan(active, "member")).not.toContain("Gérer mon abonnement");
  });

  it("un code inconnu s'affiche tel quel (aucun nom inventé)", () => {
    expect(renderPlan({ ...active, code: "offre-x" })).toContain("offre-x");
  });

  it("résiliation demandée : la fin remplace le renouvellement", () => {
    const html = renderPlan({ ...active, ending: true });
    expect(html).toContain("Se termine le 30 novembre 2026 (résiliation demandée)");
    expect(html).not.toContain("Renouvellement le");
  });

  it("paiement en retard : annoncé avec la date limite", () => {
    const html = renderPlan({
      ...active,
      pastDue: true,
      graceEndsAt: new Date("2026-11-05T17:00:00Z"),
    });
    expect(html).toContain("Paiement en retard : votre accès est conservé jusqu’au 5 novembre 2026");
  });

  it("offre annuelle en anglais", () => {
    const html = renderPlan({ ...active, interval: "year" }, "owner", "en");
    expect(html).toContain("Billed yearly");
    expect(html).toContain("Renews on November 30, 2026");
  });
});

describe("cartes des produits", () => {
  const render = (
    env: Record<string, string | undefined> = {},
    workstudioUrl: string | null = null,
    hints: Partial<Record<ProductId, ProductHint>> = {},
    lang: "fr" | "en" = "fr",
  ) => {
    const products = resolveProducts({ env, workstudioUrl });
    const t = getAccountDictionary(lang);
    return (["work", "around"] as const)
      .map((group) =>
        renderToStaticMarkup(
          <ProductGroup
            lang={lang}
            t={t}
            group={group}
            products={products}
            hints={hints}
            workstudioUrl={workstudioUrl}
          />,
        ),
      )
      .join("");
  };
  const card = (html: string, id: string) => {
    const start = html.indexOf(`data-product="${id}"`);
    expect(start, id).toBeGreaterThan(-1);
    const end = html.indexOf("</article>", start);
    return html.slice(start, end);
  };

  it("une carte par produit du registre, chacune avec son état", () => {
    const html = render();
    for (const id of PRODUCT_IDS) expect(html).toContain(`data-product="${id}"`);
    expect((html.match(/<article /g) ?? []).length).toBe(PRODUCT_IDS.length);
    expect(html).toContain('id="tools-work-title"');
    expect(html).toContain('id="tools-around-title"');
  });

  it("par défaut Nexora Code et RAG sont « Bientôt » : aucun bouton d'ouverture, « Me prévenir » vers la liste d'attente", () => {
    const html = render();
    for (const id of ["code", "rag"]) {
      const c = card(html, id);
      expect(c).toContain('data-state="bientot"');
      expect(c).toContain("Bientôt");
      expect(c).toContain("Me prévenir");
      expect(c).toContain(`href="/contact?sujet=apps-${id}"`);
      expect(c).not.toContain("Ouvrir Nexora Code");
      expect(c).not.toContain("Créer mon RAG");
      expect(c).toContain("pas encore livré");
    }
  });

  it("interrupteurs allumés : « Ouvrir Nexora Code » et « Créer mon RAG » mènent aux pages du panneau", () => {
    const html = render({ NEXORA_PRODUCT_CODE: "1", NEXORA_PRODUCT_RAG: "1" });
    expect(card(html, "code")).toContain('href="/compte/code"');
    expect(card(html, "code")).toContain("Ouvrir Nexora Code");
    expect(card(html, "code")).toContain('data-state="disponible"');
    expect(card(html, "rag")).toContain('href="/compte/rag"');
    expect(card(html, "rag")).toContain("Créer mon RAG");
    expect(card(html, "code")).not.toContain("Me prévenir");
  });

  it("WorkStudio en préparation : pas de bouton, le dit ; prêt : bouton vers l'instance", () => {
    const pending = card(render(), "workstudio");
    expect(pending).toContain("en préparation");
    expect(pending).not.toContain("Ouvrir WorkStudio");
    const ready = card(render({}, "https://ws.example"), "workstudio");
    expect(ready).toContain('href="https://ws.example"');
    expect(ready).toContain("Ouvrir WorkStudio");
  });

  it("WorkStudio sans crédit : plus de bouton qui mène à un refus, le rappel dit quoi faire (plus d'« Abonnement requis »)", () => {
    const html = render({}, "https://ws.example", {
      workstudio: { needsCredits: true, needsStorage: false },
    });
    const c = card(html, "workstudio");
    expect(c).not.toContain("Ouvrir WorkStudio");
    expect(c).toContain("Il vous faut des crédits pour utiliser les modèles");
    expect(html).not.toContain("Abonnement requis");
  });

  it("le rappel d'espace n'apparaît que sur un produit livré", () => {
    const hints = { code: { needsCredits: false, needsStorage: true } };
    expect(card(render({}, null, hints), "code")).not.toContain("Il vous faut de l’espace");
    expect(card(render({ NEXORA_PRODUCT_CODE: "1" }, null, hints), "code")).toContain(
      "Il vous faut de l’espace",
    );
  });

  it("Nexora Creative est « Plus tard », Nexora Bot « Bientôt » : fiche et liste d'attente, rien de livré", () => {
    const html = render();
    expect(card(html, "creative")).toContain("Plus tard");
    expect(card(html, "creative")).toContain("Me prévenir");
    expect(card(html, "bot")).toContain("Bientôt");
    expect(card(html, "bot")).toContain("pas encore livré");
  });

  it("chaque carte dit ce qu'elle consomme : crédits et espace", () => {
    const html = render();
    for (const id of PRODUCT_IDS) {
      const c = card(html, id);
      expect(c, id).toContain("Crédits");
      expect(c, id).toContain("Espace");
    }
    expect(card(html, "rag")).toContain("jetons d’embedding et de rerank");
    expect(card(html, "privacy-router")).toContain("jamais payante");
  });

  it("Privacy Router et VPS mènent à leur page du panneau", () => {
    const html = render();
    expect(card(html, "privacy-router")).toContain('href="/compte/confidentialite"');
    expect(card(html, "vps")).toContain('href="/compte/vps"');
    expect(card(html, "vps")).toContain('data-state="disponible"');
  });

  it("l'état se lit en texte pour les lecteurs d'écran (« État : Bientôt »)", () => {
    expect(card(render(), "code")).toContain("État : </span>Bientôt");
  });

  it("anglais : adresses préfixées par la langue, libellés anglais", () => {
    const html = render({ NEXORA_PRODUCT_CODE: "1" }, null, {}, "en");
    expect(card(html, "code")).toContain('href="/en/compte/code"');
    expect(card(html, "code")).toContain("Open Nexora Code");
    expect(card(html, "rag")).toContain('href="/en/contact?sujet=apps-rag"');
    expect(card(html, "rag")).toContain("Notify me");
    expect(card(html, "rag")).toContain("Coming soon");
  });
});

describe("état de chargement", () => {
  it("annonce l'attente et ne dit rien de faux : blocs décoratifs, pulse coupé si le mouvement est réduit", () => {
    const html = renderToStaticMarkup(
      <ToolsLoading title="Mes outils." working="Chargement de vos outils…" />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Chargement de vos outils…");
    expect(html).toContain("motion-safe:animate-pulse");
    expect(html).toContain('aria-hidden="true"');
  });
});
