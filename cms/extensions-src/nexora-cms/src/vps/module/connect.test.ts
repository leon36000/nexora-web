import { describe, expect, test } from "bun:test";
import {
  apiFailureText,
  buildConnectBody,
  buildProbeBody,
  buildSetupBody,
  checkProxmoxToken,
  connectFailureText,
  describeProblem,
  describeSetupStep,
  fingerprintAdvice,
  setupFormFrom,
  summarizeSetup,
} from "./format";

const TOKEN = "nexora@pve!provision=11111111-2222-3333-4444-555555555555";
const connectForm = {
  address: "pve.exemple.ca:8006",
  code: "pve-exemple-ca",
  name: "Québec 1",
  region: "quebec",
  tlsMode: "pinned",
  tlsFingerprint: "AB:".repeat(31) + "AB",
  confirmed: true,
};

describe("jeton Proxmox saisi", () => {
  test("accepte utilisateur@realm!nom=secret", () => {
    expect(checkProxmoxToken(TOKEN)).toBeNull();
    expect(checkProxmoxToken(`  ${TOKEN}  `)).toBeNull();
  });
  test.each([
    "",
    "nexora@pve",
    "nexora@pve!provision",
    "nexora@pve!provision=pas-un-secret",
    "nexora!provision=11111111-2222-3333-4444-555555555555",
    "PVEAPIToken=" + TOKEN,
  ])("refuse %j avec un message qui montre le format attendu", (t) => {
    const msg = checkProxmoxToken(t);
    expect(msg).toContain("utilisateur@realm!nom=secret");
  });
  test("le message ne recopie jamais la valeur saisie", () => {
    expect(checkProxmoxToken("secret-tres-confidentiel")).not.toContain(
      "secret-tres-confidentiel",
    );
  });
});

describe("étape 1 : vérifier le serveur", () => {
  test("adresse obligatoire et bien formée", () => {
    expect(buildProbeBody("pve.exemple.ca")).toEqual({
      ok: true,
      body: { address: "pve.exemple.ca" },
    });
    expect(buildProbeBody("").ok).toBe(false);
    expect(buildProbeBody("pve exemple").ok).toBe(false);
    expect(buildProbeBody("https://pve.exemple.ca:8006/").ok).toBe(true);
    expect(buildProbeBody("http://pve.exemple.ca").ok).toBe(false);
  });
  test("conseil sur l'empreinte : certificat reconnu ou à épingler", () => {
    expect(
      fingerprintAdvice({
        trusted: true,
        hostnameMatches: true,
        expired: false,
        selfSigned: false,
      }),
    ).toMatch(/reconnu/);
    expect(
      fingerprintAdvice({
        trusted: false,
        hostnameMatches: true,
        expired: false,
        selfSigned: true,
      }),
    ).toMatch(/auto-signé|épingl/);
    expect(
      fingerprintAdvice({
        trusted: false,
        hostnameMatches: false,
        expired: false,
        selfSigned: true,
      }),
    ).toMatch(/nom/);
    expect(
      fingerprintAdvice({
        trusted: false,
        hostnameMatches: true,
        expired: true,
        selfSigned: true,
      }),
    ).toMatch(/expiré/);
  });
});

describe("étape 2 : connecter", () => {
  test("le corps envoyé ne contient jamais le jeton, seulement sa référence du Coffre", () => {
    const r = buildConnectBody(connectForm);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toMatchObject({
      address: "pve.exemple.ca:8006",
      code: "pve-exemple-ca",
      tokenRef: "proxmox.pve-exemple-ca",
      tlsMode: "pinned",
    });
    expect(JSON.stringify(r.body)).not.toContain("11111111");
  });
  test("un libellé vide n'est pas envoyé du tout (l'API refuse un champ nul)", () => {
    const r = buildConnectBody({ ...connectForm, name: "  ", region: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("name" in r.body).toBe(false);
    expect("region" in r.body).toBe(false);
    for (const v of Object.values(r.body)) expect(v).not.toBeUndefined();
  });
  test("exige la confirmation de l'empreinte avant d'épingler", () => {
    const r = buildConnectBody({ ...connectForm, confirmed: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/confirm/i);
  });
  test("mode vérifié : pas d'empreinte envoyée", () => {
    const r = buildConnectBody({
      ...connectForm,
      tlsMode: "verify",
      confirmed: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.tlsFingerprint).toBeNull();
  });
  test("refuse un code invalide ou une empreinte mal formée", () => {
    expect(buildConnectBody({ ...connectForm, code: "A" }).ok).toBe(false);
    expect(buildConnectBody({ ...connectForm, tlsFingerprint: "zz" }).ok).toBe(
      false,
    );
  });
  test("explique un échec de connexion avec la cause et l'action", () => {
    expect(
      connectFailureText({
        error: "connect_failed",
        cause: "Proxmox a refusé le jeton.",
        action: "Recréer le jeton.",
      }),
    ).toBe("Proxmox a refusé le jeton. À faire : Recréer le jeton.");
    expect(
      connectFailureText({
        error: "probe_failed",
        cause: "serveur injoignable",
        action: "Vérifier le pare-feu.",
      }),
    ).toContain("Vérifier le pare-feu.");
    expect(connectFailureText(undefined)).toBeNull();
  });
});

const discovery = {
  node: "pve1",
  nodes: ["pve1"],
  vmStorage: "local-lvm",
  importStorage: "local",
  bridge: "vmbr0",
  pool: null,
  capacity: { vcpu: 32, ramMb: 111411, diskGb: 1592 },
  network: {
    prefix: 24,
    gateway: "192.168.1.1",
    dns: ["192.168.1.1", "1.1.1.1"],
  },
  problems: [],
};

describe("étape 3 : valeurs découvertes, validées par l'opérateur", () => {
  test("préremplit tout ce que Proxmox sait et laisse vides les plages (à saisir)", () => {
    const f = setupFormFrom(discovery, { name: "Québec 1", region: "quebec" });
    expect(f).toMatchObject({
      name: "Québec 1",
      node: "pve1",
      vmStorage: "local-lvm",
      importStorage: "local",
      bridge: "vmbr0",
      vcpu: 32,
      ramMb: 111411,
      diskGb: 1592,
      prefix: 24,
      gateway: "192.168.1.1",
      dns: "192.168.1.1, 1.1.1.1",
      ranges: "",
      templates: ["debian-12-ci"],
    });
  });

  const form = () => ({
    ...setupFormFrom(discovery, { name: "Québec 1", region: "quebec" }),
    ranges: "192.168.1.100 - 192.168.1.150",
  });

  test("corps valide : types entiers, plages et DNS en listes", () => {
    const r = buildSetupBody(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({
      name: "Québec 1",
      node: "pve1",
      region: "quebec",
      vmStorage: "local-lvm",
      importStorage: "local",
      pool: null,
      capacity: { vcpu: 32, ramMb: 111411, diskGb: 1592 },
      network: {
        ranges: [{ from: "192.168.1.100", to: "192.168.1.150" }],
        prefix: 24,
        gateway: "192.168.1.1",
        dns: ["192.168.1.1", "1.1.1.1"],
        bridge: "vmbr0",
      },
      templates: ["debian-12-ci"],
    });
  });

  test.each([
    ["sans plage", { ranges: "" }],
    ["plage mal formée", { ranges: "192.168.1.100" }],
    ["passerelle invalide", { gateway: "192.168.1" }],
    ["DNS invalide", { dns: "pas-une-ip" }],
    ["préfixe hors bornes", { prefix: 31 }],
    ["capacité nulle", { vcpu: 0 }],
    ["aucun système", { templates: [] }],
    ["système inconnu", { templates: ["windows-95"] }],
    ["nœud vide", { node: "" }],
    ["pont vide", { bridge: "" }],
  ])("refuse : %s", (_name, over) => {
    expect(buildSetupBody({ ...form(), ...over } as never).ok).toBe(false);
  });

  test("DHCP n'existe pas : le message le dit au lieu de se taire", () => {
    const r = buildSetupBody({ ...form(), ranges: "dhcp" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/DHCP/);
  });

  test("problèmes bloquants : texte du problème et de l'action", () => {
    expect(
      describeProblem({
        message: "Aucun stockage Import.",
        action: "Activer Import sur local.",
      }),
    ).toBe("Aucun stockage Import. À faire : Activer Import sur local.");
  });
});

describe("suivi des étapes (état honnête)", () => {
  const step = (over: object) => ({
    id: "connexion",
    label: "Connexion",
    status: "pending",
    updatedAt: "2026-10-27T12:00:00.000Z",
    ...over,
  });
  test("une étiquette lisible par état, avec la cause et l'action en cas d'échec", () => {
    expect(
      describeSetupStep(step({ status: "pending" }) as never).text,
    ).toMatch(/en attente/);
    expect(
      describeSetupStep(step({ status: "running" }) as never).text,
    ).toMatch(/en cours/);
    expect(
      describeSetupStep(
        step({ status: "ok", detail: "Proxmox VE 9.0.3" }) as never,
      ).text,
    ).toContain("Proxmox VE 9.0.3");
    expect(
      describeSetupStep(
        step({ status: "skipped", detail: "déjà présent" }) as never,
      ).text,
    ).toMatch(/déjà présent/);
    const failed = describeSetupStep(
      step({
        status: "failed",
        cause: "Le jeton est refusé.",
        action: "Recréer le jeton.",
      }) as never,
    );
    expect(failed.tone).toBe("warn");
    expect(failed.text).toContain("Le jeton est refusé.");
    expect(failed.text).toContain("À faire : Recréer le jeton.");
  });
  test("résumé global : en cours, réussi (prêt), échec", () => {
    expect(summarizeSetup(null).tone).toBe("wait");
    expect(summarizeSetup({ status: "running", steps: [] } as never).tone).toBe(
      "run",
    );
    const ok = summarizeSetup({ status: "succeeded", steps: [] } as never);
    expect(ok.tone).toBe("ok");
    expect(ok.text).toMatch(/prêt/);
    const ko = summarizeSetup({
      status: "failed",
      steps: [step({ status: "failed", label: "Image Debian" })],
    } as never);
    expect(ko.tone).toBe("warn");
    expect(ko.text).toContain("Image Debian");
  });
});

describe("erreurs de l'API de branchement affichées telles quelles à l'opérateur", () => {
  test("prérequis manquants : chaque problème avec son action", () => {
    const t = apiFailureText({
      error: "prerequisites",
      problems: [
        {
          message: "Aucun stockage Import.",
          action: "Activer Import sur local.",
        },
        { message: "Pont absent.", action: "Créer vmbr0." },
      ],
    });
    expect(t).toContain(
      "Aucun stockage Import. À faire : Activer Import sur local.",
    );
    expect(t).toContain("Pont absent. À faire : Créer vmbr0.");
  });
  test("bloc d'adresses invalide : toutes les raisons", () => {
    const t = apiFailureText({
      error: "invalid_network",
      details: ["passerelle hors réseau", "plage qui chevauche"],
    });
    expect(t).toContain("passerelle hors réseau");
    expect(t).toContain("plage qui chevauche");
  });
  test("cause et action, ou rien pour une autre erreur (laisser errorText)", () => {
    expect(
      apiFailureText({
        error: "connect_failed",
        cause: "Jeton refusé.",
        action: "Recréer.",
      }),
    ).toBe("Jeton refusé. À faire : Recréer.");
    expect(
      apiFailureText({
        error: "invalid_address",
        message: "Adresse invalide.",
      }),
    ).toBe("Adresse invalide.");
    expect(
      apiFailureText({
        error: "url_blocked",
        message: "adresse refusée (lien local)",
      }),
    ).toBe("adresse refusée (lien local)");
    expect(
      apiFailureText({ error: "secret_scope", message: "référence réservée" }),
    ).toBe("référence réservée");
    expect(apiFailureText({ error: "not_found" })).toBeNull();
    expect(apiFailureText(undefined)).toBeNull();
  });
});
