import type { VpsAppPort } from "@nexora/db";

/**
 * Pare-feu Proxmox par VM (D8) : rien n'entre sauf SSH (22), l'écho ICMP et les ports de
 * l'application déclarés `public` ; le port 25 sortant est fermé (spam) ; la VM ne peut usurper
 * ni adresse IP ni adresse MAC. Les règles portent un commentaire `nexora:…` : c'est ce qui permet
 * de rejouer l'application du plan sans doublons et de ne jamais toucher à une règle posée à la
 * main par l'opérateur.
 */
export interface FirewallRuleSpec {
  type: "in" | "out";
  action: "ACCEPT" | "DROP";
  enable: 1;
  proto: "tcp" | "udp" | "icmp";
  dport?: string;
  comment: string;
  [k: string]: string | number | boolean | undefined;
}

export interface FirewallPlan {
  options: Record<string, string | number | boolean>;
  rules: FirewallRuleSpec[];
}

export const RULE_PREFIX = "nexora:";
const SSH_PORT = 22;
const BLOCKED_OUT = [25];

export function buildFirewallPlan(ports: readonly VpsAppPort[]): FirewallPlan {
  const rules: FirewallRuleSpec[] = [
    {
      type: "in",
      action: "ACCEPT",
      enable: 1,
      proto: "tcp",
      dport: String(SSH_PORT),
      comment: `${RULE_PREFIX}ssh`,
    },
  ];
  const seen = new Set<string>([`tcp/${SSH_PORT}`]);
  for (const p of ports) {
    if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65_535)
      throw new Error(`port d'application invalide : ${p.port}`);
    if (p.exposure !== "public") continue;
    const key = `${p.proto}/${p.port}`;
    if (p.port === SSH_PORT || BLOCKED_OUT.includes(p.port) || seen.has(key))
      throw new Error(`port d'application refusé : ${key}`);
    seen.add(key);
    rules.push({
      type: "in",
      action: "ACCEPT",
      enable: 1,
      proto: p.proto,
      dport: String(p.port),
      comment: `${RULE_PREFIX}app-${p.port}/${p.proto}`,
    });
  }
  rules.push({
    type: "in",
    action: "ACCEPT",
    enable: 1,
    proto: "icmp",
    comment: `${RULE_PREFIX}icmp`,
  });
  for (const port of BLOCKED_OUT)
    rules.push({
      type: "out",
      action: "DROP",
      enable: 1,
      proto: "tcp",
      dport: String(port),
      comment: `${RULE_PREFIX}smtp-out`,
    });
  return {
    options: {
      enable: 1,
      policy_in: "DROP",
      policy_out: "ACCEPT",
      // Pas d'usurpation d'adresse IP ni MAC, pas de DHCP serveur, pas d'annonces de routeur.
      ipfilter: 1,
      macfilter: 1,
      dhcp: 0,
      radv: 0,
      log_level_in: "nolog",
      log_level_out: "nolog",
    },
    rules,
  };
}

export interface ExistingRule {
  pos: number;
  type?: string;
  action?: string;
  proto?: string;
  dport?: string;
  comment?: string;
}

const sig = (r: {
  type?: string;
  action?: string;
  proto?: string;
  dport?: string;
  comment?: string;
}) =>
  `${r.type}|${r.action}|${r.proto ?? ""}|${r.dport ?? ""}|${r.comment ?? ""}`;

/** Écart entre le plan voulu et les règles existantes ; ne regarde que les règles `nexora:`. */
export function diffFirewallRules(
  wanted: readonly FirewallRuleSpec[],
  existing: readonly ExistingRule[],
): { toAdd: FirewallRuleSpec[]; toRemove: number[] } {
  const ours = existing.filter((r) => r.comment?.startsWith(RULE_PREFIX));
  const have = new Set(ours.map(sig));
  const want = new Set(wanted.map(sig));
  return {
    toAdd: wanted.filter((r) => !have.has(sig(r))),
    // Positions en ordre décroissant : supprimer la dernière d'abord garde les autres valides.
    toRemove: ours
      .filter((r) => !want.has(sig(r)))
      .map((r) => r.pos)
      .sort((a, b) => b - a),
  };
}
