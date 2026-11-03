/**
 * Plafonds appliqués à CHAQUE VM client (économie des ressources, isolation du bruit : un VPS ne doit
 * jamais affamer les VM de Nexora ni un autre client). Valeurs de départ pour un disque NVMe, à ajuster
 * avec de vraies mesures ; elles se changent ici, en un seul endroit.
 */
export const CLIENT_VM_LIMITS = {
  /** Poids d'ordonnancement CPU (cgroup v2, défaut Proxmox 100) : les VM de Nexora passent avant. */
  cpuUnits: 50,
  /** Débit du disque (Mo/s). */
  diskMbpsRead: 150,
  diskMbpsWrite: 75,
  /** Opérations par seconde du disque. */
  diskIopsRead: 3000,
  diskIopsWrite: 1500,
  /** Débit de la carte réseau (Mo/s, soit environ 100 Mbit/s). */
  netRateMBps: 12,
} as const;

const TAG = /^[a-z0-9][a-z0-9_.-]*$/;

/** Étiquettes Proxmox d'un VPS client : `nexora;vps;client-<organisation>` (classement et audit par client). */
export function clientTags(organizationId: string): string {
  const id = organizationId.toLowerCase();
  if (!TAG.test(id))
    throw new Error("identifiant d'organisation impropre à une étiquette");
  return `nexora;vps;client-${id}`;
}

const THROTTLE_KEYS = new Set(["mbps_rd", "mbps_wr", "iops_rd", "iops_wr"]);

/**
 * Ajoute les plafonds d'entrées-sorties à la spécification d'un disque (`stockage:volume,option=…`).
 * La taille (`size=`, informative pour un volume existant) est conservée ; une limite déjà posée est
 * remplacée, jamais doublée.
 */
export function throttleDiskSpec(spec: string): string {
  const [volume, ...opts] = spec.split(",");
  const kept = opts.filter((o) => {
    const key = o.split("=")[0] ?? "";
    return !THROTTLE_KEYS.has(key);
  });
  return [
    volume,
    ...kept,
    `mbps_rd=${CLIENT_VM_LIMITS.diskMbpsRead}`,
    `mbps_wr=${CLIENT_VM_LIMITS.diskMbpsWrite}`,
    `iops_rd=${CLIENT_VM_LIMITS.diskIopsRead}`,
    `iops_wr=${CLIENT_VM_LIMITS.diskIopsWrite}`,
  ].join(",");
}

/** Carte réseau d'un VPS : pont du réservoir, pare-feu actif, débit plafonné. */
export function net0Spec(bridge: string): string {
  return `virtio,bridge=${bridge},firewall=1,rate=${CLIENT_VM_LIMITS.netRateMBps}`;
}
