import { describe, expect, it } from "vitest";
import {
  CLIENT_VM_LIMITS,
  clientTags,
  net0Spec,
  throttleDiskSpec,
} from "./limits.ts";

describe("étiquettes Proxmox d'un VPS client", () => {
  it("pose nexora;vps;client-<organisation> en minuscules", () => {
    expect(clientTags("8F2A0C11-0000-4000-8000-000000000001")).toBe(
      "nexora;vps;client-8f2a0c11-0000-4000-8000-000000000001",
    );
  });
  it("refuse un identifiant qui ne ferait pas une étiquette valide", () => {
    expect(() => clientTags("a b;c")).toThrow();
  });
});

describe("limites d'entrées-sorties du disque", () => {
  const base = "ssd-1tb:vm-300-disk-0,discard=on,iothread=1,size=3G";
  it("ajoute les plafonds de débit et d'opérations sans toucher au reste", () => {
    const out = throttleDiskSpec(base);
    expect(
      out.startsWith("ssd-1tb:vm-300-disk-0,discard=on,iothread=1,size=3G"),
    ).toBe(true);
    expect(out).toContain(`mbps_rd=${CLIENT_VM_LIMITS.diskMbpsRead}`);
    expect(out).toContain(`mbps_wr=${CLIENT_VM_LIMITS.diskMbpsWrite}`);
    expect(out).toContain(`iops_rd=${CLIENT_VM_LIMITS.diskIopsRead}`);
    expect(out).toContain(`iops_wr=${CLIENT_VM_LIMITS.diskIopsWrite}`);
  });
  it("conserve la taille et ne double jamais une limite déjà posée", () => {
    const out = throttleDiskSpec(`${base},mbps_rd=5,iops_wr=7`);
    expect(out).toContain("size=3G");
    expect(out.match(/mbps_rd=/g)).toHaveLength(1);
    expect(out.match(/iops_wr=/g)).toHaveLength(1);
    expect(out).toContain(`mbps_rd=${CLIENT_VM_LIMITS.diskMbpsRead}`);
  });
  it("est idempotent", () => {
    const once = throttleDiskSpec(base);
    expect(throttleDiskSpec(once)).toBe(once);
  });
});

describe("carte réseau", () => {
  it("plafonne le débit et active le pare-feu", () => {
    expect(net0Spec("vmbr1")).toBe(
      `virtio,bridge=vmbr1,firewall=1,rate=${CLIENT_VM_LIMITS.netRateMBps}`,
    );
  });
});
