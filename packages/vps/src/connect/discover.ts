import {
  type NetworkIface,
  type ProxmoxClient,
  ProxmoxError,
  type StorageInfo,
} from "../proxmox/client.ts";

/**
 * Découverte d'un serveur Proxmox à partir de la seule adresse et du jeton : nœud, version,
 * capacité, stockages, pont réseau, DNS et DROITS du jeton. Tout est lu par l'API (lecture seule) ;
 * rien n'est créé. Le résultat sert à préremplir le formulaire : l'opérateur ne fait que valider.
 */

/** Version minimale de Proxmox VE (voir docs/vps/guide-branchement-proxmox.md, § Prérequis). */
export const MIN_PVE = { major: 9, minor: 0 } as const;
export const MIN_PVE_LABEL = `${MIN_PVE.major}.${MIN_PVE.minor}`;

/** Nom du rôle à créer sur Proxmox (guide du personnel). */
export const PROVISION_ROLE = "NexoraProvision";

/** Privilèges du rôle `NexoraProvision` : exactement ce que le moteur de Nexora utilise. */
export const PROVISION_ROLE_PRIVILEGES = [
  "Datastore.AllocateSpace",
  "Datastore.AllocateTemplate",
  "Datastore.Audit",
  "SDN.Use",
  "Sys.AccessNetwork",
  "Sys.Audit",
  "VM.Allocate",
  "VM.Audit",
  "VM.Clone",
  "VM.Config.CDROM",
  "VM.Config.CPU",
  "VM.Config.Cloudinit",
  "VM.Config.Disk",
  "VM.Config.HWType",
  "VM.Config.Memory",
  "VM.Config.Network",
  "VM.Config.Options",
  "VM.GuestAgent.Audit",
  "VM.PowerMgmt",
  "VM.Snapshot",
  "VM.Snapshot.Rollback",
] as const;

const VM_PRIVILEGES = PROVISION_ROLE_PRIVILEGES.filter((p) =>
  p.startsWith("VM."),
);

export interface DiscoveryProblem {
  id:
    | "version"
    | "node"
    | "vm-storage"
    | "import-storage"
    | "bridge"
    | "privileges";
  severity: "blocking" | "warning";
  /** Ce qui ne va pas, en français. */
  message: string;
  /** Ce que l'opérateur doit faire. */
  action: string;
}

export interface DiscoveredStorage {
  storage: string;
  type: string;
  content: string[];
  totalGb: number;
  availGb: number;
  usableForDisks: boolean;
  usableForImport: boolean;
  /** Stockage de type fichier sur lequel on peut activer le contenu « Import ». */
  canEnableImport: boolean;
}

export interface DiscoveredBridge {
  name: string;
  cidr: string | null;
  gateway: string | null;
  ports: string | null;
}

export interface MissingPrivilege {
  path: string;
  privilege: string;
}

export interface Discovery {
  version: string;
  versionOk: boolean;
  nodes: string[];
  node: string | null;
  capacity: { vcpu: number; ramMb: number; diskGb: number };
  storages: DiscoveredStorage[];
  vmStorage: string | null;
  importStorage: string | null;
  /** Stockage de type fichier où activer « Import » quand aucun ne l'a. */
  importCandidate: string | null;
  bridges: DiscoveredBridge[];
  bridge: string | null;
  network: { prefix: number | null; gateway: string | null; dns: string[] };
  pool: string | null;
  privileges: { ok: boolean; missing: MissingPrivilege[] };
  /** Gabarits (VM modèles) déjà présents sur le nœud. */
  existingTemplates: { vmid: number; name: string }[];
  problems: DiscoveryProblem[];
}

export interface DiscoverOptions {
  node?: string;
  vmStorage?: string;
  importStorage?: string;
  bridge?: string;
  /** `null` : pas de pool (droits sur /vms) ; absent : détecté d'après les droits du jeton. */
  pool?: string | null;
}

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const FILE_TYPES = new Set(["dir", "nfs", "cifs", "btrfs", "cephfs"]);
const DISK_PREFERENCE = ["lvmthin", "zfspool", "rbd", "lvm", "btrfs", "dir"];
const truthy = (v: unknown) => v === true || v === 1 || v === "1";

export function parseVersion(v: string): { major: number; minor: number } {
  const m = /^(\d+)\.(\d+)/.exec(v);
  return { major: Number(m?.[1] ?? 0), minor: Number(m?.[2] ?? 0) };
}

export function versionAtLeast(
  v: string,
  min: { major: number; minor: number } = MIN_PVE,
): boolean {
  const p = parseVersion(v);
  return p.major > min.major || (p.major === min.major && p.minor >= min.minor);
}

function describeStorage(s: StorageInfo): DiscoveredStorage {
  const content = s.content.split(",").filter(Boolean);
  const live = truthy(s.active) && truthy(s.enabled ?? 1);
  return {
    storage: s.storage,
    type: s.type,
    content,
    totalGb: Math.floor((s.total ?? 0) / GIB),
    availGb: Math.floor((s.avail ?? 0) / GIB),
    usableForDisks: live && content.includes("images"),
    usableForImport: live && content.includes("import"),
    canEnableImport:
      live && FILE_TYPES.has(s.type) && !content.includes("import"),
  };
}

const rank = (type: string) => {
  const i = DISK_PREFERENCE.indexOf(type);
  return i === -1 ? DISK_PREFERENCE.length : i;
};

function bestDiskStorage(list: DiscoveredStorage[]): string | null {
  const usable = list.filter((s) => s.usableForDisks);
  usable.sort((a, b) => rank(a.type) - rank(b.type) || b.availGb - a.availGb);
  return usable[0]?.storage ?? null;
}

function describeBridge(n: NetworkIface): DiscoveredBridge {
  return {
    name: n.iface,
    cidr: n.cidr ?? null,
    gateway: n.gateway ?? null,
    ports: n.bridge_ports || null,
  };
}

/** Droits requis, par chemin. Le pool (ou `/vms`) porte les privilèges VM. */
export function requiredPrivileges(target: {
  node: string;
  vmStorage: string;
  importStorage: string;
  bridge: string;
  pool: string | null;
}): { path: string; privileges: string[] }[] {
  return [
    {
      path: target.pool ? `/pool/${target.pool}` : "/vms",
      privileges: [...VM_PRIVILEGES],
    },
    {
      path: `/storage/${target.vmStorage}`,
      privileges: ["Datastore.AllocateSpace", "Datastore.Audit"],
    },
    {
      path: `/storage/${target.importStorage}`,
      privileges: ["Datastore.AllocateTemplate", "Datastore.Audit"],
    },
    {
      path: `/nodes/${target.node}`,
      privileges: ["Sys.Audit", "Sys.AccessNetwork"],
    },
    {
      path: `/sdn/zones/localnetwork/${target.bridge}`,
      privileges: ["SDN.Use"],
    },
  ];
}

export async function discoverServer(
  client: ProxmoxClient,
  opts: DiscoverOptions = {},
): Promise<Discovery> {
  const problems: DiscoveryProblem[] = [];

  // 1. Version (premier appel authentifié : un jeton refusé s'arrête ici avec 401).
  const v = await client.version();
  const versionOk = versionAtLeast(v.version);
  if (!versionOk)
    problems.push({
      id: "version",
      severity: "blocking",
      message: `Proxmox VE ${v.version} est trop ancien : la version ${MIN_PVE_LABEL} ou plus récente est requise.`,
      action: `Mettre Proxmox VE à jour vers ${MIN_PVE_LABEL} ou plus (guide, § Prérequis).`,
    });

  // 2. Nœud.
  const nodeList = await client.nodes();
  const nodes = nodeList.map((n) => n.node);
  let node: string | null = null;
  if (opts.node) {
    if (nodes.includes(opts.node)) node = opts.node;
    else
      problems.push({
        id: "node",
        severity: "blocking",
        message: `Le nœud « ${opts.node} » n'existe pas sur ce serveur (nœuds : ${nodes.join(", ") || "aucun"}).`,
        action: "Choisir un des nœuds listés.",
      });
  } else {
    node =
      nodeList.find((n) => n.status === "online" || n.status === undefined)
        ?.node ??
      nodes[0] ??
      null;
    if (!node)
      problems.push({
        id: "node",
        severity: "blocking",
        message: "Aucun nœud n'est visible avec ce jeton.",
        action:
          "Vérifier les droits du jeton sur /nodes/<nœud> (Sys.Audit) : guide, § Droits.",
      });
  }

  const empty = {
    version: v.version,
    versionOk,
    nodes,
    node,
    capacity: { vcpu: 0, ramMb: 0, diskGb: 0 },
    storages: [] as DiscoveredStorage[],
    vmStorage: null,
    importStorage: null,
    importCandidate: null,
    bridges: [] as DiscoveredBridge[],
    bridge: null,
    network: { prefix: null, gateway: null, dns: [] as string[] },
    pool: opts.pool ?? null,
    privileges: { ok: false, missing: [] as MissingPrivilege[] },
    existingTemplates: [] as { vmid: number; name: string }[],
    problems,
  };
  if (!node) return empty;

  // 3. Capacité du nœud.
  const status = await client.nodeStatus(node);
  const vcpu = status.cpuinfo?.cpus ?? 0;
  const ramMb = Math.floor(((status.memory?.total ?? 0) / MIB) * 0.85);

  // 4. Stockages.
  const storages = (await client.storages(node)).map(describeStorage);
  const vmStorage =
    opts.vmStorage && storages.some((s) => s.storage === opts.vmStorage)
      ? opts.vmStorage
      : bestDiskStorage(storages);
  if (!vmStorage || (opts.vmStorage && vmStorage !== opts.vmStorage))
    problems.push({
      id: "vm-storage",
      severity: "blocking",
      message: opts.vmStorage
        ? `Le stockage « ${opts.vmStorage} » n'existe pas ou n'est pas visible avec ce jeton.`
        : "Aucun stockage actif n'accepte les disques de VM (contenu « Disk image »).",
      action:
        "Choisir un stockage listé, ou donner au jeton les droits Datastore.Audit et Datastore.AllocateSpace sur ce stockage (guide, § Droits).",
    });
  const importPick =
    (opts.importStorage &&
      storages.find(
        (s) => s.storage === opts.importStorage && s.usableForImport,
      )?.storage) ||
    storages.find((s) => s.usableForImport)?.storage ||
    null;
  const importCandidate = importPick
    ? null
    : (storages.find((s) => s.canEnableImport && s.storage === "local")
        ?.storage ??
      storages.find((s) => s.canEnableImport)?.storage ??
      null);
  if (!importPick)
    problems.push({
      id: "import-storage",
      severity: "blocking",
      message:
        "Aucun stockage n'a le type de contenu « Import », nécessaire pour importer l'image cloud officielle dans le gabarit.",
      action: importCandidate
        ? `Dans l'interface de Proxmox : Centre de données ▸ Stockage ▸ ${importCandidate} ▸ Modifier ▸ Contenu : ajouter « Import » (ou en console : pvesm set ${importCandidate} --content <contenu actuel>,import). Puis relancer « Connecter ». Guide, § Stockage.`
        : "Aucun stockage de type répertoire n'est disponible : en créer un (Centre de données ▸ Stockage ▸ Ajouter ▸ Répertoire) avec le contenu « Import ». Guide, § Stockage.",
    });
  const diskStorage = storages.find((s) => s.storage === vmStorage);
  const diskGb = Math.floor((diskStorage?.availGb ?? 0) * 0.9);

  // 5. Réseau.
  const bridges = (await client.networks(node, "any_bridge")).map(
    describeBridge,
  );
  const wanted = opts.bridge
    ? bridges.find((b) => b.name === opts.bridge)
    : (bridges.find((b) => b.name === "vmbr0" && b.cidr) ??
      bridges.find((b) => b.cidr) ??
      bridges[0]);
  const bridge = wanted?.name ?? null;
  if (!bridge)
    problems.push({
      id: "bridge",
      severity: "blocking",
      message: opts.bridge
        ? `Le pont « ${opts.bridge} » n'existe pas sur le nœud.`
        : "Le nœud n'a aucun pont réseau (vmbr0…) pour brancher les VM.",
      action:
        "Créer un pont Linux (Nœud ▸ Système ▸ Réseau ▸ Créer ▸ Linux Bridge) relié à la carte réseau du serveur. Guide, § Réseau.",
    });
  const prefixText = wanted?.cidr?.split("/")[1];
  const dnsInfo = await client.nodeDns(node).catch(() => ({}));
  const dns = [
    (dnsInfo as { dns1?: string }).dns1,
    (dnsInfo as { dns2?: string }).dns2,
    (dnsInfo as { dns3?: string }).dns3,
  ].filter((x): x is string => Boolean(x));

  // 6. Pool : si le jeton n'a pas de droit VM sur /vms mais en a sur /pool/<nom>, c'est ce pool.
  let pool: string | null = opts.pool === undefined ? null : opts.pool;
  if (opts.pool === undefined) {
    const tree = await client.permissions().catch(() => ({}));
    const onVms = await client.permissions("/vms").catch(() => ({}));
    if (
      !(onVms as Record<string, Record<string, number>>)["/vms"]?.[
        "VM.Allocate"
      ]
    ) {
      const found = Object.entries(
        tree as Record<string, Record<string, number>>,
      ).find(
        ([path, privs]) => path.startsWith("/pool/") && privs["VM.Allocate"],
      );
      if (found) pool = found[0].slice("/pool/".length).split("/")[0] ?? null;
    }
  }

  // 7. Droits du jeton, chemin par chemin.
  const missing: MissingPrivilege[] = [];
  if (vmStorage && importPick && bridge) {
    for (const need of requiredPrivileges({
      node,
      vmStorage,
      importStorage: importPick,
      bridge,
      pool,
    })) {
      const have =
        (
          await client
            .permissions(need.path)
            .catch(() => ({}) as Record<string, Record<string, number>>)
        )[need.path] ?? {};
      for (const privilege of need.privileges)
        if (!have[privilege]) missing.push({ path: need.path, privilege });
    }
    if (missing.length > 0)
      problems.push({
        id: "privileges",
        severity: "blocking",
        message: `Le jeton n'a pas tous les droits nécessaires (${missing.length} manquant(s)) : ${missing
          .slice(0, 6)
          .map((m) => `${m.privilege} sur ${m.path}`)
          .join(" ; ")}${missing.length > 6 ? " ; …" : ""}.`,
        action: `Donner au compte du jeton le rôle ${PROVISION_ROLE} sur ces chemins (commandes pveum du guide, § Droits), puis relancer « Connecter ».`,
      });
  }

  const existing = await client.listVms(node).catch(() => []);
  return {
    version: v.version,
    versionOk,
    nodes,
    node,
    capacity: { vcpu, ramMb, diskGb },
    storages,
    vmStorage: vmStorage ?? null,
    importStorage: importPick,
    importCandidate,
    bridges,
    bridge,
    network: {
      prefix: prefixText ? Number(prefixText) : null,
      gateway: wanted?.gateway ?? null,
      dns,
    },
    pool,
    privileges: {
      ok: missing.length === 0 && Boolean(vmStorage && importPick && bridge),
      missing,
    },
    existingTemplates: existing
      .filter((vm) => Number(vm.template) === 1)
      .map((vm) => ({ vmid: vm.vmid, name: vm.name ?? "" })),
    problems,
  };
}

/** Cause lisible et action à faire pour une erreur de Proxmox. Jamais de jeton ni de corps de réponse. */
export function explainProxmoxError(error: unknown): {
  cause: string;
  action: string;
} {
  if (!(error instanceof ProxmoxError))
    return {
      cause: "Erreur inattendue pendant l'échange avec Proxmox.",
      action:
        "Réessayer ; si cela persiste, consulter le journal du serveur de l'application.",
    };
  switch (error.code) {
    case "unauthorized":
      return {
        cause:
          "Proxmox a refusé le jeton (identifiant ou secret incorrect, jeton expiré ou supprimé).",
        action:
          "Recréer le jeton (guide, § Jeton API) et le coller de nouveau : format utilisateur@realm!nom=secret.",
      };
    case "forbidden": {
      const m = /Permission check failed \(([^)]*)\)/.exec(error.message);
      return {
        cause: `Le jeton n'a pas un droit nécessaire${m ? ` (${m[1]})` : ""}.`,
        action: `Donner ce droit via le rôle ${PROVISION_ROLE} (guide, § Droits).`,
      };
    }
    case "host_not_allowed":
      return {
        cause: `Le jeton n'est pas envoyé : ${error.message.replace(/^jeton non envoyé : /, "")}.`,
        action:
          "Faire déclarer cet hôte par l'opérateur du serveur (liste des hôtes autorisés pour la clé d'un serveur Proxmox), puis réessayer.",
      };
    case "tls":
      return {
        cause:
          "Le certificat présenté par le serveur ne correspond pas à l'empreinte confirmée, ou n'est pas reconnu.",
        action:
          "Si le certificat a été renouvelé, relancer « Connecter » pour confirmer la nouvelle empreinte ; sinon, vérifier qu'on parle bien au bon serveur.",
      };
    case "network":
      return {
        cause: "Le serveur Proxmox n'est pas joignable depuis l'application.",
        action:
          "Vérifier l'adresse, que le port 8006 est ouvert depuis le worker (pare-feu) et que le serveur est allumé (guide, § Réseau).",
      };
    case "timeout":
      return {
        cause: "Le serveur Proxmox ne répond pas dans le délai prévu.",
        action: "Vérifier la charge et le réseau du serveur, puis réessayer.",
      };
    case "not_found":
      return {
        cause: "Un élément attendu n'existe pas sur Proxmox.",
        action: "Relancer « Connecter » pour relire l'état du serveur.",
      };
    case "task_failed":
    case "task_timeout":
      return {
        cause: `Une opération de Proxmox a échoué : ${error.message.replace(/^tâche Proxmox en échec \([^)]*\) : /, "")}`,
        action:
          "Consulter la tâche dans Proxmox (Nœud ▸ Historique des tâches), corriger la cause, puis relancer : l'opération reprend où elle s'est arrêtée.",
      };
    default:
      return {
        cause: "Proxmox a répondu par une erreur.",
        action:
          "Consulter les journaux de Proxmox, puis relancer « Connecter ».",
      };
  }
}
