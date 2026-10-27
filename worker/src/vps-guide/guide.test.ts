import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MIN_PVE_LABEL, PROVISION_ROLE_PRIVILEGES } from "@nexora/vps";
import { describe, expect, it } from "vitest";
import {
  buildGuideHtml,
  GUIDE_MD,
  GUIDE_PDF,
  pdfTitle,
  sourceHash,
} from "./guide.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const md = () => readFileSync(GUIDE_MD, "utf8");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("le PDF du guide est à jour avec sa source", () => {
  it("existe, est un vrai PDF, et porte l'empreinte de la version courante de guide-branchement-proxmox.md", () => {
    expect(
      existsSync(GUIDE_PDF),
      "PDF absent : lancer « bun run guide:vps »",
    ).toBe(true);
    const bytes = readFileSync(GUIDE_PDF);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(20_000);
    const title = pdfTitle(bytes);
    expect(title, "titre du PDF illisible").toBeTruthy();
    expect(
      title,
      "Le PDF est plus vieux que sa source (guide-branchement-proxmox.md a changé) : lancer « bun run guide:vps » puis commiter le PDF.",
    ).toContain(`source ${sourceHash(md())}`);
  });

  it("l'empreinte dépend du contenu : une seule lettre changée la change", () => {
    const a = sourceHash(md());
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(sourceHash(`${md()} `)).not.toBe(a);
    expect(a).toBe(
      createHash("sha256").update(md()).digest("hex").slice(0, 12),
    );
  });
});

describe("le guide dit la même chose que le code", () => {
  it("la commande « pveum role add » liste exactement les privilèges utilisés par Nexora, dans le même ordre", () => {
    const m = /pveum role add NexoraProvision --privs "([^"]+)"/.exec(md());
    expect(m).toBeTruthy();
    // Le shell supprime « \ » + retour à la ligne à l'intérieur des guillemets : on fait pareil.
    const privs = (m?.[1] ?? "").replace(/\\\n/g, "").trim().split(/\s+/);
    expect(privs).toEqual([...PROVISION_ROLE_PRIVILEGES]);
    expect(md()).toContain(
      `exactement les ${PROVISION_ROLE_PRIVILEGES.length} privilèges`,
    );
  });

  it("la version minimale annoncée est celle que le code exige", () => {
    expect(md()).toContain(`Proxmox VE ${MIN_PVE_LABEL} ou plus récent`);
    expect(md()).toContain(
      `la version ${MIN_PVE_LABEL} ou plus récente est requise`,
    );
  });

  it("chaque message du dépannage existe dans le code (aucune formulation inventée)", () => {
    const section = md().split("## 9. Dépannage")[1]?.split("## 10.")[0] ?? "";
    const messages = [...section.matchAll(/^\| « (.+?) » \|/gm)].map(
      (m) => m[1] as string,
    );
    expect(messages.length).toBeGreaterThan(25);
    const sources = [
      "packages/vps/src/connect/discover.ts",
      "packages/vps/src/connect/connect.ts",
      "packages/vps/src/connect/network.ts",
      "packages/vps/src/connect/setup.ts",
      "packages/vps/src/proxmox/tls-probe.ts",
      "cms/extensions-src/nexora-cms/src/vps/module/Vps.vue",
      "web/src/server/vps/guide.ts",
      "web/src/server/vps/admin-handlers.ts",
    ]
      .map(read)
      .join("\n");
    // Le code écrit la version minimale par interpolation : on compare avec la même écriture.
    const missing = messages.filter(
      (m) => !sources.includes(m.replace(MIN_PVE_LABEL, "${MIN_PVE_LABEL}")),
    );
    expect(missing).toEqual([]);
  });

  it("ne contient aucun secret : pas de jeton complet, pas de clé privée, pas de mot de passe", () => {
    const text = md();
    expect(text).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(text).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
    expect(text).not.toMatch(/sk_(live|test)_/);
    expect(text).not.toMatch(/--password|cipassword/i);
  });
});

describe("mise en page", () => {
  it("page HTML complète : titre avec l'empreinte, sommaire cliquable, encadrés, aucune ressource externe", () => {
    const html = buildGuideHtml(md(), { date: "27 octobre 2026" });
    expect(html).toContain("<title>");
    expect(html).toContain(`source ${sourceHash(md())}`);
    expect(html).toContain('class="sommaire"');
    expect(html).toMatch(/<a href="#1-ce-que-nexora-fait-seul[^"]*">/);
    expect(html).toContain('class="encadre attention"');
    expect(html).not.toMatch(/(src|href)="https?:\/\/(?!pve\.proxmox)/);
    expect(html).not.toContain("<script");
  });
});
