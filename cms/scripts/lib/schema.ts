// Schéma Directus de Nexora AI (S1–S2) : collections, champs et relations, déclarés en TypeScript.
// Appliqué par scripts/apply.ts (idempotent). 22 collections utilisateur au total (limite du palier Core : 25).

export type FieldDef = {
  field: string;
  type: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
};
export type CollectionDef = {
  collection: string;
  meta: Record<string, unknown>;
  fields: FieldDef[];
};
export type RelationDef = {
  collection: string;
  field: string;
  related_collection: string | null;
  meta: Record<string, unknown>;
  schema?: Record<string, unknown> | null;
};

export const LANGS = [
  {
    code: "fr-CA",
    name: "Français (Canada)",
    direction: "ltr",
    is_default: true,
  },
  {
    code: "en-CA",
    name: "English (Canada)",
    direction: "ltr",
    is_default: false,
  },
] as const;

// ---------- assistants de déclaration ----------

type Opt = {
  label?: string;
  note?: string;
  required?: boolean;
  unique?: boolean;
  def?: unknown;
  width?: "half" | "full" | "fill";
  hidden?: boolean;
  readonly?: boolean;
  maxLength?: number;
  options?: Record<string, unknown>;
  interface?: string;
  special?: string[];
  display?: string;
  displayOptions?: Record<string, unknown>;
  sort?: number;
};

const tr = (label?: string) =>
  label ? [{ language: "fr-CA", translation: label }] : undefined;

function meta(o: Opt, defaultInterface?: string): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (o.interface ?? defaultInterface)
    m.interface = o.interface ?? defaultInterface;
  if (o.note) m.note = o.note;
  m.required = !!o.required;
  if (o.width) m.width = o.width;
  m.hidden = !!o.hidden;
  m.readonly = !!o.readonly;
  if (o.options) m.options = o.options;
  if (o.special) m.special = o.special;
  if (o.display) m.display = o.display;
  if (o.displayOptions) m.display_options = o.displayOptions;
  if (o.sort !== undefined) m.sort = o.sort;
  const t = tr(o.label);
  if (t) m.translations = t;
  return m;
}

function sch(
  o: Opt,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const s: Record<string, unknown> = { ...extra };
  if (o.unique) s.is_unique = true;
  if (o.def !== undefined) s.default_value = o.def;
  if (o.required) s.is_nullable = false;
  if (o.maxLength) s.max_length = o.maxLength;
  return s;
}

const uuidPk = (): FieldDef => ({
  field: "id",
  type: "uuid",
  meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
  schema: {
    is_primary_key: true,
    length: 36,
    has_auto_increment: false,
    is_nullable: false,
  },
});
const intPk = (): FieldDef => ({
  field: "id",
  type: "integer",
  meta: { hidden: true },
  schema: {
    is_primary_key: true,
    has_auto_increment: true,
    is_nullable: false,
  },
});

const str = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "string",
  meta: meta(o, "input"),
  schema: sch(o),
});
const txt = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "text",
  meta: meta(o, "input-multiline"),
  schema: sch(o),
});
const bool = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "boolean",
  meta: meta({ width: "half", ...o }, "boolean"),
  schema: sch({ ...o, def: o.def ?? false }),
});
const int = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "integer",
  meta: meta(o, "input"),
  schema: sch(o),
});
const ts = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "timestamp",
  meta: meta(o, "datetime"),
  schema: sch(o),
});
const dateOnly = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "date",
  meta: meta(o, "datetime"),
  schema: sch(o),
});
const json = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "json",
  meta: meta(o, "input-code"),
  schema: sch(o),
});
const select = (
  field: string,
  choices: [string, string][],
  o: Opt = {},
): FieldDef => ({
  field,
  type: "string",
  meta: meta(
    {
      display: "labels",
      displayOptions: {
        choices: choices.map(([value, text]) => ({ value, text })),
      },
      ...o,
      options: { choices: choices.map(([value, text]) => ({ value, text })) },
    },
    "select-dropdown",
  ),
  schema: sch(o),
});
const fk = (
  field: string,
  type: "uuid" | "integer" | "string",
  o: Opt = {},
): FieldDef => ({
  field,
  type,
  meta: meta({ width: "half", ...o }, "select-dropdown-m2o"),
  schema: sch(o),
});
const file = (field: string, o: Opt = {}): FieldDef => ({
  field,
  type: "uuid",
  meta: meta({ ...o, special: ["file"] }, "file-image"),
  schema: sch(o),
});
const alias = (field: string, special: string[], o: Opt = {}): FieldDef => ({
  field,
  type: "alias",
  meta: meta({ ...o, special }),
  schema: undefined,
});

const dateCreated = (): FieldDef => ({
  field: "date_created",
  type: "timestamp",
  meta: {
    special: ["date-created"],
    interface: "datetime",
    readonly: true,
    hidden: true,
    width: "half",
    display: "datetime",
  },
  schema: {},
});
const dateUpdated = (): FieldDef => ({
  field: "date_updated",
  type: "timestamp",
  meta: {
    special: ["date-updated"],
    interface: "datetime",
    readonly: true,
    hidden: true,
    width: "half",
    display: "datetime",
  },
  schema: {},
});
const userCreated = (field = "user_created"): FieldDef => ({
  field,
  type: "uuid",
  meta: {
    special: ["user-created"],
    interface: "select-dropdown-m2o",
    readonly: true,
    hidden: true,
    width: "half",
    display: "user",
  },
  schema: {},
});
const userUpdated = (): FieldDef => ({
  field: "user_updated",
  type: "uuid",
  meta: {
    special: ["user-updated"],
    interface: "select-dropdown-m2o",
    readonly: true,
    hidden: true,
    width: "half",
    display: "user",
  },
  schema: {},
});

const translationsAlias = (): FieldDef =>
  alias("translations", ["translations"], {
    label: "Traductions",
    interface: "translations",
    options: {
      languageField: "name",
      languageDirectionField: "direction",
      defaultLanguage: "fr-CA",
      userLanguage: false,
    },
    display: "translations",
    displayOptions: {
      languageField: "name",
      defaultLanguage: "fr-CA",
      userLanguage: false,
    },
  });

/** Crée la collection `<parent>_translations` et la relation vers `parent` et `languages`. */
function translationsOf(
  parent: string,
  parentLabel: string,
  fields: FieldDef[],
  rels: RelationDef[],
): CollectionDef {
  const name = `${parent}_translations`;
  rels.push(
    {
      collection: name,
      field: `${parent}_id`,
      related_collection: parent,
      meta: {
        one_field: "translations",
        sort_field: null,
        one_deselect_action: "delete",
        junction_field: "languages_code",
      },
      schema: { on_delete: "CASCADE" },
    },
    {
      collection: name,
      field: "languages_code",
      related_collection: "languages",
      meta: {
        one_field: null,
        sort_field: null,
        one_deselect_action: "nullify",
        junction_field: `${parent}_id`,
      },
      schema: { on_delete: "SET NULL" },
    },
  );
  return {
    collection: name,
    meta: {
      hidden: true,
      icon: "translate",
      note: `Traductions de « ${parentLabel} »`,
      group: GROUP_OF[parent] ?? null,
      translations: [
        {
          language: "fr-CA",
          translation: `${parentLabel} (traductions)`,
          singular: "Traduction",
          plural: "Traductions",
        },
      ],
    },
    fields: [
      intPk(),
      fk(`${parent}_id`, "uuid", { hidden: true }),
      fk("languages_code", "string", { hidden: true, maxLength: 20 }),
      ...fields,
    ],
  };
}

// ---------- dossiers (regroupements du panneau) ----------

export const GROUPS = {
  site: "nexora_site",
  pages: "nexora_pages",
  validation: "nexora_validation",
} as const;

const GROUP_OF: Record<string, string> = {
  languages: GROUPS.site,
  site_settings: GROUPS.site,
  navigation: GROUPS.site,
  pages: GROUPS.pages,
  pages_blocks: GROUPS.pages,
  block_hero: GROUPS.pages,
  block_section: GROUPS.pages,
  block_cards: GROUPS.pages,
  block_pricing: GROUPS.pages,
  block_faq: GROUPS.pages,
  block_cta: GROUPS.pages,
  claims: GROUPS.validation,
  approvals: GROUPS.validation,
};

export const folders: { collection: string; meta: Record<string, unknown> }[] =
  [
    {
      collection: GROUPS.site,
      meta: {
        icon: "public",
        note: "Réglages, navigation, langues",
        translations: [
          {
            language: "fr-CA",
            translation: "Site",
            singular: "Site",
            plural: "Site",
          },
        ],
        sort: 1,
      },
    },
    {
      collection: GROUPS.pages,
      meta: {
        icon: "web",
        note: "Pages et blocs de contenu",
        translations: [
          {
            language: "fr-CA",
            translation: "Pages et blocs",
            singular: "Pages et blocs",
            plural: "Pages et blocs",
          },
        ],
        sort: 2,
      },
    },
    {
      collection: GROUPS.validation,
      meta: {
        icon: "verified",
        note: "Registre des affirmations et file d’approbation",
        translations: [
          {
            language: "fr-CA",
            translation: "Validation",
            singular: "Validation",
            plural: "Validation",
          },
        ],
        sort: 3,
      },
    },
  ];

// ---------- collections ----------

export const BLOCK_TYPES = [
  "block_hero",
  "block_section",
  "block_cards",
  "block_pricing",
  "block_faq",
  "block_cta",
] as const;

/** Collections de contenu de page, protégées par la garde de publication. */
export const PAGE_TREE = [
  "pages",
  "pages_translations",
  "pages_blocks",
  ...BLOCK_TYPES,
  ...BLOCK_TYPES.map((b) => `${b}_translations`),
] as const;

export const SITE_COLLECTIONS = [
  "languages",
  "site_settings",
  "site_settings_translations",
  "navigation",
  "navigation_translations",
] as const;

export const STATUS_PAGES: [string, string][] = [
  ["draft", "Brouillon"],
  ["in_review", "En relecture"],
  ["published", "Publié"],
  ["archived", "Archivé"],
];

export const APPROVAL_STATES: [string, string][] = [
  ["en_attente", "En attente"],
  ["approuvée", "Approuvée"],
  ["refusée", "Refusée"],
  ["à_corriger", "À corriger"],
  ["périmée", "Périmée"],
];

const rich: Opt["options"] = {
  toolbar: [
    "bold",
    "italic",
    "link",
    "bullist",
    "numlist",
    "h2",
    "h3",
    "blockquote",
    "removeformat",
    "undo",
    "redo",
  ],
  // Texte riche contrôlé : pas d'images ni de HTML libre ; le site assainit de nouveau au rendu.
};

/** Motif de l'ancre d'un bloc (navigation ancrée des pages longues) : minuscules, chiffres, tirets, 40 au plus. */
export const ANCHOR_PATTERN = "^[a-z0-9-]{0,40}$";

/** Tons de section (S3) : sombre = fond encre forêt, clair = papier, sable = surface claire relevée. */
export const TONES: [string, string][] = [
  ["sombre", "Sombre"],
  ["clair", "Clair"],
  ["sable", "Sable"],
];
export const CARD_LAYOUTS: [string, string][] = [
  ["grille", "Grille"],
  ["liste", "Liste (rangées pleine largeur)"],
  ["etapes", "Étapes numérotées"],
  ["modules", "Modules numérotés (M1…)"],
  ["bento", "Mosaïque (tuiles de tailles variées)"],
];
export const SECTION_VISUALS: [string, string][] = [
  ["aucun", "Aucun"],
  ["perimetre-sur-place", "Périmètre : sur place"],
  ["perimetre-heberge", "Périmètre : hébergé au Québec"],
  ["flux-donnees", "Flux de données"],
  ["flux-workstudio", "Maquette : éditeur de flux WorkStudio"],
  ["catalogue-modeles", "Maquette : catalogue de modèles"],
  ["console-vps", "Maquette : console d’un VPS"],
  ["tableau-de-bord", "Maquette : tableau de bord du compte"],
  ["vision-sur-place", "Schéma : analyse vidéo sur place (Nexora Vision)"],
  ["croissance-canaux", "Schéma : canaux de croissance (Nexora Croissance)"],
  ["engagements-donnees", "Schéma : les cinq engagements sur les données"],
];
/** Statut d'une carte en disposition « modules » ; vide = aucun badge. */
export const CARD_STATUSES = ["disponible", "pilote", "prevu"] as const;
const CARD_STATUS_LABELS: Record<(typeof CARD_STATUSES)[number], string> = {
  disponible: "Disponible",
  pilote: "En pilote",
  prevu: "Prévu",
};

const tone = (def: "sombre" | "clair" | "sable", label = "Ton") =>
  select("tone", TONES, {
    label,
    def,
    width: "half",
    note: "Sombre : fond encre forêt. Clair : papier. Sable : surface claire relevée.",
  });

const anchorId = (): FieldDef => ({
  field: "anchor_id",
  type: "string",
  meta: {
    ...meta(
      {
        label: "Ancre",
        width: "half",
        note: "Facultatif : minuscules, chiffres et tirets (40 au plus). Sert aux liens internes ; une page avec au moins trois ancres affiche un sommaire.",
      },
      "input",
    ),
    validation: { _and: [{ anchor_id: { _regex: ANCHOR_PATTERN } }] },
    validation_message:
      "Minuscules, chiffres et tirets seulement (40 caractères au plus).",
  },
  schema: { max_length: 40 },
});

const listOf = (
  fields: {
    field: string;
    name: string;
    type: string;
    interface?: string;
    width?: string;
    choices?: [string, string][];
  }[],
) => ({
  template: `{{${fields[0]?.field ?? "id"}}}`,
  fields: fields.map((f) => ({
    field: f.field,
    name: f.name,
    type: f.type,
    meta: {
      interface:
        f.interface ??
        (f.choices
          ? "select-dropdown"
          : f.type === "text"
            ? "input-multiline"
            : "input"),
      width: f.width ?? "full",
      field: f.field,
      type: f.type,
      ...(f.choices
        ? {
            options: {
              choices: f.choices.map(([value, text]) => ({ value, text })),
              allowNone: true,
            },
          }
        : {}),
    },
  })),
});

export function buildSchema(): {
  collections: CollectionDef[];
  relations: RelationDef[];
} {
  const relations: RelationDef[] = [];
  const collections: CollectionDef[] = [];
  const add = (c: CollectionDef) => {
    c.meta = { group: GROUP_OF[c.collection] ?? null, ...c.meta };
    collections.push(c);
  };
  const toFiles = (collection: string, field: string) =>
    relations.push({
      collection,
      field,
      related_collection: "directus_files",
      meta: {},
      schema: { on_delete: "SET NULL" },
    });
  const toUsers = (collection: string, field: string) =>
    relations.push({
      collection,
      field,
      related_collection: "directus_users",
      meta: {},
      schema: { on_delete: "SET NULL" },
    });

  // --- languages ---
  add({
    collection: "languages",
    meta: {
      icon: "translate",
      note: "Langues du site (fr-CA par défaut, en-CA).",
      archive_app_filter: true,
      display_template: "{{name}}",
      translations: [
        {
          language: "fr-CA",
          translation: "Langues",
          singular: "Langue",
          plural: "Langues",
        },
      ],
    },
    fields: [
      {
        field: "code",
        type: "string",
        meta: meta(
          {
            label: "Code",
            required: true,
            note: "Code BCP 47, par exemple fr-CA",
            width: "half",
          },
          "input",
        ),
        schema: { is_primary_key: true, length: 20, is_nullable: false },
      },
      str("name", { label: "Nom", required: true, width: "half" }),
      select(
        "direction",
        [
          ["ltr", "Gauche à droite"],
          ["rtl", "Droite à gauche"],
        ],
        { label: "Direction", def: "ltr", width: "half" },
      ),
      bool("is_default", { label: "Langue par défaut" }),
    ],
  });

  // --- site_settings (singleton) ---
  add({
    collection: "site_settings",
    meta: {
      icon: "settings",
      singleton: true,
      note: "Réglages généraux du site (un seul enregistrement).",
      translations: [
        {
          language: "fr-CA",
          translation: "Réglages du site",
          singular: "Réglages du site",
          plural: "Réglages du site",
        },
      ],
    },
    fields: [
      uuidPk(),
      str("site_name", {
        label: "Nom du site",
        def: "Nexora AI",
        required: true,
      }),
      file("og_default_image", {
        label: "Image Open Graph par défaut",
        note: "Utilisée quand une page n’a pas sa propre image.",
      }),
      translationsAlias(),
      dateUpdated(),
    ],
  });
  toFiles("site_settings", "og_default_image");
  add(
    translationsOf(
      "site_settings",
      "Réglages du site",
      [
        str("tagline", { label: "Accroche" }),
        str("seo_title_template", {
          label: "Gabarit du titre SEO",
          note: "Ex. « %s — Nexora AI »",
          def: "%s — Nexora AI",
        }),
        txt("seo_description", { label: "Description SEO par défaut" }),
        txt("footer_note", { label: "Note de pied de page" }),
      ],
      relations,
    ),
  );

  // --- navigation ---
  add({
    collection: "navigation",
    meta: {
      icon: "menu",
      note: "Entrées de navigation (en-tête, pied de page, mentions légales).",
      display_template: "{{translations.label}}",
      sort_field: "sort",
      translations: [
        {
          language: "fr-CA",
          translation: "Navigation",
          singular: "Entrée de navigation",
          plural: "Navigation",
        },
      ],
    },
    fields: [
      uuidPk(),
      select(
        "placement",
        [
          ["header", "En-tête"],
          ["footer", "Pied de page"],
          ["legal", "Mentions légales"],
        ],
        { label: "Emplacement", def: "header", required: true, width: "half" },
      ),
      select(
        "style",
        [
          ["link", "Lien"],
          ["button", "Bouton"],
          ["utility", "Lien d’utilité (à droite, ex. Connexion)"],
        ],
        { label: "Style", def: "link", width: "half" },
      ),
      select(
        "status",
        [
          ["draft", "Brouillon"],
          ["published", "Publié"],
        ],
        { label: "Statut", def: "draft", required: true, width: "half" },
      ),
      int("sort", { label: "Ordre", hidden: true }),
      fk("parent", "uuid", {
        label: "Parent",
        note: "Pour un menu déroulant.",
      }),
      translationsAlias(),
    ],
  });
  relations.push({
    collection: "navigation",
    field: "parent",
    related_collection: "navigation",
    meta: {},
    schema: { on_delete: "SET NULL" },
  });
  add(
    translationsOf(
      "navigation",
      "Navigation",
      [
        str("label", { label: "Libellé", required: true }),
        str("href", {
          label: "Lien",
          note: "Chemin relatif propre à la langue (ex. /souverainete/ ou /en/sovereignty/). Vide pour un parent qui n’ouvre qu’un menu ou une colonne.",
        }),
        txt("description", {
          label: "Description",
          note: "Courte phrase affichée sous le libellé dans le menu Produits.",
        }),
      ],
      relations,
    ),
  );

  // --- abonnements (S4, vague 2) : plans publiés dans Directus, lus par le site, poussés vers Stripe par le module Paiements (« Publier vers Stripe » écrit les identifiants dans la fiche) ---
  add({
    collection: "subscription_plans",
    meta: {
      icon: "workspace_premium",
      note: "Plans d’abonnement (WorkStudio, API, agents). Prix hors taxes en cents CAD ; jamais affiché ni vendu sans prix valide. « Publier vers Stripe » (module Paiements) écrit les identifiants Stripe dans la fiche.",
      display_template: "{{code}}",
      sort_field: "sort",
      archive_field: "status",
      archive_value: "archived",
      unarchive_value: "draft",
      translations: [
        {
          language: "fr-CA",
          translation: "Plans d’abonnement",
          singular: "Plan d’abonnement",
          plural: "Plans d’abonnement",
        },
      ],
    },
    fields: [
      uuidPk(),
      str("code", {
        label: "Code",
        required: true,
        unique: true,
        note: "Identifiant stable (ex. workstudio-pro), minuscules et tirets.",
      }),
      select(
        "kind",
        [
          ["workstudio", "WorkStudio"],
          ["api", "API et modèles"],
          ["agents", "Agents hébergés"],
          ["other", "Autre"],
        ],
        { label: "Famille", def: "other", width: "half" },
      ),
      select("status", STATUS_PAGES, {
        label: "Statut",
        def: "draft",
        required: true,
        width: "half",
      }),
      select(
        "interval",
        [
          ["month", "Mensuel"],
          ["year", "Annuel"],
        ],
        {
          label: "Période de facturation",
          def: "month",
          required: true,
          width: "half",
        },
      ),
      str("family", {
        label: "Offre (regroupement)",
        note: "Les lignes mensuelle et annuelle d’une même offre partagent cette valeur (ex. workstudio-equipe) : la page Tarifs les affiche ensemble. Vide : le code de la ligne.",
      }),
      int("price_cents", {
        label: "Prix (cents CAD, avant taxes)",
        width: "half",
        note: "Ex. 4900 pour 49,00 $ ; pour une ligne annuelle, le total de l’année. Vide tant que le prix n’est pas décidé : une ligne publiée sans prix valide n’est jamais affichée ni vendue (jamais à 0 $). TPS et TVQ sont ajoutées par Stripe Tax.",
      }),
      int("suggested_price_cents", {
        label: "Prix suggéré (cents CAD) — non publié",
        width: "half",
        note: "Suggestion de l’étude de marché, visible ici seulement (ni le site ni le public ne la lisent). Le module Paiements propose « Adopter le prix suggéré » ; rien n’est publié sans votre décision.",
      }),
      int("trial_days", {
        label: "Essai gratuit (jours)",
        def: 0,
        width: "half",
        note: "0 : aucun essai. Appliqué au paiement ; un seul essai par organisation et par offre.",
      }),
      select(
        "trial_card",
        [
          ["default", "Selon le réglage général"],
          ["required", "Carte exigée au départ"],
          ["not_required", "Sans carte au départ"],
        ],
        {
          label: "Carte pendant l’essai",
          def: "default",
          width: "half",
          note: "Sans carte, l’abonnement est annulé à la fin de l’essai si aucune carte n’a été ajoutée.",
        },
      ),
      int("included_credits_cents", {
        label: "Crédits inclus par période (cents CAD)",
        def: 0,
        width: "half",
        note: "Accordés à chaque facture payée, valables jusqu’à la fin de la période.",
      }),
      str("stripe_product_id", {
        label: "Produit Stripe",
        width: "half",
        note: "Écrit par « Publier vers Stripe » (module Paiements) ; modifiable à la main en dépannage. Identifiant, pas un secret.",
      }),
      str("stripe_price_id", {
        label: "Prix Stripe",
        width: "half",
        note: "Écrit par « Publier vers Stripe » ; un prix Stripe est immuable : un changement de montant en crée un nouveau et archive l’ancien.",
      }),
      ts("stripe_synced_at", {
        label: "Dernière synchronisation Stripe",
        readonly: true,
      }),
      int("sort", { label: "Ordre", hidden: true }),
      translationsAlias(),
      dateCreated(),
      dateUpdated(),
    ],
  });
  add(
    translationsOf(
      "subscription_plans",
      "Plans d’abonnement",
      [
        str("name", { label: "Nom", required: true }),
        txt("description", { label: "Description" }),
        json("features", {
          label: "Points forts",
          note: "Liste de textes courts, sans chiffre ni promesse non démontrée.",
        }),
      ],
      relations,
    ),
  );

  // --- pages ---
  add({
    collection: "pages",
    meta: {
      icon: "article",
      note: "Pages du site. Le contenu se modifie par versions ; la publication exige une approbation (garde de publication).",
      versioning: true,
      display_template: "{{translations.title}}",
      archive_field: "status",
      archive_value: "archived",
      unarchive_value: "draft",
      translations: [
        {
          language: "fr-CA",
          translation: "Pages",
          singular: "Page",
          plural: "Pages",
        },
      ],
    },
    fields: [
      uuidPk(),
      select("status", STATUS_PAGES, {
        label: "Statut éditorial",
        def: "draft",
        required: true,
        width: "half",
      }),
      ts("publish_at", {
        label: "Publication prévue",
        note: "Date de publication souhaitée (portée par l’approbation).",
        width: "half",
      }),
      bool("noindex", {
        label: "Ne pas indexer (noindex)",
        note: "Ajoute robots noindex à la page.",
      }),
      file("seo_image", {
        label: "Image Open Graph",
        note: "Image de partage (1200×630 recommandé).",
      }),
      alias("blocks", ["m2a"], {
        label: "Blocs",
        interface: "list-m2a",
        options: { enableSelect: false },
      }),
      translationsAlias(),
      dateCreated(),
      dateUpdated(),
      userCreated(),
      userUpdated(),
    ],
  });
  toFiles("pages", "seo_image");
  add(
    translationsOf(
      "pages",
      "Pages",
      [
        str("slug", {
          label: "Slug",
          note: "Sans barre oblique initiale ni finale ; vide pour l’accueil. Unique par langue.",
        }),
        str("slug_key", {
          label: "Clé de slug",
          unique: true,
          readonly: true,
          hidden: true,
          note: "Calculée (langue:slug) pour garantir l’unicité par langue.",
        }),
        str("title", { label: "Titre", required: true }),
        str("seo_title", {
          label: "Titre SEO (title)",
          note: "50 à 60 caractères.",
          maxLength: 255,
        }),
        txt("seo_description", {
          label: "Description SEO",
          note: "120 à 160 caractères.",
        }),
        str("canonical", {
          label: "URL canonique",
          note: "Laisser vide pour la valeur par défaut.",
        }),
      ],
      relations,
    ),
  );

  // --- pages_blocks (M2A) ---
  add({
    collection: "pages_blocks",
    meta: {
      icon: "view_agenda",
      hidden: true,
      sort_field: "sort",
      note: "Jonction M2A entre pages et blocs.",
    },
    fields: [
      intPk(),
      fk("pages_id", "uuid", { hidden: true }),
      str("item", { hidden: true }),
      str("collection", { hidden: true }),
      int("sort", { hidden: true }),
    ],
  });
  relations.push(
    {
      collection: "pages_blocks",
      field: "pages_id",
      related_collection: "pages",
      meta: {
        one_field: "blocks",
        sort_field: "sort",
        junction_field: "item",
        one_deselect_action: "delete",
      },
      schema: { on_delete: "CASCADE" },
    },
    {
      collection: "pages_blocks",
      field: "item",
      related_collection: null,
      meta: {
        one_allowed_collections: [...BLOCK_TYPES],
        one_collection_field: "collection",
        junction_field: "pages_id",
      },
      schema: null,
    },
  );

  // --- six types de blocs (D5), tous traduits ---
  const blockMeta = (
    icon: string,
    singular: string,
    plural: string,
    note: string,
  ) => ({
    icon,
    note,
    hidden: false,
    translations: [
      { language: "fr-CA", translation: plural, singular, plural },
    ],
  });
  const block = (
    name: string,
    m: ReturnType<typeof blockMeta>,
    fields: FieldDef[],
    trFields: FieldDef[],
  ) => {
    add({
      collection: name,
      meta: m,
      fields: [
        uuidPk(),
        ...fields,
        translationsAlias(),
        dateCreated(),
        dateUpdated(),
      ],
    });
    const tr0 = m.translations[0];
    if (!tr0) throw new Error(`bloc « ${name} » sans traduction`);
    add(translationsOf(name, tr0.translation, trFields, relations));
  };

  block(
    "block_hero",
    blockMeta(
      "flag",
      "Bloc héros",
      "Blocs héros",
      "Titre d’accueil : slogan court, sous-titre, deux appels à l’action.",
    ),
    [
      select("variant", TONES, {
        label: "Variante",
        def: "sombre",
        width: "half",
      }),
      anchorId(),
      bool("perimeter_grid", {
        label: "Grille de périmètre",
        def: true,
        note: "Motif de fond signature.",
      }),
      file("media", { label: "Média" }),
    ],
    [
      str("eyebrow", { label: "Surtitre" }),
      str("headline", {
        label: "Titre",
        required: true,
        note: "3 à 7 mots, ponctué d’un point.",
      }),
      txt("subheadline", { label: "Sous-titre" }),
      str("primary_label", {
        label: "Bouton principal — libellé",
        width: "half",
      }),
      str("primary_href", { label: "Bouton principal — lien", width: "half" }),
      str("secondary_label", {
        label: "Bouton secondaire — libellé",
        width: "half",
      }),
      str("secondary_href", {
        label: "Bouton secondaire — lien",
        width: "half",
      }),
    ],
  );
  toFiles("block_hero", "media");

  block(
    "block_section",
    blockMeta(
      "view_headline",
      "Bloc section",
      "Blocs section",
      "Titre, texte riche contrôlé, média et liste.",
    ),
    [
      select(
        "media_position",
        [
          ["none", "Aucun média"],
          ["left", "À gauche"],
          ["right", "À droite"],
          ["top", "Au-dessus"],
        ],
        { label: "Position du média", def: "none", width: "half" },
      ),
      select("visual", SECTION_VISUALS, {
        label: "Schéma",
        def: "aucun",
        width: "half",
        note: "Schéma ou maquette d’interface construits en composants (jamais une image) ; il prend la place du média.",
      }),
      tone("clair"),
      anchorId(),
      file("media", { label: "Média" }),
    ],
    [
      str("title", { label: "Titre" }),
      {
        field: "body",
        type: "text",
        meta: meta({
          label: "Texte",
          interface: "input-rich-text-html",
          options: rich,
        }),
        schema: {},
      },
      str("media_alt", { label: "Texte alternatif du média" }),
      json("items", {
        label: "Liste",
        interface: "list",
        special: ["cast-json"],
        options: listOf([
          { field: "title", name: "Titre", type: "string" },
          { field: "text", name: "Texte", type: "text" },
        ]),
      }),
    ],
  );
  toFiles("block_section", "media");

  block(
    "block_cards",
    blockMeta(
      "dashboard",
      "Bloc cartes",
      "Blocs cartes",
      "Grille de cartes (titre, texte, lien).",
    ),
    [
      select(
        "columns",
        [
          ["2", "2 colonnes"],
          ["3", "3 colonnes"],
          ["4", "4 colonnes"],
        ],
        { label: "Colonnes", def: "3", width: "half" },
      ),
      select("layout", CARD_LAYOUTS, {
        label: "Disposition",
        def: "grille",
        width: "half",
        note: "Liste : rangées pleine largeur. Étapes : frise numérotée. Modules : grille compacte M1…, avec statut facultatif par carte.",
      }),
      tone("clair"),
      anchorId(),
    ],
    [
      str("title", { label: "Titre" }),
      txt("intro", { label: "Introduction" }),
      json("cards", {
        label: "Cartes",
        interface: "list",
        special: ["cast-json"],
        options: listOf([
          { field: "title", name: "Titre", type: "string" },
          { field: "text", name: "Texte", type: "text" },
          { field: "href", name: "Lien", type: "string" },
          { field: "link_label", name: "Libellé du lien", type: "string" },
          {
            field: "label",
            name: "Libellé court (liste : colonne de gauche)",
            type: "string",
          },
          {
            field: "status",
            name: "Statut (modules)",
            type: "string",
            choices: CARD_STATUSES.map((v) => [v, CARD_STATUS_LABELS[v]]),
          },
        ]),
      }),
    ],
  );

  block(
    "block_pricing",
    blockMeta(
      "sell",
      "Bloc tarifs",
      "Blocs tarifs",
      "Offres et tarifs. Aucun prix inventé : « Sur demande » tant que le fondateur n’a pas publié de prix.",
    ),
    [tone("clair"), anchorId()],
    [
      str("title", { label: "Titre" }),
      txt("intro", { label: "Introduction" }),
      json("plans", {
        label: "Offres",
        interface: "list",
        special: ["cast-json"],
        options: listOf([
          { field: "name", name: "Nom", type: "string" },
          { field: "price_label", name: "Prix affiché", type: "string" },
          {
            field: "billing_note",
            name: "Note de facturation et taxes",
            type: "string",
          },
          { field: "description", name: "Description", type: "text" },
          {
            field: "features",
            name: "Inclus (une ligne par élément)",
            type: "text",
          },
          { field: "cta_label", name: "Bouton — libellé", type: "string" },
          { field: "cta_href", name: "Bouton — lien", type: "string" },
        ]),
      }),
      txt("note", { label: "Note" }),
    ],
  );

  block(
    "block_faq",
    blockMeta(
      "help",
      "Bloc FAQ",
      "Blocs FAQ",
      "Questions et réponses (peut produire du FAQPage JSON-LD).",
    ),
    [
      bool("emit_jsonld", { label: "Produire le JSON-LD FAQPage", def: true }),
      tone("clair"),
      anchorId(),
    ],
    [
      str("title", { label: "Titre" }),
      json("items", {
        label: "Questions",
        interface: "list",
        special: ["cast-json"],
        options: listOf([
          { field: "question", name: "Question", type: "string" },
          { field: "answer", name: "Réponse", type: "text" },
        ]),
      }),
    ],
  );

  block(
    "block_cta",
    blockMeta(
      "ads_click",
      "Bloc appel à l’action",
      "Blocs appel à l’action",
      "Bandeau d’appel à l’action.",
    ),
    [tone("sombre"), anchorId()],
    [
      str("title", { label: "Titre", required: true }),
      txt("text", { label: "Texte" }),
      str("primary_label", {
        label: "Bouton principal — libellé",
        width: "half",
      }),
      str("primary_href", { label: "Bouton principal — lien", width: "half" }),
      str("secondary_label", {
        label: "Bouton secondaire — libellé",
        width: "half",
      }),
      str("secondary_href", {
        label: "Bouton secondaire — lien",
        width: "half",
      }),
    ],
  );

  // --- claims (registre privé des affirmations) ---
  add({
    collection: "claims",
    meta: {
      icon: "fact_check",
      note: "Registre privé des affirmations publiques : chaque énoncé a une preuve, une source et un propriétaire.",
      display_template: "{{statement}}",
      translations: [
        {
          language: "fr-CA",
          translation: "Affirmations",
          singular: "Affirmation",
          plural: "Affirmations",
        },
      ],
    },
    fields: [
      uuidPk(),
      txt("statement", {
        label: "Énoncé",
        required: true,
        note: "La phrase telle qu’elle est publiée (fr-CA).",
      }),
      txt("scope", {
        label: "Périmètre",
        note: "Où et comment l’énoncé est vrai (mode sur place, hébergé au Québec, etc.).",
      }),
      txt("evidence", {
        label: "Preuve",
        note: "Test, document, capture ou mesure qui démontre l’énoncé.",
      }),
      str("evidence_url", { label: "Lien de la preuve" }),
      str("source_version", {
        label: "Source et version",
        note: "Dépôt, version, date ou commit de la preuve.",
      }),
      fk("owner", "uuid", {
        label: "Propriétaire",
        note: "Personne responsable de l’exactitude.",
      }),
      dateOnly("valid_from", { label: "Valide à partir du", width: "half" }),
      dateOnly("valid_until", { label: "Valide jusqu’au", width: "half" }),
      select(
        "approval_status",
        [
          ["brouillon", "Brouillon"],
          ["en_revue", "En revue"],
          ["approuvée", "Approuvée"],
          ["retirée", "Retirée"],
        ],
        {
          label: "Approbation",
          def: "brouillon",
          required: true,
          width: "half",
        },
      ),
      fk("approved_by", "uuid", { label: "Approuvée par" }),
      ts("approved_at", { label: "Approuvée le", width: "half" }),
      dateCreated(),
      dateUpdated(),
    ],
  });
  toUsers("claims", "owner");
  toUsers("claims", "approved_by");

  // --- approvals (file d'approbation) ---
  add({
    collection: "approvals",
    meta: {
      icon: "approval",
      note: "File d’approbation : une approbation « approuvée » porte sur le hash exact d’une version ; si la version change, elle devient « périmée ».",
      display_template: "{{summary}}",
      translations: [
        {
          language: "fr-CA",
          translation: "Approbations",
          singular: "Approbation",
          plural: "Approbations",
        },
      ],
    },
    fields: [
      uuidPk(),
      select("status", APPROVAL_STATES, {
        label: "État",
        def: "en_attente",
        required: true,
        width: "half",
      }),
      select(
        "kind",
        [
          ["contenu", "Contenu"],
          ["traduction", "Traduction"],
          ["seo", "SEO"],
          ["prix", "Prix"],
          ["suggestion", "Suggestion"],
        ],
        { label: "Type", def: "contenu", width: "half" },
      ),
      str("collection", { label: "Collection", required: true, width: "half" }),
      str("item", {
        label: "Élément",
        note: "Identifiant de l’élément (vide pour une création).",
        width: "half",
      }),
      str("version_id", {
        label: "Version (identifiant)",
        width: "half",
        note: "Identifiant directus_versions ; permet de retrouver la version.",
      }),
      str("version_key", { label: "Clé de version", width: "half" }),
      str("version_hash", {
        label: "Hash de version",
        readonly: true,
        note: "Calculé par le serveur à la création : SHA-256 de la collection, de l’élément et du contenu de la version.",
      }),
      txt("summary", { label: "Résumé" }),
      json("diff", {
        label: "Différences",
        note: "Contenu de la version (rempli par le serveur si vide).",
      }),
      userCreated("proposed_by"),
      fk("reviewer", "uuid", { label: "Relecteur" }),
      txt("comment", { label: "Commentaire du relecteur" }),
      ts("publish_at", {
        label: "Publier le",
        note: "Date de publication prévue.",
        width: "half",
      }),
      ts("applied_at", {
        label: "Appliquée le",
        readonly: true,
        note: "Renseignée quand l’approbation a servi à une publication (usage unique).",
        width: "half",
      }),
      dateCreated(),
      dateUpdated(),
    ],
  });
  toUsers("approvals", "reviewer");
  // `proposed_by` : champ « user-created » avec clé étrangère vers directus_users
  toUsers("approvals", "proposed_by");

  return { collections, relations };
}
