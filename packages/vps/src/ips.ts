import type { IpPool } from "@nexora/db";

/** Arithmétique IPv4 du pool d'un serveur Proxmox (attribution d'une adresse par VPS). */
const OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const MAX_RANGE_SIZE = 65_536;

export function ipToInt(ip: string): number {
  const parts = ip.split(".");
  if (parts.length !== 4 || !parts.every((p) => OCTET.test(p)))
    throw new Error("adresse IPv4 invalide");
  return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}

export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

const isIp = (ip: string) => {
  try {
    ipToInt(ip);
    return true;
  } catch {
    return false;
  }
};

/** Adresses réservées : passerelle et serveurs DNS ne sont jamais attribuées à une VM. */
function reserved(pool: IpPool): Set<number> {
  const out = new Set<number>();
  for (const ip of [pool.gateway, ...pool.dns])
    if (isIp(ip)) out.add(ipToInt(ip));
  return out;
}

export function* poolAddresses(pool: IpPool): Generator<string> {
  const skip = reserved(pool);
  for (const range of pool.ranges) {
    const from = ipToInt(range.from);
    const to = ipToInt(range.to);
    for (let n = from; n <= to; n++) if (!skip.has(n)) yield intToIp(n);
  }
}

/** Première adresse libre, ou null si le pool est épuisé. */
export function pickFreeIp(
  pool: IpPool,
  used: ReadonlySet<string>,
): string | null {
  for (const ip of poolAddresses(pool)) if (!used.has(ip)) return ip;
  return null;
}

export function poolCapacity(pool: IpPool): number {
  let n = 0;
  for (const _ of poolAddresses(pool)) n++;
  return n;
}

/** Problèmes de configuration du pool (liste vide = valide). */
export function validatePool(pool: IpPool): string[] {
  const issues: string[] = [];
  if (!Array.isArray(pool.ranges) || pool.ranges.length === 0)
    issues.push("au moins une plage d'adresses est requise");
  let total = 0;
  for (const [i, r] of (pool.ranges ?? []).entries()) {
    if (!isIp(r.from) || !isIp(r.to)) {
      issues.push(`plage ${i + 1} : adresse IPv4 invalide`);
      continue;
    }
    const size = ipToInt(r.to) - ipToInt(r.from) + 1;
    if (size < 1) issues.push(`plage ${i + 1} : la fin précède le début`);
    total += Math.max(size, 0);
  }
  if (total > MAX_RANGE_SIZE)
    issues.push(`plages trop vastes (${MAX_RANGE_SIZE} adresses au plus)`);
  if (!Number.isInteger(pool.prefix) || pool.prefix < 8 || pool.prefix > 30)
    issues.push("préfixe de réseau : entier de 8 à 30");
  if (!isIp(pool.gateway)) issues.push("passerelle : adresse IPv4 invalide");
  if (
    !Array.isArray(pool.dns) ||
    pool.dns.length === 0 ||
    !pool.dns.every(isIp)
  )
    issues.push("DNS : au moins une adresse IPv4 valide");
  if (!/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(pool.bridge))
    issues.push("pont réseau : nom Proxmox invalide (ex. vmbr0)");
  return issues;
}
