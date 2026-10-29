import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Filtre d'adresses du service de navigateur. Le navigateur ne doit JAMAIS atteindre le réseau interne : toute
 * destination (page, sous-ressource, redirection, WebSocket) est classée ici avant qu'une connexion s'ouvre.
 *
 * Mêmes plages que `classifyAddress` de `packages/net` (un test de parité les compare), mais ce service est
 * autonome : son image ne contient pas le reste du dépôt, et il n'y a AUCUNE option « réseau interne permis » en
 * production. La seule dérogation est la boucle locale, réservée aux essais (`allowLoopback`, jamais lue dans
 * l'environnement). Le lien local et les métadonnées du nuage sont refusés sans exception.
 */
export type AddressClass =
  | "public"
  | "loopback"
  | "private"
  | "link-local"
  | "reserved";

export interface AddressPolicy {
  /** Liste fermée des ports de destination. */
  allowedPorts: readonly number[];
  /** ESSAIS SEULEMENT : admet 127.0.0.0/8 et ::1 (jamais lu dans l'environnement de production). */
  allowLoopback: boolean;
}

function list(entries: Array<[string, number, "ipv4" | "ipv6"]>): BlockList {
  const b = new BlockList();
  for (const [net, prefix, family] of entries) b.addSubnet(net, prefix, family);
  return b;
}

const LOOPBACK = list([
  ["127.0.0.0", 8, "ipv4"],
  ["::1", 128, "ipv6"],
]);
const PRIVATE = list([
  ["10.0.0.0", 8, "ipv4"],
  ["172.16.0.0", 12, "ipv4"],
  ["192.168.0.0", 16, "ipv4"],
  ["100.64.0.0", 10, "ipv4"],
  ["fc00::", 7, "ipv6"],
]);
const LINK_LOCAL = list([
  ["169.254.0.0", 16, "ipv4"],
  ["fe80::", 10, "ipv6"],
]);
const RESERVED = list([
  ["0.0.0.0", 8, "ipv4"],
  ["192.0.0.0", 24, "ipv4"],
  ["192.0.2.0", 24, "ipv4"],
  ["198.18.0.0", 15, "ipv4"],
  ["198.51.100.0", 24, "ipv4"],
  ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 3, "ipv4"],
  ["::", 128, "ipv6"],
  ["ff00::", 8, "ipv6"],
  ["2001:db8::", 32, "ipv6"],
  ["64:ff9b::", 96, "ipv6"],
  ["64:ff9b:1::", 48, "ipv6"],
  ["2002::", 16, "ipv6"],
  ["fec0::", 10, "ipv6"],
  ["100::", 64, "ipv6"],
]);
const IPV4_COMPATIBLE = list([["::", 96, "ipv6"]]);

/** ::ffff:a.b.c.d ou ::ffff:xxxx:yyyy -> a.b.c.d (null si ce n'est pas une IPv4 inscrite). */
function unmap(ip: string): string | null {
  const low = ip.toLowerCase();
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(low);
  if (dotted) return dotted[1] as string;
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(low);
  if (hex) {
    const hi = Number.parseInt(hex[1] as string, 16);
    const lo = Number.parseInt(hex[2] as string, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function classifyAddress(address: string): AddressClass {
  const ip = address.replace(/^\[|\]$/g, "").split("%")[0] as string;
  const family = isIP(ip);
  if (family === 0) return "reserved";
  const mapped = family === 6 ? unmap(ip) : null;
  const target = mapped ?? ip;
  const type = mapped || family === 4 ? "ipv4" : "ipv6";
  if (LINK_LOCAL.check(target, type)) return "link-local";
  if (RESERVED.check(target, type)) return "reserved";
  if (type === "ipv6" && !LOOPBACK.check(target, type)) {
    if (IPV4_COMPATIBLE.check(target, type)) return "reserved";
  }
  if (LOOPBACK.check(target, type)) return "loopback";
  if (PRIVATE.check(target, type)) return "private";
  return "public";
}

const INTERNAL_SUFFIXES = [
  ".local",
  ".localhost",
  ".internal",
  ".lan",
  ".home.arpa",
  ".intranet",
  ".corp",
  ".private",
];

/** Nom de machine qui désigne le réseau interne ou les métadonnées du nuage (jamais une adresse littérale). */
function nameProblem(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h.length === 0) return "hôte vide";
  if (!h.includes(".")) return "nom de machine sans domaine refusé";
  if (INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) return "nom interne refusé";
  if (h === "metadata" || h.startsWith("metadata.") || h.includes(".metadata."))
    return "métadonnées du nuage refusées";
  // Un « nom » fait seulement de nombres (2130706433, 0x7f.1, 017700000001) serait lu comme une IPv4 par le résolveur
  // du système : aucun vrai domaine n'a un suffixe numérique, on refuse.
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(h))
    return "adresse numérique ambiguë refusée";
  return null;
}

export type SyntaxCheck =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Contrôle d'une adresse sans réseau : schéma, identifiants, port, nom, adresse littérale. Sert de premier barrage
 * (interception des requêtes du navigateur) ; la résolution et le classement des adresses se font à la connexion
 * (`checkDestination`, appelé par le mandataire de sortie).
 */
export function checkUrlSyntax(
  raw: string,
  policy: AddressPolicy,
): SyntaxCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "adresse invalide" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "seuls http et https sont admis" };
  if (url.username || url.password)
    return { ok: false, reason: "adresse avec identifiants refusée" };
  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!policy.allowedPorts.includes(port))
    return { ok: false, reason: "port non permis" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    const cls = classifyAddress(host);
    if (cls === "public" || (cls === "loopback" && policy.allowLoopback))
      return { ok: true, url };
    return { ok: false, reason: "adresse non publique refusée" };
  }
  const problem = nameProblem(host);
  if (problem) return { ok: false, reason: problem };
  return { ok: true, url };
}

export type Resolver = (host: string) => Promise<string[]>;

export const systemResolver: Resolver = async (host) =>
  (await lookup(host, { all: true })).map((a) => a.address);

export type DestinationCheck =
  | { ok: true; addresses: string[] }
  | { ok: false; reason: string };

/**
 * Destination d'une connexion : port permis, nom résolu UNE fois, TOUTES les adresses classées (une seule non
 * publique suffit à refuser), puis la connexion se fait à l'adresse validée par l'appelant (pas de seconde résolution).
 * Le motif de refus ne contient jamais l'adresse résolue.
 */
export async function checkDestination(
  host: string,
  port: number,
  policy: AddressPolicy,
  resolve: Resolver = systemResolver,
): Promise<DestinationCheck> {
  if (!policy.allowedPorts.includes(port))
    return { ok: false, reason: "port non permis" };
  const bare = host.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(bare)) addresses = [bare];
  else {
    const problem = nameProblem(bare);
    if (problem) return { ok: false, reason: problem };
    try {
      addresses = await resolve(bare);
    } catch {
      return { ok: false, reason: "hôte introuvable" };
    }
  }
  if (addresses.length === 0) return { ok: false, reason: "hôte introuvable" };
  for (const address of addresses) {
    const cls = classifyAddress(address);
    if (cls === "public") continue;
    if (cls === "loopback" && policy.allowLoopback) continue;
    return { ok: false, reason: "adresse non publique refusée" };
  }
  return { ok: true, addresses };
}
