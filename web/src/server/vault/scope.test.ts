import { secretScopeProblem } from "@nexora/vault/scope";
import { describe, expect, it } from "vitest";

describe("portée d'un secret du coffre (aucun secret de la plateforme vers une URL saisie)", () => {
  it("un fournisseur de modèles n'utilise que des clés de type llm_provider", () => {
    expect(
      secretScopeProblem("model-provider", "openrouter.cle", "llm_provider"),
    ).toBeNull();
    for (const kind of ["payment", "proxmox", "other"] as const)
      expect(
        secretScopeProblem("model-provider", "openrouter.cle", kind),
        kind,
      ).not.toBeNull();
  });

  it("une instance WorkStudio utilise llm_provider ou other, jamais payment ni proxmox", () => {
    expect(
      secretScopeProblem("workstudio-instance", "workstudio.espace", "other"),
    ).toBeNull();
    expect(
      secretScopeProblem(
        "workstudio-instance",
        "workstudio.espace",
        "llm_provider",
      ),
    ).toBeNull();
    expect(
      secretScopeProblem("workstudio-instance", "workstudio.espace", "payment"),
    ).not.toBeNull();
    expect(
      secretScopeProblem("workstudio-instance", "workstudio.espace", "proxmox"),
    ).not.toBeNull();
  });

  it("Proxmox n'utilise que des jetons de type proxmox", () => {
    expect(secretScopeProblem("proxmox", "proxmox.pve1", "proxmox")).toBeNull();
    expect(
      secretScopeProblem("proxmox", "proxmox.pve1", "llm_provider"),
    ).not.toBeNull();
  });

  it("les références réservées de la plateforme sont refusées quel que soit le type", () => {
    for (const ref of [
      "stripe.secret_key",
      "stripe.webhook_secret",
      "site-agent.redacteur.directus",
      "site-agent.seo.gateway",
      "seo.bing.api_key",
      "directus.jeton",
      "vps.worker_ssh_key",
      "vps.autre",
    ])
      for (const scope of [
        "model-provider",
        "workstudio-instance",
        "proxmox",
      ] as const)
        expect(
          secretScopeProblem(scope, ref, "other"),
          `${scope} ${ref}`,
        ).not.toBeNull();
  });

  it("sans type connu (référence pas encore déposée), seule la référence est contrôlée", () => {
    expect(
      secretScopeProblem("model-provider", "openrouter.cle", null),
    ).toBeNull();
    expect(
      secretScopeProblem("model-provider", "stripe.secret_key", null),
    ).not.toBeNull();
  });

  it("le message ne contient aucune valeur", () => {
    expect(
      secretScopeProblem("model-provider", "stripe.secret_key", "payment"),
    ).toMatch(/réservé|type/);
  });
});
