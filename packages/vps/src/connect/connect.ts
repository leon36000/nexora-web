import {
  and,
  type Database,
  eq,
  proxmoxServers,
  type Region,
  type TlsMode,
} from "@nexora/db";
import { ProxmoxClient, ProxmoxError } from "../proxmox/client.ts";
import { isLoopback } from "../proxmox/transport.ts";
import { connectionOf } from "../servers.ts";
import {
  type Discovery,
  discoverServer,
  explainProxmoxError,
} from "./discover.ts";

type Server = typeof proxmoxServers.$inferSelect;

export interface ConnectInput {
  /** Identifiant court du serveur (aussi la référence du Coffre : `proxmox.<code>`). */
  code: string;
  /** Hôte ou nom, sans schéma (`http://127.0.0.1` n'est admis que pour le simulateur). */
  host: string;
  port?: number;
  tokenRef: string;
  tlsMode: TlsMode;
  /** Empreinte SHA-256 confirmée par l'opérateur (mode épinglé). */
  tlsFingerprint: string | null;
  name?: string;
  region?: Region;
}

/** Échec du « Connecter » : cause en français et action à faire (jamais de jeton, jamais de corps de réponse). */
export class ConnectError extends Error {
  readonly code:
    | "token_missing"
    | "unreachable"
    | "invalid_request"
    | "conflict";
  readonly cause_: string;
  readonly action: string;
  constructor(code: ConnectError["code"], cause: string, action: string) {
    super(cause);
    this.name = "ConnectError";
    this.code = code;
    this.cause_ = cause;
    this.action = action;
  }
}

const CODE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const FINGERPRINT = /^([0-9a-fA-F]{2}:?){32}$/;

/** Code de serveur proposé d'après l'adresse saisie (`pve.exemple.ca` → `pve-exemple-ca`). */
export function suggestServerCode(host: string): string {
  const slug = host
    .replace(/^https?:\/\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  // Une adresse IP (ou tout nom commençant par un chiffre) reçoit le préfixe « pve- » : lisible et sans ambiguïté.
  const named = /^[a-z]/.test(slug) ? slug : `pve-${slug || "serveur"}`;
  return CODE.test(named) ? named : "pve-serveur";
}

/**
 * « Connecter » : se connecte avec le jeton (déjà au Coffre) en vérifiant le TLS AVANT d'envoyer
 * quoi que ce soit, découvre le serveur, et crée (ou retrouve) sa fiche en brouillon. Rejouable :
 * le même hôte et port retombent sur la même fiche, sans doublon, et les choix déjà validés
 * (capacité, bloc d'adresses, nom) ne sont pas écrasés.
 */
export async function connectServer(
  db: Database,
  deps: { getSecret: (ref: string) => Promise<string>; now?: () => Date },
  input: ConnectInput,
): Promise<{ server: Server; discovery: Discovery; created: boolean }> {
  if (!CODE.test(input.code))
    throw new ConnectError(
      "invalid_request",
      "Identifiant de serveur invalide (lettres minuscules, chiffres et tirets).",
      "Corriger l'identifiant.",
    );
  if (
    input.tlsMode === "pinned" &&
    !FINGERPRINT.test(input.tlsFingerprint ?? "")
  )
    throw new ConnectError(
      "invalid_request",
      "Empreinte du certificat manquante ou mal formée.",
      "Relancer la vérification du certificat et la confirmer.",
    );
  const port = input.port ?? 8006;
  const c = connectionOf({ host: input.host, port });
  const token = await deps.getSecret(input.tokenRef).catch(() => {
    throw new ConnectError(
      "token_missing",
      "Le jeton n'est pas au Coffre (ou il a été révoqué).",
      "Coller de nouveau le jeton Proxmox.",
    );
  });
  let discovery: Discovery;
  try {
    const client = new ProxmoxClient({
      host: c.host,
      port: c.port,
      protocol: c.protocol,
      token,
      tls:
        input.tlsMode === "pinned"
          ? { mode: "pinned", fingerprint: input.tlsFingerprint as string }
          : { mode: "verify" },
    });
    discovery = await discoverServer(client);
  } catch (e) {
    if (e instanceof ProxmoxError) {
      const x = explainProxmoxError(e);
      throw new ConnectError("unreachable", x.cause, x.action);
    }
    throw e;
  }

  const now = (deps.now ?? (() => new Date()))();
  const blocking = discovery.problems.filter((p) => p.severity === "blocking");
  const detail = blocking.length
    ? `${blocking.length} point(s) à corriger : ${blocking.map((p) => p.message).join(" ")}`
    : `Proxmox VE ${discovery.version}, nœud ${discovery.node}`;
  const common = {
    tokenRef: input.tokenRef,
    tlsMode: input.tlsMode,
    tlsFingerprint: input.tlsMode === "pinned" ? input.tlsFingerprint : null,
    pveVersion: discovery.version,
    lastCheckedAt: now,
    lastCheckOk: blocking.length === 0,
    lastCheckDetail: detail.slice(0, 300),
    updatedAt: now,
  };

  const [sameHost] = await db
    .select()
    .from(proxmoxServers)
    .where(
      and(eq(proxmoxServers.host, input.host), eq(proxmoxServers.port, port)),
    );
  if (sameHost) {
    const [row] = await db
      .update(proxmoxServers)
      .set(common)
      .where(eq(proxmoxServers.id, sameHost.id))
      .returning();
    return { server: row ?? sameHost, discovery, created: false };
  }
  const [sameCode] = await db
    .select({ id: proxmoxServers.id })
    .from(proxmoxServers)
    .where(eq(proxmoxServers.code, input.code));
  if (sameCode)
    throw new ConnectError(
      "conflict",
      "Un autre serveur porte déjà cet identifiant.",
      "Choisir un autre identifiant.",
    );
  const [row] = await db
    .insert(proxmoxServers)
    .values({
      code: input.code,
      name: input.name?.trim() || input.code,
      host: input.host,
      port,
      node: discovery.node ?? "",
      region: input.region ?? "quebec",
      capacity: {
        vcpu: Math.max(1, discovery.capacity.vcpu),
        ramMb: Math.max(1, discovery.capacity.ramMb),
        diskGb: Math.max(1, discovery.capacity.diskGb),
      },
      // Brouillon : le bloc d'adresses est saisi à l'étape suivante.
      ipPool: {
        ranges: [],
        prefix: discovery.network.prefix ?? 24,
        gateway: discovery.network.gateway ?? "",
        dns: discovery.network.dns,
        bridge: discovery.bridge ?? "vmbr0",
      },
      storage: discovery.vmStorage ?? "local-lvm",
      state: "draft",
      ...common,
    })
    .returning();
  if (!row) throw new Error("serveur non créé");
  return { server: row, discovery, created: true };
}

/**
 * Adresse saisie par l'opérateur : `hôte`, `hôte:port` ou `https://hôte:port`. Renvoie `null` si elle
 * n'est pas valable. `http://` n'est admis que vers la boucle locale (simulateur, développement).
 */
export function parseServerAddress(
  raw: string,
): { host: string; port: number } | null {
  const text = raw.trim();
  const m = /^(?:(https?):\/\/)?([A-Za-z0-9.-]+)(?::(\d{1,5}))?\/?$/.exec(text);
  if (!m) return null;
  const scheme = m[1];
  const host = (m[2] as string).toLowerCase();
  const port = m[3] === undefined ? 8006 : Number(m[3]);
  if (
    !(port >= 1 && port <= 65535) ||
    host.startsWith(".") ||
    host.endsWith(".")
  )
    return null;
  if (scheme === "http") {
    return isLoopback(host) ? { host: `http://${host}`, port } : null;
  }
  return { host, port };
}

/**
 * Identifiant proposé pour une adresse : celui du serveur déjà connu à cette adresse et ce port (donc
 * « Connecter » rejoué retombe sur la même fiche), sinon celui tiré de l'adresse, suffixé `-2`, `-3`…
 * s'il est déjà pris par un autre serveur.
 */
export async function availableServerCode(
  db: Database,
  host: string,
  port: number,
): Promise<string> {
  const [known] = await db
    .select({ code: proxmoxServers.code })
    .from(proxmoxServers)
    .where(and(eq(proxmoxServers.host, host), eq(proxmoxServers.port, port)));
  if (known) return known.code;
  const base = suggestServerCode(host);
  for (let n = 1; n < 100; n++) {
    const code =
      n === 1
        ? base
        : `${base.slice(0, 40 - `-${n}`.length)}-${n}`.replace(/-+$/, "");
    const [taken] = await db
      .select({ id: proxmoxServers.id })
      .from(proxmoxServers)
      .where(eq(proxmoxServers.code, code));
    if (!taken && CODE.test(code)) return code;
  }
  throw new Error("aucun identifiant libre");
}
