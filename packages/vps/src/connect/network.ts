import type { IpPool } from "@nexora/db";
import { intToIp, ipToInt, poolCapacity, validatePool } from "../ips.ts";

/**
 * Validation du bloc d'adresses saisi pour un serveur : en plus des règles du pool (`validatePool`),
 * vérifie la cohérence réseau (passerelle et plages dans le même sous-réseau, ni adresse du réseau ni
 * adresse de diffusion, pas de chevauchement, pas l'adresse du serveur Proxmox lui-même).
 *
 * Les VPS vendus reçoivent une adresse IPv4 dédiée et stable : le bloc est donc toujours statique
 * (pas de DHCP : une adresse qui change couperait la VM, dont le pare-feu est lié à son adresse).
 */
export interface NetworkContext {
  /** Adresses IPv4 du serveur Proxmox (hôte saisi, adresse de son pont) : jamais attribuables. */
  nodeAddresses: string[];
  /** CIDR du pont choisi, si Proxmox l'a annoncé (pour avertir d'un bloc dans un autre réseau). */
  bridgeCidr?: string | null;
}

export interface NetworkValidation {
  errors: string[];
  warnings: string[];
  /** Nombre d'adresses attribuables (passerelle et DNS exclus). */
  usable: number;
}

const maskOf = (prefix: number) =>
  prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
const isV4 = (ip: string) => {
  try {
    ipToInt(ip);
    return true;
  } catch {
    return false;
  }
};

export function validateNetwork(
  pool: IpPool,
  ctx: NetworkContext,
): NetworkValidation {
  const errors = validatePool(pool);
  const warnings: string[] = [];
  const valid =
    errors.length === 0 &&
    isV4(pool.gateway) &&
    pool.ranges.every((r) => isV4(r.from) && isV4(r.to));
  if (!valid) return { errors, warnings, usable: 0 };

  const mask = maskOf(pool.prefix);
  const net = (ipToInt(pool.gateway) & mask) >>> 0;
  const broadcast = (net | (~mask >>> 0)) >>> 0;
  const label = `${intToIp(net)}/${pool.prefix}`;
  const spans: { from: number; to: number; text: string }[] = [];
  for (const [i, r] of pool.ranges.entries()) {
    const from = ipToInt(r.from);
    const to = ipToInt(r.to);
    const where = `plage ${i + 1} (${r.from} – ${r.to})`;
    if ((from & mask) >>> 0 !== net || (to & mask) >>> 0 !== net)
      errors.push(
        `${where} : sort du réseau ${label} de la passerelle ${pool.gateway}.`,
      );
    else {
      if (from <= net && to >= net)
        errors.push(
          `${where} : contient l'adresse du réseau (${intToIp(net)}), qui n'est pas attribuable.`,
        );
      if (from <= broadcast && to >= broadcast)
        errors.push(
          `${where} : contient l'adresse de diffusion (${intToIp(broadcast)}), qui n'est pas attribuable.`,
        );
    }
    spans.push({ from, to, text: where });
    for (const addr of ctx.nodeAddresses)
      if (isV4(addr) && from <= ipToInt(addr) && ipToInt(addr) <= to)
        errors.push(
          `${where} : contient l'adresse ${addr}, déjà utilisée par le serveur Proxmox.`,
        );
  }
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && cur.from <= prev.to)
      errors.push(`${prev.text} et ${cur.text} se chevauchent.`);
  }
  if (ipToInt(pool.gateway) === net || ipToInt(pool.gateway) === broadcast)
    errors.push(
      "la passerelle ne peut pas être l'adresse du réseau ni de diffusion.",
    );

  const usable = errors.length === 0 ? poolCapacity(pool) : 0;
  if (errors.length === 0 && usable < 5)
    warnings.push(
      `Seulement ${usable} adresses utilisables : le serveur pourra héberger au plus ${usable} VPS.`,
    );
  if (ctx.bridgeCidr) {
    const [addr, p] = ctx.bridgeCidr.split("/");
    if (addr && p && isV4(addr)) {
      const bridgeNet = (ipToInt(addr) & maskOf(Number(p))) >>> 0;
      if (bridgeNet !== net || Number(p) !== pool.prefix)
        warnings.push(
          `Le bloc (${label}) n'est pas le réseau du pont ${pool.bridge} (${intToIp(bridgeNet)}/${p}) : cela fonctionne seulement avec un VLAN ou un routage prévu pour ce bloc. Vérifier avec le réseau (guide, § Réseau).`,
        );
    }
  }
  return { errors, warnings, usable };
}
