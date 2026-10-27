import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./schema-auth.ts";
import { REGIONS, type Region } from "./schema-gateway.ts";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const inList = (values: readonly string[]) =>
  sql.raw(values.map((v) => `'${v}'`).join(", "));

/**
 * VPS (S6, D8/D14) : catalogue (plans, applications), infrastructure (serveurs Proxmox, gabarits),
 * commandes et instances. Ces tables portent de l'infrastructure et des identifiants clients : elles
 * vivent dans la base `app`, jamais dans Directus (D4). L'administration passe par
 * `/api/admin/vps/*` (module Directus « VPS »). Les montants sont des cents CAD entiers (comme les
 * plans d'abonnement Stripe).
 */

/** Statut d'un élément de catalogue (même flux que les modèles de la passerelle). */
export const VPS_ITEM_STATUSES = [
  "draft",
  "approved",
  "published",
  "retired",
] as const;
export type VpsItemStatus = (typeof VPS_ITEM_STATUSES)[number];

export const VPS_TERMS = ["month", "year"] as const;
export type VpsTerm = (typeof VPS_TERMS)[number];

/** Plan de VPS (taille). Prix avant taxes, en cents CAD. */
export const vpsPlans = pgTable(
  "vps_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    descriptionFr: text("description_fr").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    vcpu: integer("vcpu").notNull(),
    ramMb: integer("ram_mb").notNull(),
    diskGb: integer("disk_gb").notNull(),
    /** Bande passante mensuelle incluse, en Go. */
    bandwidthGb: integer("bandwidth_gb").notNull(),
    region: text("region").$type<Region>().notNull().default("quebec"),
    /** Prix mensuel et annuel avant taxes (cents CAD) ; null = durée non offerte. */
    priceMonthlyCents: integer("price_monthly_cents"),
    priceYearlyCents: integer("price_yearly_cents"),
    /** Mise en avant (« le plus choisi ») : décision commerciale du fondateur, jamais un chiffre. */
    highlighted: boolean("highlighted").notNull().default(false),
    stripeProductId: text("stripe_product_id"),
    stripePriceMonthlyId: text("stripe_price_monthly_id"),
    stripePriceYearlyId: text("stripe_price_yearly_id"),
    /** Code du gabarit Proxmox (os_templates.code) cloné pour ce plan. */
    templateCode: text("template_code").notNull(),
    sort: integer("sort").notNull().default(100),
    /** Plan de développement : marqué « essai », jamais publiable en production (garde). */
    isDevSample: boolean("is_dev_sample").notNull().default(false),
    status: text("status").$type<VpsItemStatus>().notNull().default("draft"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vps_plans_code_unique").on(t.code),
    check(
      "vps_plans_status_check",
      sql`${t.status} IN (${inList(VPS_ITEM_STATUSES)})`,
    ),
    check("vps_plans_region_check", sql`${t.region} IN (${inList(REGIONS)})`),
    check(
      "vps_plans_size_pos",
      sql`${t.vcpu} > 0 AND ${t.ramMb} > 0 AND ${t.diskGb} > 0 AND ${t.bandwidthGb} >= 0`,
    ),
    // Jamais de prix nul ou négatif, publié ou non : « Sur demande » est l'absence de prix.
    check(
      "vps_plans_price_pos",
      sql`(${t.priceMonthlyCents} IS NULL OR ${t.priceMonthlyCents} > 0) AND (${t.priceYearlyCents} IS NULL OR ${t.priceYearlyCents} > 0)`,
    ),
  ],
);

export const VPS_APP_KINDS = ["installable", "guide"] as const;
export type VpsAppKind = (typeof VPS_APP_KINDS)[number];

export interface VpsAppPort {
  port: number;
  proto: "tcp" | "udp";
  /** `tunnel` : lié à 127.0.0.1, accessible par tunnel SSH ; `public` : ouvert au pare-feu. */
  exposure: "tunnel" | "public";
  labelFr: string;
  labelEn: string;
}

/**
 * Application installable (ou fiche « guide d'installation par le client »). Le script
 * d'installation est versionné : la somme SHA-256 est contrainte en base (elle doit correspondre au
 * texte) et vérifiée de nouveau par le worker avant exécution.
 */
export const vpsApps = pgTable(
  "vps_apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identifiant d'URL : /vps/<code>. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<VpsAppKind>().notNull().default("installable"),
    taglineFr: text("tagline_fr").notNull().default(""),
    taglineEn: text("tagline_en").notNull().default(""),
    descriptionFr: text("description_fr").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    /** Version épinglée de l'application (tag de publication amont). */
    version: text("version").notNull(),
    upstreamUrl: text("upstream_url").notNull(),
    /** Identifiant SPDX vérifié sur le dépôt officiel (ex. MIT, Apache-2.0). */
    license: text("license").notNull(),
    licenseUrl: text("license_url").notNull(),
    licenseWarningFr: text("license_warning_fr").notNull().default(""),
    licenseWarningEn: text("license_warning_en").notNull().default(""),
    /** Guide d'installation par le client (kind = guide), Markdown simple. */
    guideFr: text("guide_fr").notNull().default(""),
    guideEn: text("guide_en").notNull().default(""),
    installScriptVersion: integer("install_script_version")
      .notNull()
      .default(1),
    installScript: text("install_script"),
    installScriptSha256: text("install_script_sha256"),
    ports: jsonb("ports").$type<VpsAppPort[]>().notNull().default([]),
    /** RAM minimale recommandée (Mo) : le configurateur écarte les plans plus petits. */
    minRamMb: integer("min_ram_mb").notNull().default(1024),
    sort: integer("sort").notNull().default(100),
    status: text("status").$type<VpsItemStatus>().notNull().default("draft"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vps_apps_code_unique").on(t.code),
    check(
      "vps_apps_status_check",
      sql`${t.status} IN (${inList(VPS_ITEM_STATUSES)})`,
    ),
    check("vps_apps_kind_check", sql`${t.kind} IN (${inList(VPS_APP_KINDS)})`),
    // Une application installable porte un script ET sa somme exacte ; un guide n'en porte pas.
    check(
      "vps_apps_script_check",
      sql`(
        (${t.kind} = 'installable' AND ${t.installScript} IS NOT NULL
          AND ${t.installScriptSha256} = encode(sha256(convert_to(${t.installScript}, 'UTF8')), 'hex'))
        OR (${t.kind} = 'guide' AND ${t.installScript} IS NULL AND ${t.installScriptSha256} IS NULL)
      )`,
    ),
  ],
);

export const PROXMOX_SERVER_STATES = [
  "draft",
  "ready",
  "maintenance",
  "offline",
] as const;
export type ProxmoxServerState = (typeof PROXMOX_SERVER_STATES)[number];
export const TLS_MODES = ["verify", "pinned"] as const;
export type TlsMode = (typeof TLS_MODES)[number];

export interface ProxmoxCapacity {
  vcpu: number;
  ramMb: number;
  diskGb: number;
}
export interface IpPool {
  /** Plages d'adresses IPv4 attribuables (bornes incluses). */
  ranges: { from: string; to: string }[];
  prefix: number;
  gateway: string;
  dns: string[];
  bridge: string;
}

/** Serveur Proxmox VE branché depuis l'administration. Le jeton n'est qu'une RÉFÉRENCE du coffre. */
export const proxmoxServers = pgTable(
  "proxmox_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(8006),
    /** Nom du nœud Proxmox. */
    node: text("node").notNull(),
    region: text("region").$type<Region>().notNull().default("quebec"),
    capacity: jsonb("capacity").$type<ProxmoxCapacity>().notNull(),
    ipPool: jsonb("ip_pool").$type<IpPool>().notNull(),
    /** Référence du coffre (kind proxmox) du jeton `USER@REALM!TOKENID=UUID`. */
    tokenRef: text("token_ref"),
    tlsMode: text("tls_mode").$type<TlsMode>().notNull().default("verify"),
    /** Empreinte SHA-256 du certificat (mode pinned), hexadécimal ; informations publiques. */
    tlsFingerprint: text("tls_fingerprint"),
    storage: text("storage").notNull().default("local-lvm"),
    /** Pool Proxmox où ranger les VM (facultatif). */
    pool: text("pool"),
    vmidMin: integer("vmid_min").notNull().default(10_000),
    state: text("state").$type<ProxmoxServerState>().notNull().default("draft"),
    lastCheckedAt: ts("last_checked_at"),
    lastCheckOk: boolean("last_check_ok"),
    /** Résumé court (jamais de corps de réponse ni de secret). */
    lastCheckDetail: text("last_check_detail"),
    pveVersion: text("pve_version"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("proxmox_servers_code_unique").on(t.code),
    check(
      "proxmox_servers_state_check",
      sql`${t.state} IN (${inList(PROXMOX_SERVER_STATES)})`,
    ),
    check(
      "proxmox_servers_tls_check",
      sql`${t.tlsMode} IN (${inList(TLS_MODES)}) AND (${t.tlsMode} <> 'pinned' OR ${t.tlsFingerprint} IS NOT NULL)`,
    ),
    check(
      "proxmox_servers_region_check",
      sql`${t.region} IN (${inList(REGIONS)})`,
    ),
  ],
);

export const OS_TEMPLATE_STATES = ["draft", "ready", "retired"] as const;
export type OsTemplateState = (typeof OS_TEMPLATE_STATES)[number];

/** Gabarit cloud-init cloné pour créer une VM : un par nœud (vmid propre au serveur). */
export const osTemplates = pgTable(
  "os_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => proxmoxServers.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    os: text("os").notNull(),
    osVersion: text("os_version").notNull(),
    /** Identifiant de la VM modèle sur ce nœud. */
    vmid: integer("vmid").notNull(),
    /** Utilisateur cloud-init de l'image (ex. debian). */
    ciUser: text("ci_user").notNull().default("debian"),
    /** SHA-256 de l'image source (traçabilité, informatif). */
    imageSha256: text("image_sha256"),
    state: text("state").$type<OsTemplateState>().notNull().default("draft"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("os_templates_server_code_unique").on(t.serverId, t.code),
    check(
      "os_templates_state_check",
      sql`${t.state} IN (${inList(OS_TEMPLATE_STATES)})`,
    ),
    check("os_templates_vmid_range", sql`${t.vmid} BETWEEN 100 AND 999999999`),
  ],
);

export const VPS_ORDER_STATUSES = [
  "awaiting_payment",
  "paid",
  "provisioning",
  "fulfilled",
  "failed",
  "canceled",
  "expired",
] as const;
export type VpsOrderStatus = (typeof VPS_ORDER_STATUSES)[number];

/** Commande de VPS. La clé d'idempotence est fournie par le formulaire : un double envoi = une commande. */
export const vpsOrders = pgTable(
  "vps_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    createdBy: text("created_by"),
    idempotencyKey: text("idempotency_key").notNull(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => vpsPlans.id, { onDelete: "restrict" }),
    planCode: text("plan_code").notNull(),
    appId: uuid("app_id")
      .notNull()
      .references(() => vpsApps.id, { onDelete: "restrict" }),
    appCode: text("app_code").notNull(),
    term: text("term").$type<VpsTerm>().notNull(),
    region: text("region").$type<Region>().notNull(),
    /** Prix par période, avant taxes, figé à la commande (cents CAD). */
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("cad"),
    /** Version de catalogue publiée (D3) utilisée : config_versions.id et court identifiant. */
    catalogVersionId: uuid("catalog_version_id").notNull(),
    catalogVersion: text("catalog_version").notNull(),
    /** Clé publique SSH du client (jamais de mot de passe). */
    sshPublicKey: text("ssh_public_key").notNull(),
    sshKeyFingerprint: text("ssh_key_fingerprint").notNull(),
    hostname: text("hostname").notNull(),
    status: text("status")
      .$type<VpsOrderStatus>()
      .notNull()
      .default("awaiting_payment"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    paidAt: ts("paid_at"),
    failureReason: text("failure_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vps_orders_idempotency_unique").on(t.idempotencyKey),
    uniqueIndex("vps_orders_subscription_unique")
      .on(t.stripeSubscriptionId)
      .where(sql`${t.stripeSubscriptionId} IS NOT NULL`),
    uniqueIndex("vps_orders_session_unique")
      .on(t.stripeCheckoutSessionId)
      .where(sql`${t.stripeCheckoutSessionId} IS NOT NULL`),
    index("vps_orders_org_idx").on(t.organizationId, t.createdAt),
    check(
      "vps_orders_status_check",
      sql`${t.status} IN (${inList(VPS_ORDER_STATUSES)})`,
    ),
    check("vps_orders_term_check", sql`${t.term} IN ('month', 'year')`),
    check("vps_orders_price_pos", sql`${t.priceCents} > 0`),
  ],
);

export const VPS_INSTANCE_STATUSES = [
  "provisioning",
  "active",
  "suspended",
  "reinstalling",
  "canceled",
  "failed",
  "deleted",
] as const;
export type VpsInstanceStatus = (typeof VPS_INSTANCE_STATUSES)[number];

/** Étapes du provisionnement et de la réinstallation (reprise à chaque étape). */
export const VPS_STEPS = [
  "placement",
  "snapshot",
  "clone",
  "configure",
  "firewall",
  "start",
  "await_agent",
  "install",
  "verify",
  "done",
] as const;
export type VpsStep = (typeof VPS_STEPS)[number];

export const VPS_POWER_STATES = ["unknown", "running", "stopped"] as const;
export type VpsPowerState = (typeof VPS_POWER_STATES)[number];

/** Un VPS livré à un client (une ligne par commande ; la réinstallation réutilise la ligne). */
export const vpsInstances = pgTable(
  "vps_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => vpsOrders.id, { onDelete: "restrict" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    /** Copie des tailles du plan à la commande (comptabilité de capacité). */
    vcpu: integer("vcpu").notNull(),
    ramMb: integer("ram_mb").notNull(),
    diskGb: integer("disk_gb").notNull(),
    planCode: text("plan_code").notNull(),
    appCode: text("app_code").notNull(),
    appVersion: text("app_version").notNull(),
    /** Version de catalogue (config_versions.id) qui a servi à la commande. */
    catalogVersionId: uuid("catalog_version_id").notNull(),
    serverId: uuid("server_id").references(() => proxmoxServers.id, {
      onDelete: "restrict",
    }),
    vmid: integer("vmid"),
    ipv4: text("ipv4"),
    /** Nom de la VM côté Proxmox (sert à détecter un clone existant à la reprise). */
    vmName: text("vm_name").notNull(),
    status: text("status")
      .$type<VpsInstanceStatus>()
      .notNull()
      .default("provisioning"),
    step: text("step").$type<VpsStep>().notNull().default("placement"),
    power: text("power").$type<VpsPowerState>().notNull().default("unknown"),
    /** Compteur des reprises : sert de clé aux tâches de continuation. */
    runSeq: integer("run_seq").notNull().default(0),
    /** Bail d'exécution : un seul worker avance une instance à la fois. */
    leaseOwner: text("lease_owner"),
    leaseUntil: ts("lease_until"),
    /** Action en cours demandée par le client (start, stop, reboot, reinstall, cancel). */
    pendingAction: text("pending_action"),
    installScriptSha256: text("install_script_sha256"),
    sshHostKeyFingerprint: text("ssh_host_key_fingerprint"),
    lastSnapshotName: text("last_snapshot_name"),
    /**
     * Réinstallation : l'ancienne VM (arrêtée, détachée du réseau, avec son instantané) est gardée
     * jusqu'à cette date (7 jours) pour qu'une erreur reste récupérable, puis supprimée.
     */
    previousVmid: integer("previous_vmid"),
    previousDeleteAfter: ts("previous_delete_after"),
    /** Raison courte, nettoyée, du dernier échec. */
    lastError: text("last_error"),
    activatedAt: ts("activated_at"),
    suspendedAt: ts("suspended_at"),
    /** Résiliation : la VM est arrêtée puis supprimée à cette date (rétention 7 jours). */
    canceledAt: ts("canceled_at"),
    retentionEndsAt: ts("retention_ends_at"),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vps_instances_order_unique").on(t.orderId),
    uniqueIndex("vps_instances_server_vmid_unique")
      .on(t.serverId, t.vmid)
      .where(sql`${t.vmid} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    uniqueIndex("vps_instances_server_ip_unique")
      .on(t.serverId, t.ipv4)
      .where(sql`${t.ipv4} IS NOT NULL AND ${t.deletedAt} IS NULL`),
    index("vps_instances_org_idx").on(t.organizationId, t.createdAt),
    index("vps_instances_status_idx").on(t.status, t.updatedAt),
    check(
      "vps_instances_status_check",
      sql`${t.status} IN (${inList(VPS_INSTANCE_STATUSES)})`,
    ),
    check("vps_instances_step_check", sql`${t.step} IN (${inList(VPS_STEPS)})`),
    check(
      "vps_instances_power_check",
      sql`${t.power} IN (${inList(VPS_POWER_STATES)})`,
    ),
  ],
);

/** Journal des événements d'un VPS : AJOUT SEULEMENT (déclencheur SQL). Aucun secret, aucune clé. */
export const vpsEvents = pgTable(
  "vps_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id"),
    orderId: uuid("order_id"),
    instanceId: uuid("instance_id"),
    /** system, customer, operator, stripe, worker. */
    actor: text("actor").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull().default(""),
    detail: jsonb("detail")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("vps_events_instance_idx").on(t.instanceId, t.createdAt),
    index("vps_events_order_idx").on(t.orderId, t.createdAt),
    index("vps_events_org_idx").on(t.organizationId, t.createdAt),
  ],
);
