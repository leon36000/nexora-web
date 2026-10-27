import { describe, expect, test } from "bun:test";
import {
  type AppForm,
  appBadges,
  appliedLabel,
  buildAppBody,
  buildPlanBody,
  buildServerBody,
  buildTemplateBody,
  describeDiff,
  describeIssue,
  describeStripePlans,
  errorText,
  formatCents,
  formatDate,
  formatRanges,
  indexIssues,
  isIPv4,
  label,
  type PlanForm,
  parseDns,
  parseDollarsToCents,
  parseRanges,
  priceLabel,
  proxmoxRef,
  SERVER_STATE,
  type ServerForm,
  summarizeTest,
  toInt,
} from "./format";

describe("montants en dollars <-> cents", () => {
  test("convertit sans nombre à virgule flottante", () => {
    expect(parseDollarsToCents("24,90")).toBe(2490);
    expect(parseDollarsToCents("24.9")).toBe(2490);
    expect(parseDollarsToCents("24")).toBe(2400);
    expect(parseDollarsToCents(" 0,01 ")).toBe(1);
    expect(parseDollarsToCents("19.99")).toBe(1999);
    expect(parseDollarsToCents("1,1")).toBe(110);
    expect(parseDollarsToCents("100000")).toBe(10_000_000);
  });
  test("refuse 0 $, négatif, trop de décimales, notation scientifique et dépassement", () => {
    for (const bad of [
      "",
      "0",
      "0,00",
      "abc",
      "-1",
      "1,234",
      "1e3",
      "1,2,3",
      "100000,01",
      "12 $",
    ])
      expect(parseDollarsToCents(bad)).toBeNull();
  });
  test("aller-retour et affichage", () => {
    for (const v of ["0,01", "12,00", "24,90", "1999,99"])
      expect(formatCents(parseDollarsToCents(v))).toBe(v);
    expect(formatCents(null)).toBe("");
    expect(formatCents(undefined)).toBe("");
    expect(priceLabel(2490)).toBe("24,90 $");
    expect(priceLabel(null)).toBe("—");
  });
});

describe("nombres, adresses et listes", () => {
  test("entiers stricts", () => {
    expect(toInt("12")).toBe(12);
    expect(toInt(" 8006 ")).toBe(8006);
    expect(toInt(5)).toBe(5);
    for (const bad of ["", "1.5", "1e3", "abc", 1.5, null, undefined, "12 3"])
      expect(toInt(bad)).toBeNull();
  });
  test("adresses IPv4", () => {
    expect(isIPv4("10.0.0.1")).toBe(true);
    for (const bad of ["10.0.0", "256.1.1.1", "a.b.c.d", "10.0.0.1/24", ""])
      expect(isIPv4(bad)).toBe(false);
  });
  test("plages d'adresses, une par ligne", () => {
    expect(
      parseRanges("10.0.0.10 - 10.0.0.50\n10.0.1.1 – 10.0.1.9\n\n"),
    ).toEqual([
      { from: "10.0.0.10", to: "10.0.0.50" },
      { from: "10.0.1.1", to: "10.0.1.9" },
    ]);
    expect(parseRanges("10.0.0.10 10.0.0.50")).toEqual([
      { from: "10.0.0.10", to: "10.0.0.50" },
    ]);
    for (const bad of [
      "10.0.0.10",
      "10.0.0.10 - x",
      "1.1.1.1 - 2.2.2.2 - 3.3.3.3",
    ])
      expect(parseRanges(bad)).toBeNull();
    expect(formatRanges(parseRanges("10.0.0.10-10.0.0.50") ?? [])).toBe(
      "10.0.0.10 - 10.0.0.50",
    );
  });
  test("DNS", () => {
    expect(parseDns("1.1.1.1, 9.9.9.9")).toEqual(["1.1.1.1", "9.9.9.9"]);
    expect(parseDns("1.1.1.1 ; 9.9.9.9")).toEqual(["1.1.1.1", "9.9.9.9"]);
    expect(parseDns("dns.exemple.ca")).toBeNull();
  });
});

describe("libellés", () => {
  test("états", () => {
    expect(label(SERVER_STATE, "ready")).toBe("prêt");
    expect(label(SERVER_STATE, "offline")).toBe("hors ligne");
    expect(label(SERVER_STATE, "inconnu")).toBe("inconnu");
    expect(label(SERVER_STATE, null)).toBe("—");
    expect(appliedLabel(null)).toBe("jamais faite");
    expect(appliedLabel("applied")).toBe("appliquée");
    expect(appliedLabel("failed")).toBe("en échec");
  });
  test("dates locales stables", () => {
    expect(formatDate("2026-10-27T18:05:00Z", "UTC")).toBe("2026-10-27 18:05");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("pas une date")).toBe("—");
  });
});

describe("problèmes de la garde", () => {
  test("décrit un problème de la garde (plan, application)", () => {
    expect(
      describeIssue({
        entity: "plan",
        code: "starter",
        issue: "price_missing",
        message: "aucun prix",
      }),
    ).toBe("Plan « starter » : aucun prix (jamais 0 $)");
    expect(
      describeIssue({
        entity: "app",
        code: "n8n",
        issue: "excluded",
        message: "x",
      }),
    ).toContain("exclue de l’installation (D8)");
    expect(
      describeIssue({
        entity: "app",
        code: "x",
        issue: "license_not_permissive",
        message: "x",
      }),
    ).toBe(
      "Application « x » : licence non permissive : installation refusée (D8)",
    );
  });
  test("code inconnu : reprend le message de l'app", () => {
    expect(
      describeIssue({
        entity: "plan",
        code: "p",
        issue: "nouveau",
        message: "texte",
      }),
    ).toBe("Plan « p » : texte");
  });
  test("chaînes du serveur et erreurs de validation", () => {
    expect(describeIssue("hôte invalide")).toBe("hôte invalide");
    expect(describeIssue({ path: "capacity.vcpu", code: "too_small" })).toBe(
      "Champ « capacity.vcpu » : valeur trop petite ou trop courte",
    );
    expect(describeIssue({ path: "", code: "unrecognized_keys" })).toBe(
      "champ inconnu",
    );
    expect(describeIssue(null)).toBe("problème inconnu");
    expect(describeIssue(42)).toBe("problème inconnu");
  });
  test("indexe par élément et déduit les pastilles de la licence", () => {
    const index = indexIssues([
      { entity: "app", code: "n8n", issue: "excluded", message: "" },
      {
        entity: "app",
        code: "n8n",
        issue: "license_not_permissive",
        message: "",
      },
      { entity: "app", code: "n8n", issue: "excluded", message: "" },
      { entity: "plan", code: "p", issue: "price_missing", message: "" },
      "bruit",
      null,
    ]);
    expect(index["app:n8n"]).toEqual(["excluded", "license_not_permissive"]);
    expect(index["plan:p"]).toEqual(["price_missing"]);
    expect(appBadges(index["app:n8n"])).toEqual([
      "licence non permissive",
      "exclue de l’installation (D8)",
    ]);
    expect(appBadges(index["plan:p"])).toEqual([]);
    expect(appBadges(undefined)).toEqual([]);
    expect(indexIssues("x")).toEqual({});
  });
});

describe("différences et résultats", () => {
  test("décrit les différences", () => {
    expect(
      describeDiff({ entity: "plan", code: "starter", change: "added" }),
    ).toBe("Plan ajouté : starter");
    expect(describeDiff({ entity: "app", code: "x", change: "removed" })).toBe(
      "Application retirée : x",
    );
    expect(
      describeDiff({
        entity: "plan",
        code: "starter",
        change: "changed",
        fields: ["priceMonthlyCents", "ramMb"],
      }),
    ).toBe("Plan modifié : starter (prix mensuel, RAM)");
    expect(
      describeDiff({
        entity: "app",
        code: "x",
        change: "changed",
        fields: ["version"],
      }),
    ).toBe("Application modifiée : x (version)");
  });
  test("publier vers Stripe : une ligne par plan", () => {
    expect(
      describeStripePlans({
        status: "applied",
        plans: {
          starter: {
            productId: "prod_1",
            monthly: "price_m",
            yearly: "price_y",
            created: 2,
          },
          pro: { productId: "prod_2", monthly: "price_m2", created: 0 },
        },
      }),
    ).toEqual([
      "starter : produit prod_1 · prix mensuel price_m · prix annuel price_y · 2 nouveaux prix",
      "pro : produit prod_2 · prix mensuel price_m2 · aucun nouveau prix",
    ]);
    expect(describeStripePlans(null)).toEqual([]);
  });
  test("résumé du test de connexion", () => {
    expect(
      summarizeTest({
        ok: true,
        detail: "ok",
        version: "8.2.4",
        templates: [
          { code: "debian-12", ok: true },
          { code: "ubuntu-24", ok: false },
        ],
      }),
    ).toBe(
      "Connexion réussie · Proxmox 8.2.4 · gabarits : debian-12 prêt, ubuntu-24 introuvable",
    );
    expect(
      summarizeTest({
        ok: false,
        detail: "nœud « pve » absent du serveur",
        version: null,
        templates: [],
      }),
    ).toBe(
      "Connexion en échec · nœud « pve » absent du serveur · aucun gabarit à vérifier",
    );
  });
});

describe("messages d'erreur", () => {
  test("code applicatif d'abord, puis état HTTP, puis réseau", () => {
    expect(errorText(409, "conflict")).toBe(
      "Cet élément existe déjà (code en double).",
    );
    expect(errorText(422, "publication_refused")).toBe(
      "Refusé par la garde de publication.",
    );
    expect(errorText(502, "VPS_INDISPONIBLE")).toContain("injoignable");
    expect(errorText(401, "")).toContain("reconnectez-vous");
    expect(errorText(403, "FORBIDDEN")).toBe("Réservé aux administrateurs.");
    expect(errorText(500, "")).toContain("erreur");
    expect(errorText(undefined, "")).toContain("réseau");
    expect(errorText(418, "bizarre")).toBe("Échec de l’opération (bizarre).");
    expect(errorText(418, "")).toBe("Échec de l’opération.");
  });
  test("aucun message ne contient de secret", () => {
    for (const c of [
      "VPS_NON_CONFIGURE",
      "VPS_NON_AUTORISE",
      "admin_not_configured",
    ])
      expect(errorText(502, c)).not.toMatch(/Bearer|sk-|secret/i);
  });
});

const server = (over: Partial<ServerForm> = {}): ServerForm => ({
  code: "pve-1",
  name: "Proxmox principal",
  host: "pve.exemple.ca",
  port: "8006",
  node: "pve",
  region: "quebec",
  vcpu: "64",
  ramMb: "262144",
  diskGb: "4000",
  ranges: "10.0.0.10 - 10.0.0.50",
  prefix: "24",
  gateway: "10.0.0.1",
  dns: "1.1.1.1, 9.9.9.9",
  bridge: "vmbr0",
  storage: "local-lvm",
  pool: "",
  vmidMin: "10000",
  tlsMode: "verify",
  tlsFingerprint: "",
  state: "",
  ...over,
});
const FP = "ab".repeat(32);

describe("corps du serveur", () => {
  test("création : valeurs converties et structure attendue par l'API", () => {
    const r = buildServerBody(server(), "create");
    expect(r).toEqual({
      ok: true,
      body: {
        code: "pve-1",
        name: "Proxmox principal",
        host: "pve.exemple.ca",
        port: 8006,
        node: "pve",
        region: "quebec",
        capacity: { vcpu: 64, ramMb: 262144, diskGb: 4000 },
        ipPool: {
          ranges: [{ from: "10.0.0.10", to: "10.0.0.50" }],
          prefix: 24,
          gateway: "10.0.0.1",
          dns: ["1.1.1.1", "9.9.9.9"],
          bridge: "vmbr0",
        },
        storage: "local-lvm",
        pool: null,
        vmidMin: 10000,
        tlsMode: "verify",
        tlsFingerprint: null,
      },
    });
  });
  test("ne contient jamais de jeton ni de référence de jeton (elle passe par le Coffre)", () => {
    const r = buildServerBody(server(), "create");
    expect(JSON.stringify(r)).not.toMatch(/token|jeton|tokenRef/i);
  });
  test("édition : pas de code, état seulement s'il est permis", () => {
    const r = buildServerBody(server({ state: "maintenance" }), "edit");
    expect(r.ok && "code" in r.body).toBe(false);
    expect(r.ok && r.body.state).toBe("maintenance");
    const none = buildServerBody(server(), "edit");
    expect(none.ok && "state" in none.body).toBe(false);
    const ready = buildServerBody(server({ state: "ready" }), "edit");
    expect(ready.ok).toBe(false);
  });
  test("mode épinglé : l'empreinte est exigée et envoyée", () => {
    expect(buildServerBody(server({ tlsMode: "pinned" }), "create").ok).toBe(
      false,
    );
    expect(
      buildServerBody(
        server({ tlsMode: "pinned", tlsFingerprint: "zz" }),
        "create",
      ).ok,
    ).toBe(false);
    const ok = buildServerBody(
      server({ tlsMode: "pinned", tlsFingerprint: FP }),
      "create",
    );
    expect(ok.ok && ok.body.tlsFingerprint).toBe(FP);
    const colons = FP.match(/../g)?.join(":") ?? "";
    expect(
      buildServerBody(
        server({ tlsMode: "pinned", tlsFingerprint: colons }),
        "create",
      ).ok,
    ).toBe(true);
    // en mode « verify » une empreinte restée dans le formulaire n'est pas envoyée
    const verify = buildServerBody(
      server({ tlsMode: "verify", tlsFingerprint: FP }),
      "create",
    );
    expect(verify.ok && verify.body.tlsFingerprint).toBeNull();
  });
  test("refuse les valeurs invalides avec un message français", () => {
    for (const over of [
      { code: "A" },
      { code: "pve_1" },
      { name: " " },
      { host: "" },
      { port: "0" },
      { port: "70000" },
      { node: "" },
      { vcpu: "0" },
      { ramMb: "abc" },
      { diskGb: "-1" },
      { ranges: "" },
      { ranges: "10.0.0.50" },
      { prefix: "7" },
      { prefix: "31" },
      { gateway: "10.0.0" },
      { dns: "" },
      { dns: "1.1.1.1,2.2.2.2,3.3.3.3,4.4.4.4,5.5.5.5" },
      { bridge: "" },
      { storage: "" },
      { vmidMin: "99" },
      { tlsMode: "http" },
    ]) {
      const r = buildServerBody(server(over), "create");
      expect([over, r.ok]).toEqual([over, false]);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });
  test("référence du Coffre conforme au contrat du Coffre", () => {
    expect(proxmoxRef("pve-1")).toBe("proxmox.pve-1");
    expect(proxmoxRef("a".repeat(40))).toMatch(/^[a-z0-9._-]{3,64}$/);
  });
});

describe("corps du gabarit", () => {
  const tpl = {
    code: "debian-12",
    name: "Debian 12",
    os: "debian",
    osVersion: "12",
    vmid: "9000",
    ciUser: "debian",
  };
  test("création et édition", () => {
    const c = buildTemplateBody(tpl, "create");
    expect(c).toEqual({
      ok: true,
      body: {
        code: "debian-12",
        name: "Debian 12",
        os: "debian",
        osVersion: "12",
        vmid: 9000,
        ciUser: "debian",
      },
    });
    const e = buildTemplateBody(tpl, "edit");
    expect(e.ok && "code" in e.body).toBe(false);
  });
  test("refus", () => {
    for (const over of [
      { code: "X" },
      { name: "" },
      { os: "" },
      { vmid: "99" },
      { vmid: "x" },
      { ciUser: "Root!" },
    ])
      expect(buildTemplateBody({ ...tpl, ...over }, "create").ok).toBe(false);
  });
});

const plan = (over: Partial<PlanForm> = {}): PlanForm => ({
  code: "starter",
  name: "Départ",
  descriptionFr: "Pour commencer",
  descriptionEn: "To start",
  vcpu: "2",
  ramMb: "4096",
  diskGb: "80",
  bandwidthGb: "2000",
  region: "quebec",
  priceMonthly: "24,90",
  priceYearly: "249",
  highlighted: false,
  templateCode: "debian-12",
  sort: "100",
  isDevSample: false,
  ...over,
});

describe("corps du plan", () => {
  test("les prix en dollars partent en cents entiers", () => {
    const r = buildPlanBody(plan(), "create");
    expect(r.ok && r.body.priceMonthlyCents).toBe(2490);
    expect(r.ok && r.body.priceYearlyCents).toBe(24900);
    expect(r.ok && Number.isInteger(r.body.priceMonthlyCents)).toBe(true);
    expect(r.ok && r.body.code).toBe("starter");
  });
  test("durée non offerte : prix vide = null ; jamais 0 $", () => {
    const r = buildPlanBody(plan({ priceYearly: "" }), "edit");
    expect(r.ok && r.body.priceYearlyCents).toBeNull();
    expect(r.ok && "code" in r.body).toBe(false);
    expect(buildPlanBody(plan({ priceMonthly: "0" }), "create").ok).toBe(false);
    expect(buildPlanBody(plan({ priceMonthly: "abc" }), "create").ok).toBe(
      false,
    );
  });
  test("refus", () => {
    for (const over of [
      { code: "A" },
      { name: "" },
      { vcpu: "0" },
      { vcpu: "257" },
      { ramMb: "100" },
      { diskGb: "0" },
      { bandwidthGb: "-1" },
      { templateCode: "" },
      { sort: "10001" },
    ])
      expect([over, buildPlanBody(plan(over), "create").ok]).toEqual([
        over,
        false,
      ]);
  });
  test("conserve mise en avant et plan de développement", () => {
    const r = buildPlanBody(
      plan({ highlighted: true, isDevSample: true }),
      "edit",
    );
    expect(r.ok && r.body.highlighted).toBe(true);
    expect(r.ok && r.body.isDevSample).toBe(true);
  });
});

const app = (over: Partial<AppForm> = {}): AppForm => ({
  code: "nextcloud",
  name: "Nextcloud",
  kind: "installable",
  version: "29.0.4",
  upstreamUrl: "https://github.com/nextcloud/server",
  license: "AGPL-3.0",
  licenseUrl: "https://github.com/nextcloud/server/blob/master/COPYING",
  licenseWarningFr: "",
  licenseWarningEn: "",
  taglineFr: "Fichiers",
  taglineEn: "Files",
  descriptionFr: "",
  descriptionEn: "",
  guideFr: "",
  guideEn: "",
  installScript: "#!/bin/sh\necho ok\n",
  ports: [
    {
      port: "443",
      proto: "tcp",
      exposure: "public",
      labelFr: "Web",
      labelEn: "Web",
    },
  ],
  minRamMb: "2048",
  sort: "100",
  ...over,
});

describe("corps de l'application", () => {
  test("installable : le script part tel quel, sans somme (calculée par le serveur)", () => {
    const r = buildAppBody(app(), "create");
    expect(r.ok && r.body.installScript).toBe("#!/bin/sh\necho ok\n");
    expect(r.ok && JSON.stringify(r.body)).not.toMatch(/sha256/i);
    expect(r.ok && r.body.ports).toEqual([
      {
        port: 443,
        proto: "tcp",
        exposure: "public",
        labelFr: "Web",
        labelEn: "Web",
      },
    ]);
    expect(r.ok && r.body.minRamMb).toBe(2048);
  });
  test("guide : jamais de script, même s'il en reste dans le formulaire", () => {
    const r = buildAppBody(app({ kind: "guide" }), "edit");
    expect(r.ok && r.body.installScript).toBeNull();
    expect(r.ok && "code" in r.body).toBe(false);
  });
  test("refus", () => {
    for (const over of [
      { code: "N8N!" },
      { name: "" },
      { kind: "autre" },
      { version: "" },
      { upstreamUrl: "ftp://x" },
      { upstreamUrl: "pas une adresse" },
      { license: "" },
      { licenseUrl: "http://x.ca/LICENSE" },
      { minRamMb: "100" },
      { sort: "-1" },
      { installScript: "  \n" },
      { installScript: "x".repeat(200_001) },
      {
        ports: [
          {
            port: "0",
            proto: "tcp",
            exposure: "public",
            labelFr: "",
            labelEn: "",
          },
        ],
      },
      {
        ports: [
          {
            port: "22",
            proto: "icmp",
            exposure: "public",
            labelFr: "",
            labelEn: "",
          },
        ],
      },
      {
        ports: [
          {
            port: "22",
            proto: "tcp",
            exposure: "monde",
            labelFr: "",
            labelEn: "",
          },
        ],
      },
    ])
      expect([
        over,
        buildAppBody(app(over as Partial<AppForm>), "create").ok,
      ]).toEqual([over, false]);
  });
});
