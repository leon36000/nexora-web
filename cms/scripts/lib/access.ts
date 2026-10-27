// Rôles, politiques et permissions de Nexora (S1–S2). Déclaratif ; appliqué par scripts/apply.ts.
// Principe : les collections de contenu ne sont écrites que par la publication (promotion d'une version approuvée)
// ou par l'administrateur. Éditeurs et agents produisent des versions (brouillons) et des approbations.

import { BLOCK_TYPES, PAGE_TREE, SITE_COLLECTIONS } from "./schema";

export type Action = "create" | "read" | "update" | "delete";
export type Perm = {
  collection: string;
  action: Action;
  fields?: string[] | null;
  permissions?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  presets?: Record<string, unknown> | null;
  /**
   * Sans licence, Directus 12 refuse toute règle personnalisée (liste de champs, filtre d'éléments, validation,
   * valeurs prédéfinies : `custom_permission_rules_enabled`). Quand la règle ne peut pas être appliquée :
   * - 'strip' (défaut) : on accorde la permission sans règle (la garde de publication et les hooks reprennent le contrôle) ;
   * - 'drop' : on n'accorde pas la permission du tout (une permission sans sa règle serait trop large).
   */
  degrade?: "strip" | "drop";
};
export type PolicyDef = {
  name: string;
  icon: string;
  description: string;
  app_access: boolean;
  admin_access?: boolean;
  permissions: Perm[];
  /** Rôle créé et relié à la politique (absent pour la politique publique, déjà reliée au rôle nul). */
  role?: { name: string; icon: string; description: string };
  /**
   * Politique de personnes qui ouvrent une session avec courriel et mot de passe (Éditeur, Relecteur) : la 2FA leur est
   * exigée (`enforce_tfa`). Jamais pour un compte de service à jeton statique ni pour un agent (aucune session).
   */
  human?: boolean;
  /** Sans règles personnalisées (pas de licence), aucune permission n'est accordée (rôle public). */
  noRulesNoAccess?: boolean;
  /** Compte de service avec jeton statique (variable d'environnement). */
  serviceUser?: {
    email: string;
    first_name: string;
    last_name: string;
    tokenEnv: string;
  };
};

export const hasRules = (p: Perm) =>
  !!(p.fields && !(p.fields.length === 1 && p.fields[0] === "*")) ||
  !!(p.permissions && Object.keys(p.permissions).length) ||
  !!(p.validation && Object.keys(p.validation).length) ||
  !!(p.presets && Object.keys(p.presets).length);

/** Version des permissions applicable sans règles personnalisées. */
export function withoutRules(perms: Perm[]): Perm[] {
  const out: Perm[] = [];
  for (const p of perms) {
    if (!hasRules(p)) {
      out.push(p);
      continue;
    }
    if (p.degrade === "drop") continue;
    out.push({ collection: p.collection, action: p.action, fields: ["*"] });
  }
  return out;
}

/**
 * Réglage `CMS_ENFORCE_TFA` : la 2FA des personnes est exigée par défaut ; `0`, `false`, `non` ou `off` la désactive
 * (développement). Toute autre valeur, ou l'absence de valeur, l'active.
 */
export function tfaEnabled(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return !["0", "false", "non", "no", "off"].includes(v);
}

/** Corps envoyé à Directus pour une politique (comparé avant écriture par apply.ts). */
export function policyBody(p: PolicyDef, enforceTfa: boolean) {
  return {
    name: p.name,
    icon: p.icon,
    description: p.description,
    app_access: p.app_access,
    admin_access: !!p.admin_access,
    enforce_tfa: !!p.human && enforceTfa,
    ip_access: null,
  };
}

/** La politique d'administration livrée par Directus (renommée) : ce sont des personnes, la 2FA suit le réglage. */
export function adminPolicyPatch(enforceTfa: boolean) {
  return { name: "Administrateur", enforce_tfa: enforceTfa };
}

export const PUBLIC_POLICY_NAME = "$t:public_label";
export const ADMIN_POLICY_NAME = "Administrator";

const PUBLISHED = { status: { _eq: "published" } };
const BLOCK_TRANSLATIONS = BLOCK_TYPES.map((b) => `${b}_translations`);

const ALL = ["*"];
const FILE_FIELDS = [
  "id",
  "title",
  "description",
  "type",
  "width",
  "height",
  "filename_download",
  "filesize",
  "focal_point_x",
  "focal_point_y",
  "modified_on",
  "folder",
];
const USER_FIELDS = ["id", "first_name", "last_name", "avatar", "role"];
const APPROVAL_CREATE_FIELDS = [
  // S8 : un agent ne peut pas relire l'approbation qu'il crée (Directus répond alors sans corps) ; il fournit donc
  // lui-même l'identifiant (UUID) pour garder la référence.
  "id",
  "status",
  "kind",
  "collection",
  "item",
  "version_id",
  "version_key",
  "summary",
  "diff",
];

const read = (collection: string, extra: Partial<Perm> = {}): Perm => ({
  collection,
  action: "read",
  fields: ALL,
  ...extra,
});

/** Lecture limitée au contenu publié (rôle public et jeton « lecteur site »). */
export function publishedReadPerms(): Perm[] {
  return [
    read("pages", {
      permissions: PUBLISHED,
      fields: [
        "id",
        "status",
        "noindex",
        "seo_image",
        "date_created",
        "date_updated",
        "blocks",
        "translations",
      ],
    }),
    read("pages_translations", {
      permissions: { pages_id: PUBLISHED },
      fields: [
        "id",
        "pages_id",
        "languages_code",
        "slug",
        "title",
        "seo_title",
        "seo_description",
        "canonical",
      ],
    }),
    read("pages_blocks", {
      permissions: { pages_id: PUBLISHED },
      fields: ["id", "pages_id", "collection", "item", "sort"],
    }),
    // Limite connue : Directus ne sait pas filtrer un bloc par la page qui le référence (M2A). Le contenu de blocs
    // n'entre dans la table principale que par promotion approuvée ; les brouillons vivent dans directus_versions.
    ...BLOCK_TYPES.map((b) => read(b)),
    ...BLOCK_TRANSLATIONS.map((b) => read(b)),
    read("subscription_plans", {
      permissions: PUBLISHED,
      fields: [
        "id",
        "code",
        "kind",
        "status",
        "interval",
        "family",
        "price_cents",
        "included_credits_cents",
        "trial_days",
        "trial_card",
        "stripe_product_id",
        "stripe_price_id",
        "sort",
        "translations",
      ],
    }),
    read("subscription_plans_translations", {
      permissions: { subscription_plans_id: PUBLISHED },
    }),
    read("navigation", { permissions: PUBLISHED }),
    read("navigation_translations", {
      permissions: { navigation_id: PUBLISHED },
    }),
    read("site_settings"),
    read("site_settings_translations"),
    read("languages"),
    read("directus_files", { fields: FILE_FIELDS }),
  ];
}

/** Lecture complète du contenu principal (éditeurs, relecteurs, agents de contenu). */
export function contentReadPerms(): Perm[] {
  return [
    ...PAGE_TREE,
    ...SITE_COLLECTIONS,
    "subscription_plans",
    "subscription_plans_translations",
  ].map((c) => read(c));
}

/** Écriture du contenu publié : réservée à la promotion de versions et à l'administrateur (la garde de publication contrôle). */
export function pageTreeWritePerms(): Perm[] {
  const out: Perm[] = [];
  for (const c of PAGE_TREE)
    for (const action of ["create", "update", "delete"] as const)
      out.push({ collection: c, action, fields: ALL });
  return out;
}

const versionsFullPerms = (): Perm[] => [
  read("directus_versions"),
  { collection: "directus_versions", action: "create", fields: ALL },
  { collection: "directus_versions", action: "update", fields: ALL },
  { collection: "directus_versions", action: "delete", fields: ALL },
  read("directus_revisions"),
];

const filesPerms = (): Perm[] => [
  read("directus_files", { fields: ALL }),
  { collection: "directus_files", action: "create", fields: ALL },
  {
    collection: "directus_files",
    action: "update",
    fields: ALL,
    permissions: { uploaded_by: { _eq: "$CURRENT_USER" } },
    // Sans licence le filtre « uploaded_by » est refusé : la permission sans filtre laisserait remplacer le contenu de
    // N'IMPORTE QUEL fichier (image publiée servie par /api/media) hors de la garde de publication. On la retire.
    degrade: "drop",
  },
  read("directus_folders"),
];

const proposeApproval = (): Perm => ({
  collection: "approvals",
  action: "create",
  fields: APPROVAL_CREATE_FIELDS,
  validation: { status: { _eq: "en_attente" } },
  presets: { status: "en_attente" },
});

const ownApprovals = { proposed_by: { _eq: "$CURRENT_USER" } };

export const AGENTS = [
  {
    key: "redacteur",
    name: "Agent Rédacteur",
    mission: "Brouillons de pages et d’articles",
    content: true,
  },
  {
    key: "traducteur",
    name: "Agent Traducteur",
    mission: "Version en-CA d’un contenu fr-CA approuvé",
    content: true,
  },
  {
    key: "seo",
    name: "Agent SEO on-page",
    mission: "Titre, description, slug, maillage",
    content: true,
  },
  {
    key: "audit",
    name: "Agent Audit technique",
    mission: "Audits Lighthouse, liens, accessibilité",
    content: false,
  },
  {
    key: "indexation",
    name: "Agent Indexation",
    mission: "Sitemap, IndexNow, Bing",
    content: false,
  },
  {
    key: "veille",
    name: "Agent Veille SEO",
    mission: "Mots-clés, concurrents, briefs proposés",
    content: false,
  },
  {
    key: "diffusion",
    name: "Agent Diffusion",
    mission: "Brouillons de publications sociales",
    content: false,
  },
  {
    key: "sante",
    name: "Agent Santé des modèles",
    mission: "Disponibilité des fournisseurs et modèles",
    content: false,
  },
] as const;

/** Un agent : API seulement, brouillons seulement, aucune suppression, ni claims ni approbations des autres. */
function agentPolicy(a: (typeof AGENTS)[number]): PolicyDef {
  const perms: Perm[] = [];
  if (a.content) {
    perms.push(
      ...contentReadPerms(),
      read("directus_files", { fields: FILE_FIELDS }),
    );
    const mine = { user_created: { _eq: "$CURRENT_USER" } };
    perms.push(
      { collection: "directus_versions", action: "create", fields: ALL },
      read("directus_versions", { permissions: mine }),
      {
        collection: "directus_versions",
        action: "update",
        fields: ALL,
        permissions: mine,
      },
    );
  } else {
    perms.push(...publishedReadPerms());
  }
  // S8 : seul le Rédacteur crée la COQUILLE (en brouillon) d'une nouvelle page ; la garde de publication refuse toute
  // écriture qui fixerait `status = published` ou toucherait une page publiée. Les autres n'écrivent que des versions.
  if (a.key === "redacteur")
    for (const c of ["pages", "pages_translations"])
      perms.push({ collection: c, action: "create", fields: ALL });
  perms.push(
    proposeApproval(),
    read("approvals", { permissions: ownApprovals, degrade: "drop" }),
  );
  return {
    name: a.name,
    icon: "smart_toy",
    description: `${a.mission}. API seulement : brouillons (versions) et propositions d’approbation, aucune suppression, aucun accès au registre des affirmations ni aux approbations des autres.`,
    app_access: false,
    permissions: perms,
    role: { name: a.name, icon: "smart_toy", description: a.mission },
  };
}

export function buildAccess(): PolicyDef[] {
  const editor: PolicyDef = {
    name: "Éditeur",
    icon: "edit",
    description:
      "Rédige des brouillons (versions) et propose des approbations. Ne publie pas.",
    app_access: true,
    human: true,
    permissions: [
      ...contentReadPerms(),
      read("claims"),
      read("approvals"),
      proposeApproval(),
      ...versionsFullPerms(),
      ...filesPerms(),
      read("directus_users", { fields: USER_FIELDS }),
    ],
    role: {
      name: "Éditeur",
      icon: "edit",
      description: "Brouillons seulement",
    },
  };

  const reviewer: PolicyDef = {
    name: "Relecteur",
    icon: "rate_review",
    description:
      "Relit, approuve et publie une version approuvée (la garde de publication contrôle le hash exact).",
    app_access: true,
    human: true,
    permissions: [
      ...contentReadPerms(),
      ...pageTreeWritePerms(),
      read("claims"),
      {
        collection: "claims",
        action: "update",
        fields: ["approval_status", "approved_by", "approved_at"],
        degrade: "drop",
      },
      read("approvals"),
      proposeApproval(),
      {
        collection: "approvals",
        action: "update",
        fields: ["status", "comment", "reviewer", "publish_at"],
        permissions: { applied_at: { _null: true } },
        validation: { status: { _in: ["approuvée", "refusée", "à_corriger"] } },
        presets: { reviewer: "$CURRENT_USER" },
      },
      ...versionsFullPerms(),
      ...filesPerms(),
      read("directus_users", { fields: USER_FIELDS }),
    ],
    role: {
      name: "Relecteur",
      icon: "rate_review",
      description: "Approuve et publie",
    },
  };

  const publisher: PolicyDef = {
    name: "Publication",
    icon: "publish",
    description:
      "Compte de service : promeut une version approuvée, rien d’autre. Jeton statique DIRECTUS_PUBLISHER_TOKEN.",
    app_access: false,
    permissions: [
      ...contentReadPerms(),
      ...pageTreeWritePerms(),
      read("directus_versions"),
      read("approvals", {
        fields: [
          "id",
          "collection",
          "item",
          "version_id",
          "version_key",
          "version_hash",
          "status",
          "applied_at",
          "publish_at",
        ],
      }),
    ],
    role: {
      name: "Publication",
      icon: "publish",
      description: "Compte de service de publication",
    },
    serviceUser: {
      email: "publication@nexora.dev",
      first_name: "Compte",
      last_name: "Publication",
      tokenEnv: "DIRECTUS_PUBLISHER_TOKEN",
    },
  };

  const reader: PolicyDef = {
    name: "Lecteur site",
    icon: "visibility",
    description:
      "Compte de service du site public : lecture du contenu publié seulement (comme le rôle public). Jeton statique DIRECTUS_READER_TOKEN.",
    app_access: false,
    permissions: publishedReadPerms(),
    role: {
      name: "Lecteur site",
      icon: "visibility",
      description: "Lecture du contenu publié",
    },
    serviceUser: {
      email: "site-lecteur@nexora.dev",
      first_name: "Lecteur",
      last_name: "site",
      tokenEnv: "DIRECTUS_READER_TOKEN",
    },
  };

  const publicPolicy: PolicyDef = {
    name: PUBLIC_POLICY_NAME,
    icon: "public",
    description: "Lecture des seuls éléments publiés.",
    app_access: false,
    permissions: publishedReadPerms(),
    noRulesNoAccess: true,
  };

  return [
    editor,
    reviewer,
    publisher,
    reader,
    publicPolicy,
    ...AGENTS.map(agentPolicy),
  ];
}

/** Rôle administrateur existant : on le renomme en français. */
export const ADMIN_ROLE = { from: "Administrator", to: "Administrateur" };
