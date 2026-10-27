import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Garde des appels sortants vers une adresse saisie par un humain (SSRF) : URL de fournisseur de modèles, d'instance
 * WorkStudio, d'ingestion de source. Aucun appel réseau ici sauf la résolution DNS.
 *
 * Classes : public | loopback | private | link-local | reserved. Les adresses « link-local » (dont les métadonnées du nuage
 * 169.254.169.254) et « reserved » sont refusées SANS exception. Boucle locale et réseau privé sont refusés en
 * production, sauf pour les hôtes, adresses ou plages que l'opérateur a listés (NEXORA_OUTBOUND_ALLOW) ; en
 * développement (NODE_ENV différent de « production »), elles sont admises. L'IPv4 inscrite dans de l'IPv6 (::ffff:…),
 * en notation décimale comme hexadécimale, suit les règles de l'IPv4.
 *
 * Limite connue : la vérification précède la connexion (résolution séparée) ; un rebond DNS entre les deux n'est pas
 * couvert (voir docs/recette/securite.md).
 */
export type AddressClass =
  | "public"
  | "loopback"
  | "private"
  | "link-local"
  | "reserved";

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
  ["64:ff9b::", 96, "ipv6"], // NAT64 : refusé en bloc (l'IPv4 embarquée n'est pas classée)
  ["64:ff9b:1::", 48, "ipv6"], // NAT64 à usage local (RFC 8215)
  ["2002::", 16, "ipv6"], // 6to4 : IPv4 embarquée, refusé en bloc
  ["fec0::", 10, "ipv6"], // site-local obsolète (RFC 3879)
  ["100::", 64, "ipv6"],
]);
/**
 * ::a.b.c.d (IPv4-compatible, obsolète) : refusé comme réservé. ::1 en est exclu : c'est la boucle locale, classée
 * comme telle pour que la politique « développement » continue de s'y appliquer.
 */
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

export const isNonPublicAddress = (address: string): boolean =>
  classifyAddress(address) !== "public";

export interface OutboundPolicy {
  /** Boucle locale et réseau privé admis (développement). */
  allowInternal: boolean;
  /** Hôtes (noms ou adresses) et plages CIDR admis même s'ils sont internes (jamais link-local ni réservés). */
  allow: string[];
}

export function policyFromEnv(
  env: Record<string, string | undefined>,
): OutboundPolicy {
  return {
    allowInternal: env.NODE_ENV !== "production",
    allow: (env.NEXORA_OUTBOUND_ALLOW ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  };
}

function allowedByList(
  host: string,
  addresses: string[],
  allow: string[],
): boolean {
  if (allow.length === 0) return false;
  const hostLower = host.toLowerCase();
  const cidrs = new BlockList();
  const names = new Set<string>();
  for (const entry of allow) {
    const m = /^([0-9a-f:.]+)\/(\d{1,3})$/i.exec(entry);
    if (m && isIP(m[1] as string)) {
      try {
        cidrs.addSubnet(
          m[1] as string,
          Number(m[2]),
          isIP(m[1] as string) === 4 ? "ipv4" : "ipv6",
        );
      } catch {
        // plage invalide : ignorée (fermé)
      }
    } else names.add(entry);
  }
  const hostOk = names.has(hostLower);
  return addresses.every((a) => {
    const mapped = unmap(a);
    const target = mapped ?? a;
    const fam = isIP(target) === 4 ? "ipv4" : "ipv6";
    return hostOk || names.has(a.toLowerCase()) || cidrs.check(target, fam);
  });
}

export type OutboundCheck =
  | { ok: true; url: URL; addresses: string[] }
  | { ok: false; reason: string };

/**
 * Noms qui désignent le lien local ou les métadonnées du nuage : refusés sans exception, même en `literalOnly`.
 * Les autres noms en `.internal` (`host.docker.internal`, `passerelle.interne`…) restent admis : ce sont les adresses
 * documentées d'une passerelle sur l'hôte ou le réseau Docker, que seul le réseau de LiteLLM sait résoudre.
 */
function isLinkLocalName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return (
    h.endsWith(".local") ||
    h === "instance-data" ||
    h === "metadata" ||
    h.startsWith("metadata.") ||
    h.includes(".metadata.")
  );
}

/** localhost et *.localhost : boucle locale (RFC 6761), soumise à la même politique que 127.0.0.1. */
function isLoopbackName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost");
}

export interface OutboundOptions {
  resolve?: (host: string) => Promise<string[]>;
  /**
   * Ne résout pas les noms (adresse vue d'un autre réseau, par exemple celle que LiteLLM appellera) : seules les
   * adresses littérales sont classées, un nom passe.
   */
  literalOnly?: boolean;
}

async function defaultResolve(host: string): Promise<string[]> {
  const all = await lookup(host, { all: true });
  return all.map((a) => a.address);
}

/** Vérifie une URL saisie avant tout appel. Le motif de refus ne contient ni identifiants ni adresse résolue. */
export async function checkOutboundUrl(
  raw: string,
  policy: OutboundPolicy,
  options: OutboundOptions = {},
): Promise<OutboundCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "URL invalide" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { ok: false, reason: "seuls http et https sont admis" };
  if (url.username || url.password)
    return { ok: false, reason: "URL avec identifiants refusée" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (options.literalOnly && !isIP(host)) {
    if (isLinkLocalName(host))
      return {
        ok: false,
        reason:
          "adresse refusée (métadonnées du nuage, lien local ou réservée)",
      };
    if (isLoopbackName(host)) {
      if (
        policy.allowInternal ||
        allowedByList(host, ["127.0.0.1"], policy.allow)
      )
        return { ok: true, url, addresses: [] };
      return {
        ok: false,
        reason:
          "adresse du réseau interne refusée (à autoriser par l'opérateur : NEXORA_OUTBOUND_ALLOW)",
      };
    }
    return { ok: true, url, addresses: [] };
  }
  let addresses: string[];
  try {
    addresses = isIP(host)
      ? [host]
      : await (options.resolve ?? defaultResolve)(host);
  } catch {
    return { ok: false, reason: "hôte introuvable" };
  }
  if (addresses.length === 0) return { ok: false, reason: "hôte introuvable" };
  const classes = addresses.map(classifyAddress);
  if (classes.some((c) => c === "link-local" || c === "reserved"))
    return {
      ok: false,
      reason: "adresse refusée (métadonnées du nuage, lien local ou réservée)",
    };
  if (classes.every((c) => c === "public")) return { ok: true, url, addresses };
  if (policy.allowInternal) return { ok: true, url, addresses };
  if (allowedByList(host, addresses, policy.allow))
    return { ok: true, url, addresses };
  return {
    ok: false,
    reason:
      "adresse du réseau interne refusée (à autoriser par l'opérateur : NEXORA_OUTBOUND_ALLOW)",
  };
}

/**
 * Lit un corps (Request ou Response) par morceaux et s'arrête dès que `max` octets sont dépassés : le flux est alors
 * annulé, jamais lu en entier. À préférer à `text()` / `arrayBuffer()` pour tout corps venu du réseau.
 */
export async function readLimitedBytes(
  source: { body: ReadableStream<Uint8Array> | null },
  max: number,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  if (!source.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = source.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return { ok: false };
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.byteLength;
  }
  return { ok: true, bytes };
}
