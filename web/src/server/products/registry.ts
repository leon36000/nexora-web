import type { StorageProduct } from "@nexora/db";
import { findApp } from "@/i18n/apps";

/**
 * Registre des produits du panneau « Mes outils » (`/compte`). Une seule définition par produit : son accès (qui paie
 * quoi), son produit d'espace (contrat `OrgEntitlements` du chantier A), la page du panneau qui le porte et la façon
 * dont son état réel est décidé. Les textes sont dans `i18n/dictionaries/account-*.ts` (`panel.tools.products`).
 *
 * Règle du site : un outil non livré n'est jamais présenté comme livré. L'état « disponible » de Nexora Code et du RAG
 * vient d'un interrupteur d'environnement, éteint par défaut, qu'on allume à la fusion des chantiers qui les livrent
 * (voir `docs/panneau-mes-outils.md`). WorkStudio garde son interrupteur d'avant : l'adresse de son instance.
 */

export const PRODUCT_IDS = [
  "workstudio",
  "code",
  "rag",
  "bot",
  "creative",
  "webpilot",
  "privacy-router",
  "vps",
] as const;
export type ProductId = (typeof PRODUCT_IDS)[number];

/** État honnête d'un produit : livré, en préparation, prévu à une étape ultérieure (mêmes valeurs que Nexora Apps). */
export type ProductState = "disponible" | "bientot" | "plus_tard";

/**
 * Qui paie quoi : `inclus` (aucun appel de modèle, aucun supplément), `credits` (l'outil est gratuit ou inclus, les
 * modèles qu'il appelle consomment des crédits), `abonnement` (abonnement propre au produit, comme un VPS), `a_definir`
 * (mode d'accès pas encore arrêté).
 */
export type ProductAccess = "inclus" | "credits" | "abonnement" | "a_definir";

/**
 * Action principale de la carte : ouvrir WorkStudio, ouvrir l'environnement de Nexora Code, créer un RAG en un clic,
 * aller à la page du produit dans le panneau, à sa fiche Nexora Apps (produit sans page de panneau), rejoindre la liste d'attente (« Me prévenir »), ou aucune action
 * (WorkStudio en préparation : on le dit, sans bouton).
 */
export type ProductAction =
  | "open_workstudio"
  | "open_code"
  | "create_rag"
  | "open_page"
  | "open_app"
  | "waitlist"
  | "none";

type StateSource =
  | { kind: "workstudio" }
  | { kind: "env"; variable: string }
  | { kind: "apps" }
  | { kind: "panel" };

export type ProductDef = {
  id: ProductId;
  /** Groupe d'affichage : les outils de travail, puis ce qui entoure les modèles (API, protection, serveurs). */
  group: "work" | "around";
  access: ProductAccess;
  /** Produit d'espace compté au quota de l'organisation ; null si le produit n'écrit rien chez Nexora. */
  storage: StorageProduct | null;
  /** Appelle des modèles, donc consomme des crédits (RAG : jetons d'embedding et de rerank). */
  consumesCredits: boolean;
  /** Fiche Nexora Apps (identifiant d'adresse) : source de la liste d'attente et, pour certains, de l'état. */
  appSlug: string | null;
  /** Page du produit dans le panneau (chemin neutre, sans langue) ; null s'il n'en a pas encore. */
  panelPath: string | null;
  stateSource: StateSource;
  /** Action quand le produit est livré. */
  primary:
    | "open_workstudio"
    | "open_code"
    | "create_rag"
    | "open_page"
    | "open_app";
  /**
   * Produit pas encore livré mais dont la page du panneau fonctionne déjà (Privacy Router) : l'action est d'aller à
   * cette page, pas la liste d'attente.
   */
  pageWhenSoon?: true;
  /** Affirmations du registre (`cms/content/claims.json`) sur lesquelles s'appuie la carte. */
  claims: readonly string[];
};

export const PRODUCTS: readonly ProductDef[] = [
  {
    id: "workstudio",
    group: "work",
    access: "credits",
    storage: "workstudio",
    consumesCredits: true,
    appSlug: null,
    panelPath: "/compte/workstudio",
    stateSource: { kind: "workstudio" },
    primary: "open_workstudio",
    claims: ["CL-P01", "CL-T04"],
  },
  {
    id: "code",
    group: "work",
    access: "credits",
    storage: "code",
    consumesCredits: true,
    appSlug: "code",
    panelPath: "/compte/code",
    stateSource: { kind: "env", variable: "NEXORA_PRODUCT_CODE" },
    primary: "open_code",
    claims: ["CL-AP01", "CL-AP06", "CL-T04"],
  },
  {
    id: "rag",
    group: "work",
    access: "credits",
    storage: "rag",
    consumesCredits: true,
    appSlug: "rag",
    panelPath: "/compte/rag",
    stateSource: { kind: "env", variable: "NEXORA_PRODUCT_RAG" },
    primary: "create_rag",
    claims: ["CL-AP07", "CL-T05"],
  },
  {
    id: "bot",
    group: "work",
    access: "credits",
    storage: "bot",
    consumesCredits: true,
    appSlug: "bot",
    panelPath: null,
    stateSource: { kind: "apps" },
    primary: "open_app",
    claims: ["CL-AP01", "CL-AP08"],
  },
  {
    id: "creative",
    group: "work",
    access: "a_definir",
    storage: "creative",
    consumesCredits: false,
    appSlug: "creative",
    panelPath: null,
    stateSource: { kind: "apps" },
    primary: "open_app",
    claims: ["CL-AP05"],
  },
  {
    id: "webpilot",
    group: "around",
    access: "credits",
    storage: null,
    consumesCredits: true,
    appSlug: "webpilot",
    panelPath: null,
    stateSource: { kind: "apps" },
    primary: "open_app",
    claims: ["CL-AP05"],
  },
  {
    id: "privacy-router",
    group: "around",
    access: "inclus",
    storage: null,
    consumesCredits: false,
    appSlug: "privacy-router",
    panelPath: "/compte/confidentialite",
    stateSource: { kind: "apps" },
    primary: "open_page",
    pageWhenSoon: true,
    claims: ["CL-AP03"],
  },
  {
    id: "vps",
    group: "around",
    access: "abonnement",
    storage: null,
    consumesCredits: false,
    appSlug: null,
    panelPath: "/compte/vps",
    stateSource: { kind: "panel" },
    primary: "open_page",
    claims: ["CL-M11"],
  },
];

export type ResolvedProduct = ProductDef & {
  state: ProductState;
  action: ProductAction;
};

/** Valeurs qui allument un interrupteur `NEXORA_PRODUCT_*` ; tout le reste (absent, vide, « 0 », faute de frappe) l'éteint. */
const ON = new Set(["1", "true", "on", "oui", "yes"]);
export function productSwitchOn(value: string | undefined): boolean {
  return value !== undefined && ON.has(value.trim().toLowerCase());
}

function stateOf(
  def: ProductDef,
  env: Record<string, string | undefined>,
  workstudioUrl: string | null,
): ProductState {
  const source = def.stateSource;
  switch (source.kind) {
    case "workstudio":
      return workstudioUrl ? "disponible" : "bientot";
    case "env":
      return productSwitchOn(env[source.variable]) ? "disponible" : "bientot";
    case "apps":
      // Par prudence, une fiche absente ou inconnue ne vaut jamais « disponible ».
      return (def.appSlug ? findApp(def.appSlug)?.state : undefined) ??
        "bientot";
    case "panel":
      return "disponible";
  }
}

function actionOf(def: ProductDef, state: ProductState): ProductAction {
  if (state === "disponible") return def.primary;
  if (def.pageWhenSoon && def.panelPath) return "open_page";
  if (def.appSlug) return "waitlist";
  return "none";
}

/**
 * Produits du panneau avec leur état réel et leur action. `env` : variables d'environnement (`NEXORA_PRODUCT_CODE`,
 * `NEXORA_PRODUCT_RAG`) ; `workstudioUrl` : adresse sûre de l'instance WorkStudio (`workstudioInstanceOrigin`), null
 * tant qu'elle n'est pas connue.
 */
export function resolveProducts(input: {
  env: Record<string, string | undefined>;
  workstudioUrl: string | null;
}): ResolvedProduct[] {
  return PRODUCTS.map((def) => {
    const state = stateOf(def, input.env, input.workstudioUrl);
    return { ...def, state, action: actionOf(def, state) };
  });
}
