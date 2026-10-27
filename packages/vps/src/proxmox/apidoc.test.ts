import { describe, expect, it } from "vitest";
import {
  APIDOC_META,
  getMethodDef,
  listEndpoints,
  matchPath,
  validateParams,
  validateReturns,
} from "./apidoc.ts";

const def = (template: string, method: string) => {
  const d = getMethodDef(template, method);
  if (!d) throw new Error(`absent : ${method} ${template}`);
  return d;
};

describe("schéma officiel de l'API Proxmox (sous-ensemble)", () => {
  it("documente sa source et sa date", () => {
    expect(APIDOC_META.source).toBe(
      "https://pve.proxmox.com/pve-docs/api-viewer/apidoc.js",
    );
    expect(APIDOC_META.lastModified).toMatch(/GMT$/);
    expect(APIDOC_META.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(listEndpoints().length).toBeGreaterThanOrEqual(25);
  });

  it("retrouve un chemin avec ses paramètres", () => {
    const m = matchPath("/nodes/pve1/qemu/10001/status/start");
    expect(m?.template).toBe("/nodes/{node}/qemu/{vmid}/status/start");
    expect(m?.pathParams).toEqual({ node: "pve1", vmid: "10001" });
    expect(matchPath("/nodes/pve1/inexistant")).toBeNull();
  });

  it("clone : newid obligatoire, borné de 100 à 999999999", () => {
    const d = def("/nodes/{node}/qemu/{vmid}/clone", "POST");
    const base = { node: "pve1", vmid: "9000" };
    expect(validateParams(d, base).issues.map((i) => i.param)).toContain(
      "newid",
    );
    expect(validateParams(d, { ...base, newid: 99 }).ok).toBe(false);
    expect(validateParams(d, { ...base, newid: 1_000_000_000 }).ok).toBe(false);
    const ok = validateParams(d, { ...base, newid: "10001", full: "1" });
    expect(ok.ok).toBe(true);
    expect(ok.values).toMatchObject({ newid: 10001, full: true });
  });

  it("refuse les propriétés inconnues (additionalProperties: 0)", () => {
    const d = def("/nodes/{node}/qemu/{vmid}/config", "PUT");
    const r = validateParams(d, { node: "pve1", vmid: 100, cipassworld: "x" });
    expect(r.ok).toBe(false);
    expect(r.issues[0]?.param).toBe("cipassworld");
  });

  it("accepte les propriétés à indice (ipconfig0, net1, scsi0)", () => {
    const d = def("/nodes/{node}/qemu/{vmid}/config", "PUT");
    const r = validateParams(d, {
      node: "pve1",
      vmid: 100,
      ipconfig0: "ip=10.0.0.5/24,gw=10.0.0.1",
      net0: "virtio,bridge=vmbr0,firewall=1",
      cores: 2,
    });
    expect(r.ok).toBe(true);
  });

  it("vérifie énumérations, bornes et booléens", () => {
    const fw = def("/nodes/{node}/qemu/{vmid}/firewall/options", "PUT");
    expect(
      validateParams(fw, { node: "pve1", vmid: 100, policy_in: "BLOCK" }).ok,
    ).toBe(false);
    expect(
      validateParams(fw, {
        node: "pve1",
        vmid: 100,
        policy_in: "DROP",
        enable: "1",
      }).ok,
    ).toBe(true);
    const cfg = def("/nodes/{node}/qemu/{vmid}/config", "PUT");
    expect(validateParams(cfg, { node: "pve1", vmid: 100, cores: 0 }).ok).toBe(
      false,
    );
    expect(
      validateParams(cfg, { node: "pve1", vmid: 100, onboot: "oui" }).ok,
    ).toBe(false);
  });

  it("valide une réponse contre le schéma `returns`", () => {
    const d = def("/nodes/{node}/tasks/{upid}/status", "GET");
    expect(
      validateReturns(d.returns, {
        upid: "UPID:pve1:1:1:1:qmstart:100:root@pam:",
        node: "pve1",
        pid: 1,
        pstart: 1,
        starttime: 1,
        type: "qmstart",
        id: "100",
        user: "root@pam",
        status: "stopped",
        exitstatus: "OK",
      }),
    ).toEqual([]);
    expect(
      validateReturns(d.returns, { status: "dormant" }).length,
    ).toBeGreaterThan(0);
  });
});
