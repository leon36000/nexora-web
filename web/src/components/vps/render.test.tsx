import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getVpsDictionary } from "@/i18n/vps";
import { CatalogNotice } from "./catalog-notice";
import { PlanCard } from "./plan-card";
import { PlanTable } from "./plan-table";
import { plan } from "./test-fixtures";
import { VpsConfigurator } from "./vps-configurator";
import { VpsHero } from "./vps-hero";

const fr = getVpsDictionary("fr");
const en = getVpsDictionary("en");
const nbsp = (s: string) => s.replace(/[  ]/g, " ");

describe("plan de développement : étiquette très visible", () => {
  it("carte et tableau portent « Plan de développement — non vendable » (fr) et la version anglaise", () => {
    const dev = plan({ isDevSample: true, name: "[DEV] Essai" });
    expect(
      renderToStaticMarkup(<PlanCard lang="fr" plan={dev} t={fr} />),
    ).toContain("Plan de développement — non vendable");
    expect(
      renderToStaticMarkup(<PlanCard lang="en" plan={dev} t={en} />),
    ).toContain("Development plan — not for sale");
    expect(
      renderToStaticMarkup(<PlanTable lang="fr" plans={[dev]} t={fr} />),
    ).toContain("Plan de développement — non vendable");
  });
  it("un plan réel n'a pas l'étiquette", () => {
    expect(
      renderToStaticMarkup(<PlanCard lang="fr" plan={plan()} t={fr} />),
    ).not.toContain("non vendable");
  });
});

describe("prix affichés", () => {
  it("annuel : total annuel ET équivalent mensuel, avant taxes", () => {
    const html = nbsp(
      renderToStaticMarkup(<PlanCard lang="fr" plan={plan()} t={fr} />),
    );
    expect(html).toContain("15,00 $");
    expect(html).toContain("150,00 $");
    expect(html).toContain("soit 12,50 $ par mois");
    expect(html).toContain("avant taxes");
  });
  it("une durée non offerte n'affiche aucun prix pour cette durée", () => {
    const html = nbsp(
      renderToStaticMarkup(
        <PlanCard lang="fr" plan={plan({ priceYearlyCents: null })} t={fr} />,
      ),
    );
    expect(html).toContain("15,00 $");
    expect(html).not.toContain("par an");
  });
  it("le tableau liste la mémoire, le disque NVMe et le lieu « Québec »", () => {
    const html = renderToStaticMarkup(
      <PlanTable lang="fr" plans={[plan()]} t={fr} />,
    );
    expect(html).toContain("4 Go");
    expect(html).toContain("80 Go");
    expect(html).toContain("Québec");
    expect(html).toContain("Disque NVMe");
  });
});

describe("offres en préparation / indisponible : aucun prix", () => {
  it.each(["empty", "unavailable"] as const)(
    "%s : message honnête, lien de contact, pas de montant",
    (kind) => {
      const html = renderToStaticMarkup(
        <CatalogNotice lang="fr" kind={kind} t={fr} />,
      );
      expect(html).toContain("/contact?sujet=demonstration");
      expect(html).not.toMatch(/\d[\d\s ]*[,.]\d{2}\s*\$|\$\s*\d/);
    },
  );
  it("le message d'absence d'offre est celui demandé", () => {
    expect(
      renderToStaticMarkup(<CatalogNotice lang="fr" kind="empty" t={fr} />),
    ).toContain("Nos offres VPS sont en préparation");
  });
  it("le héros sans plans n'annonce ni prix ni ancres absentes", () => {
    const html = renderToStaticMarkup(
      <VpsHero lang="fr" t={fr} withActions={false} />,
    );
    expect(html).not.toContain("#configurateur");
    expect(html).not.toContain("avant taxes");
  });
  it("le héros sans plans garde son h1 (page réelle) ; le squelette de chargement n'en a pas (sinon le HTML streamé en porte deux)", () => {
    const real = renderToStaticMarkup(
      <VpsHero lang="fr" t={fr} withActions={false} />,
    );
    expect(real.match(/<h1/g)).toHaveLength(1);
    const skeleton = renderToStaticMarkup(
      <VpsHero lang="fr" t={fr} withActions={false} skeleton />,
    );
    expect(skeleton).not.toContain("<h1");
    expect(skeleton).not.toContain('id="vps-title"');
    expect(skeleton).toContain(fr.hero.title); // le visiteur voit le titre pendant le chargement
  });
});

describe("configurateur (rendu serveur initial)", () => {
  const plans = [
    {
      ...plan({ code: "petit", name: "Petit", ramMb: 2048, sort: 10 }),
      regionLabel: "Québec",
    },
    {
      ...plan({
        code: "dev",
        name: "[DEV] Moyen",
        ramMb: 4096,
        sort: 20,
        isDevSample: true,
        priceYearlyCents: null,
      }),
      regionLabel: "Québec",
    },
  ];
  const apps = [
    {
      code: "lourde",
      name: "Lourde",
      tagline: "",
      version: "1.0",
      minRamMb: 4096,
      sort: 10,
      kind: "installable" as const,
    },
  ];
  const render = (initial: {
    plan: string;
    app: string;
    term: "month" | "year";
  }) =>
    nbsp(
      renderToStaticMarkup(
        <VpsConfigurator
          lang="fr"
          plans={plans}
          apps={apps}
          initial={initial}
          t={fr.configurator}
          common={fr.common}
          units={fr.units}
          links={{ login: "/compte/connexion", signup: "/compte/inscription" }}
        />,
      ),
    );

  /** Balise <input> d'un groupe de radios (l'ordre des attributs n'a pas d'importance). */
  const radio = (html: string, name: string, value: string) =>
    (html.match(/<input [^>]*>/g) ?? []).find(
      (tag) =>
        tag.includes(`name="${name}"`) && tag.includes(`value="${value}"`),
    ) ?? "";

  it("désactive un plan trop petit, avec sa raison écrite, et coche la sélection", () => {
    const html = render({ plan: "dev", app: "lourde", term: "month" });
    expect(radio(html, "vps-plan", "petit")).toContain("disabled");
    expect(radio(html, "vps-plan", "dev")).not.toContain("disabled");
    expect(html).toContain(
      "Trop petit : cette application demande au moins 4 Go.",
    );
    expect(radio(html, "vps-plan", "dev")).toContain("checked");
    expect(radio(html, "vps-plan", "petit")).not.toContain("checked");
  });
  it("durée non offerte désactivée ; avertissement et étiquette du plan de développement", () => {
    const html = render({ plan: "dev", app: "lourde", term: "month" });
    expect(radio(html, "vps-term", "year")).toContain("disabled");
    expect(radio(html, "vps-term", "month")).not.toContain("disabled");
    expect(html).toContain("Plan de développement — non vendable");
    expect(html).toContain("Ne le commandez qu’avec des paiements de test.");
  });
  it("affiche le renouvellement, les taxes et le total avant taxes", () => {
    const html = render({ plan: "dev", app: "lourde", term: "month" });
    expect(html).toContain(
      "Renouvelé automatiquement au même tarif à chaque période",
    );
    expect(html).toContain(
      "TPS et TVQ calculées au paiement selon votre adresse (Stripe Tax)",
    );
    expect(html).toContain("Total avant taxes");
  });
  it("champ de clé : libellé lié, jamais de champ mot de passe", () => {
    const html = render({ plan: "dev", app: "lourde", term: "month" });
    expect(html).toContain('for="vps-ssh-key"');
    expect(html).not.toContain('type="password"');
    expect(html).toContain("ssh-keygen -t ed25519");
  });
});
