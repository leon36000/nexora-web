import { secretHostProblem } from "@nexora/vault/scope";
import { describe, expect, it } from "vitest";

const PROD = { NODE_ENV: "production" } as const;

describe("hôtes autorisés pour une clé du coffre (R9 : la clé ne part que vers un hôte fixé par l'opérateur)", () => {
  it("fournisseurs de modèles : les hôtes connus passent par défaut, en HTTPS seulement", () => {
    for (const host of [
      "openrouter.ai",
      "api.openai.com",
      "api.anthropic.com",
      "api.mistral.ai",
    ])
      expect(
        secretHostProblem("model-provider", `https://${host}/v1`, PROD),
        host,
      ).toBeNull();
    expect(
      secretHostProblem("model-provider", "http://api.openai.com/v1", PROD),
    ).toMatch(/HTTPS/);
  });

  it("refuse un hôte HTTPS public que l'administrateur contrôle, avec un motif clair", () => {
    const problem = secretHostProblem(
      "model-provider",
      "https://collecte.pirate.example/v1",
      PROD,
    );
    expect(problem).toMatch(/collecte\.pirate\.example/);
    expect(problem).toMatch(/NEXORA_SECRET_HOSTS_MODEL_PROVIDER/);
  });

  it("ne se laisse pas tromper par la forme de l'adresse", () => {
    for (const url of [
      "https://api.openai.com.pirate.example/v1",
      "https://pirate.example/api.openai.com",
      "https://api.openai.com@pirate.example/v1",
      "https://pirate.example#@api.openai.com/",
      "https://API.OPENAI.COM.pirate.example/",
      "https://xapi.openai.com/",
      "https://sub.api.openai.com/",
      "ftp://api.openai.com/",
      "pas une adresse",
    ])
      expect(
        secretHostProblem("model-provider", url, PROD),
        url,
      ).not.toBeNull();
  });

  it("accepte la casse, le point final et le port sur un hôte autorisé", () => {
    expect(
      secretHostProblem(
        "model-provider",
        "https://API.OpenAI.com.:443/v1",
        PROD,
      ),
    ).toBeNull();
  });

  it("l'opérateur ajoute des hôtes (exacts ou *.domaine) ; l'apex n'est pas couvert par le joker", () => {
    const env = {
      ...PROD,
      NEXORA_SECRET_HOSTS_MODEL_PROVIDER:
        " llm.interne.exemple , *.ia.exemple.ca ,host.docker.internal",
    };
    expect(
      secretHostProblem(
        "model-provider",
        "https://llm.interne.exemple/v1",
        env,
      ),
    ).toBeNull();
    expect(
      secretHostProblem("model-provider", "https://a.ia.exemple.ca/v1", env),
    ).toBeNull();
    expect(
      secretHostProblem("model-provider", "https://ia.exemple.ca/v1", env),
    ).not.toBeNull();
    expect(
      secretHostProblem(
        "model-provider",
        "https://a.ia.exemple.ca.pirate.example/",
        env,
      ),
    ).not.toBeNull();
    // Hôte interne déclaré : HTTP admis (réseau de l'opérateur).
    expect(
      secretHostProblem(
        "model-provider",
        "http://host.docker.internal:8000/v1",
        env,
      ),
    ).toBeNull();
    // Les valeurs par défaut restent en place.
    expect(
      secretHostProblem("model-provider", "https://api.mistral.ai/v1", env),
    ).toBeNull();
  });

  it("l'opérateur retire un hôte par défaut avec « -hôte » ; un joker seul ou une entrée illisible n'ouvre rien", () => {
    const env = {
      ...PROD,
      NEXORA_SECRET_HOSTS_MODEL_PROVIDER: "-api.openai.com,*,*.,://,",
    };
    expect(
      secretHostProblem("model-provider", "https://api.openai.com/v1", env),
    ).not.toBeNull();
    expect(
      secretHostProblem(
        "model-provider",
        "https://n-importe-quoi.example/",
        env,
      ),
    ).not.toBeNull();
    expect(
      secretHostProblem("model-provider", "https://openrouter.ai/api/v1", env),
    ).toBeNull();
  });

  it("instance WorkStudio et serveur Proxmox : aucun hôte par défaut, chaque type a sa propre liste", () => {
    expect(
      secretHostProblem("workstudio-instance", "https://api.openai.com/", PROD),
    ).not.toBeNull();
    expect(
      secretHostProblem("workstudio-instance", "http://ws.interne:3200/", PROD),
    ).toMatch(/NEXORA_SECRET_HOSTS_WORKSTUDIO/);
    const env = {
      ...PROD,
      NEXORA_SECRET_HOSTS_WORKSTUDIO: "ws.interne",
      NEXORA_SECRET_HOSTS_PROXMOX: "192.168.10.5,pve1.lan",
    };
    expect(
      secretHostProblem("workstudio-instance", "http://ws.interne:3200/", env),
    ).toBeNull();
    // La liste WorkStudio ne vaut pas pour Proxmox, ni l'inverse.
    expect(secretHostProblem("proxmox", "ws.interne", env)).toMatch(
      /NEXORA_SECRET_HOSTS_PROXMOX/,
    );
    expect(secretHostProblem("proxmox", "192.168.10.5", env)).toBeNull();
    expect(secretHostProblem("proxmox", "PVE1.lan", env)).toBeNull();
    expect(
      secretHostProblem("workstudio-instance", "http://pve1.lan/", env),
    ).not.toBeNull();
  });

  it("la boucle locale n'est admise qu'en développement", () => {
    expect(
      secretHostProblem("model-provider", "http://127.0.0.1:4400/v1", {
        NODE_ENV: "development",
      }),
    ).toBeNull();
    expect(
      secretHostProblem("workstudio-instance", "http://localhost:3200/", {
        NODE_ENV: "test",
      }),
    ).toBeNull();
    expect(
      secretHostProblem("proxmox", "127.0.0.1", { NODE_ENV: "development" }),
    ).toBeNull();
    for (const target of [
      "http://127.0.0.1:4400/v1",
      "http://localhost:3200/",
      "http://[::1]:3200/",
    ])
      expect(
        secretHostProblem("model-provider", target, PROD),
        target,
      ).not.toBeNull();
    expect(secretHostProblem("proxmox", "127.0.0.1", PROD)).not.toBeNull();
  });

  it("une adresse IP littérale exige une entrée exacte (le joker ne s'y applique pas)", () => {
    const env = { ...PROD, NEXORA_SECRET_HOSTS_PROXMOX: "*.0.5" };
    expect(secretHostProblem("proxmox", "192.168.0.5", env)).not.toBeNull();
  });
});
