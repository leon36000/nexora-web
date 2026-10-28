import type { VpsAppPort } from "@nexora/db";

/**
 * Pare-feu Proxmox par VM (D8) : rien n'entre sauf SSH (22), l'écho ICMP et les ports de
 * l'application déclarés `public` ; en sortie, le port 25 est fermé (spam) et les réseaux privés,
 * le lien local et 100.64.0.0/10 sont fermés (une VM cliente ne peut balayer ni les autres VPS ni le
 * réseau de l'opérateur), SAUF la passerelle (ICMP) et les résolveurs DNS du réservoir d'adresses ;
 * la VM ne peut usurper ni adresse IP ni adresse MAC. Les règles portent un commentaire `nexora:…` : c'est ce qui permet
 * de rejouer l'application du plan sans doublons et de ne jamais toucher à une règle posée à la
 * main par l'opérateur.
 */
export interface FirewallRuleSpec {
  type: "in" | "out";
  action: "ACCEPT" | "DROP";
  enable: 1;
  /** Absent : tous les protocoles. */
  proto?: "tcp" | "udp" | "icmp";
  dport?: string;
  /** Destination (adresse ou CIDR) : sortie seulement. */
  dest?: string;
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

/**
 * Destinations fermées en sortie. fe80::/10 (IPv6 lien local) n'y figure pas volontairement : la
 * découverte de voisins (NDP) en dépend, et les réservoirs d'adresses sont IPv4.
 */
export const PRIVATE_EGRESS_BLOCKS: readonly string[] = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];

/** Ce que la VM doit pouvoir joindre malgré la fermeture : la passerelle et les résolveurs de son réservoir. */
export interface EgressPool {
  gateway: string;
  dns: readonly string[];
}

export function buildFirewallPlan(
  ports: readonly VpsAppPort[],
  egress: EgressPool,
): FirewallPlan {
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
  // Sortie : les acceptations (passerelle, DNS) précèdent TOUJOURS les fermetures (Proxmox évalue dans l'ordre).
  rules.push({
    type: "out",
    action: "ACCEPT",
    enable: 1,
    proto: "icmp",
    dest: egress.gateway,
    comment: `${RULE_PREFIX}egress-gw`,
  });
  for (const ip of new Set(egress.dns))
    for (const proto of ["udp", "tcp"] as const)
      rules.push({
        type: "out",
        action: "ACCEPT",
        enable: 1,
        proto,
        dport: "53",
        dest: ip,
        comment: `${RULE_PREFIX}egress-dns-${ip}/${proto}`,
      });
  for (const cidr of PRIVATE_EGRESS_BLOCKS)
    rules.push({
      type: "out",
      action: "DROP",
      enable: 1,
      dest: cidr,
      comment: `${RULE_PREFIX}egress-deny-${cidr}`,
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
  dest?: string;
  comment?: string;
}

const sig = (r: {
  type?: string;
  action?: string;
  proto?: string;
  dport?: string;
  dest?: string;
  comment?: string;
}) =>
  `${r.type}|${r.action}|${r.proto ?? ""}|${r.dport ?? ""}|${r.dest ?? ""}|${r.comment ?? ""}`;

/**
 * Écart entre le plan voulu et les règles existantes ; ne regarde que les règles `nexora:`.
 * Le bloc de sortie est ordonné (acceptations avant fermetures) : dès qu'il diffère, il est retiré
 * en entier et reposé dans l'ordre du plan, au lieu d'ajouter une règle à la fin.
 */
export function diffFirewallRules(
  wanted: readonly FirewallRuleSpec[],
  existing: readonly ExistingRule[],
): { toAdd: FirewallRuleSpec[]; toRemove: number[] } {
  const ours = existing.filter((r) => r.comment?.startsWith(RULE_PREFIX));
  const have = new Set(ours.map(sig));
  const want = new Set(wanted.map(sig));
  const outChanged =
    wanted.some((r) => r.type === "out" && !have.has(sig(r))) ||
    ours.some((r) => r.type === "out" && !want.has(sig(r)));
  const rewrite = (r: { type?: string }) => outChanged && r.type === "out";
  return {
    toAdd: wanted.filter((r) => rewrite(r) || !have.has(sig(r))),
    // Positions en ordre décroissant : supprimer la dernière d'abord garde les autres valides.
    toRemove: ours
      .filter((r) => rewrite(r) || !want.has(sig(r)))
      .map((r) => r.pos)
      .sort((a, b) => b - a),
  };
}
