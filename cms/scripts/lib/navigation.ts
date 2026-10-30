// Navigation du site (conception §6) : en-tête, pied de page, légal. Données pures, testées dans navigation.test.ts.
// Les liens en-CA reprennent le slug français sous /en : le site les résout vers le slug réellement publié dans
// chaque langue (table de correspondance des pages, voir web/src/server/cms/slugs.ts), ce qui évite tout 404 quand
// les slugs diffèrent (souverainete ↔ sovereignty).

export type NavEntry = {
  /** Clé stable : sert à retrouver l'entrée au rechargement (emplacement + parent + libellé fr-CA). */
  placement: "header" | "footer" | "legal";
  style: "link" | "button" | "utility";
  fr: { label: string; href: string; description?: string };
  en: { label: string; href: string; description?: string };
  children?: Omit<NavEntry, "placement" | "style" | "children">[];
};

const en = (href: string) => (href === "/" ? "/en/" : `/en${href}`);
const both = (
  frLabel: string,
  enLabel: string,
  href: string,
  frDescription?: string,
  enDescription?: string,
): Omit<NavEntry, "placement" | "style" | "children"> => ({
  fr: {
    label: frLabel,
    href,
    ...(frDescription ? { description: frDescription } : {}),
  },
  en: {
    label: enLabel,
    href: en(href),
    ...(enDescription ? { description: enDescription } : {}),
  },
});

const top = (
  placement: NavEntry["placement"],
  style: NavEntry["style"],
  entry: Omit<NavEntry, "placement" | "style" | "children">,
  children?: NavEntry["children"],
): NavEntry => ({
  placement,
  style,
  ...entry,
  ...(children ? { children } : {}),
});

export const NAVIGATION: NavEntry[] = [
  // --- en-tête : IA souveraine · Solutions · Produits (menu) · Tarifs · Ressources ; Connexion ; bouton ---
  top(
    "header",
    "link",
    both("IA souveraine", "Sovereign AI", "/souverainete/"),
  ),
  top("header", "link", both("Solutions", "Solutions", "/solutions/")),
  top(
    "header",
    "link",
    {
      fr: { label: "Produits", href: "" },
      en: { label: "Products", href: "" },
    },
    [
      both(
        "VPS",
        "VPS",
        "/vps/",
        "Serveurs privés virtuels au Québec, avec l’application de votre choix.",
        "Virtual private servers in Quebec, with the application of your choice.",
      ),
      both(
        "Modèles et API",
        "Models and API",
        "/modeles/",
        "Une passerelle unique vers des modèles, avec la résidence des données affichée.",
        "One gateway to many models, with data residency shown for each.",
      ),
      both(
        "WorkStudio",
        "WorkStudio",
        "/workstudio/",
        "Le studio pour concevoir des agents et des flux de travaux.",
        "The studio for designing agents and workflows.",
      ),
      both(
        "Nexora Apps",
        "Nexora Apps",
        "/apps/",
        "Nexora Code, Gitspace, RAG, WebPilot, Privacy Router et outils gratuits. L’état de chacun est indiqué.",
        "Nexora Code, Gitspace, RAG, WebPilot, Privacy Router and free tools. The state of each is shown.",
      ),
      both(
        "Suite logicielle",
        "Software suite",
        "/suite/",
        "Code, Corpus et les modèles Quanta et Helix.",
        "Code, Corpus, and the Quanta and Helix models.",
      ),
      both(
        "OPSYS-AI",
        "OPSYS-AI",
        "/opsys-ai/",
        "Une équipe coordonnée pour la construction et les services terrain.",
        "A coordinated team for construction and field services.",
      ),
    ],
  ),
  top("header", "link", both("Tarifs", "Pricing", "/tarifs/")),
  top("header", "link", both("Ressources", "Resources", "/ressources/")),
  top("header", "utility", both("Connexion", "Sign in", "/compte/")),
  top(
    "header",
    "button",
    both("Planifier un diagnostic", "Book a diagnostic", "/contact/"),
  ),

  // --- pied de page : quatre colonnes ---
  top(
    "footer",
    "link",
    {
      fr: { label: "Produits", href: "" },
      en: { label: "Products", href: "" },
    },
    [
      both("VPS", "VPS", "/vps/"),
      both("Modèles et API", "Models and API", "/modeles/"),
      both("WorkStudio", "WorkStudio", "/workstudio/"),
      both("Nexora Apps", "Nexora Apps", "/apps/"),
      both("Mes outils", "My tools", "/compte/"),
      both("Suite logicielle", "Software suite", "/suite/"),
      both("OPSYS-AI", "OPSYS-AI", "/opsys-ai/"),
      both("Nexora Croissance", "Nexora Croissance", "/croissance/"),
      both("Nexora Vision", "Nexora Vision", "/vision/"),
    ],
  ),
  top(
    "footer",
    "link",
    {
      fr: { label: "Solutions", href: "" },
      en: { label: "Solutions", href: "" },
    },
    [
      both("Toutes les solutions", "All solutions", "/solutions/"),
      both("Courriels", "Email", "/solutions/courriels/"),
      both("Factures", "Invoices", "/solutions/factures/"),
      both("Service client", "Customer service", "/solutions/service-client/"),
      both(
        "Prise de rendez-vous",
        "Appointment booking",
        "/solutions/rendez-vous/",
      ),
      both("Comptabilité", "Accounting", "/solutions/comptabilite/"),
      both("Documents", "Documents", "/solutions/documents/"),
    ],
  ),
  top(
    "footer",
    "link",
    {
      fr: { label: "Entreprise", href: "" },
      en: { label: "Company", href: "" },
    },
    [
      both("Services", "Services", "/services/"),
      both("Modes de déploiement", "Deployment modes", "/deploiement/"),
      both("Méthode", "Method", "/methode/"),
      both("Entreprise", "About", "/entreprise/"),
      both("Tarifs", "Pricing", "/tarifs/"),
      both("Contact", "Contact", "/contact/"),
    ],
  ),
  top(
    "footer",
    "link",
    {
      fr: { label: "Centre de confiance", href: "" },
      en: { label: "Trust centre", href: "" },
    },
    [
      both("Souveraineté", "Sovereignty", "/souverainete/"),
      both("Vos données", "Your data", "/vos-donnees/"),
      both("Loi 25", "Law 25", "/souverainete/loi-25/"),
      both("Centre de confiance", "Trust centre", "/centre-de-confiance/"),
      both("Questions fréquentes", "Frequently asked questions", "/faq/"),
      both("Ressources", "Resources", "/ressources/"),
    ],
  ),

  // --- mentions légales ---
  top(
    "legal",
    "link",
    both("Mentions légales", "Legal notice", "/mentions-legales/"),
  ),
  top("legal", "link", both("Confidentialité", "Privacy", "/confidentialite/")),
  top(
    "legal",
    "link",
    both("Conditions d’utilisation", "Terms of use", "/conditions/"),
  ),
  top(
    "legal",
    "link",
    both(
      "Utilisation acceptable",
      "Acceptable use",
      "/utilisation-acceptable/",
    ),
  ),
];

/** Nombre d'entrées (parents et enfants) : sert aux comptes rendus du script. */
export function countEntries(entries: NavEntry[] = NAVIGATION): number {
  return entries.reduce((n, e) => n + 1 + (e.children?.length ?? 0), 0);
}

// ---------- rapprochement avec ce que Directus contient déjà ----------

export type ExistingNav = {
  id: string;
  placement: string;
  style: string | null;
  sort: number | null;
  status: string | null;
  parent: string | null;
  translations: {
    id: number;
    languages_code: string;
    label: string | null;
    href: string | null;
    description: string | null;
  }[];
};

export type Flat = {
  placement: NavEntry["placement"];
  style: NavEntry["style"];
  sort: number;
  /** Libellé fr-CA du parent (null pour une entrée de premier niveau). */
  parentLabel: string | null;
  fr: NavEntry["fr"];
  en: NavEntry["en"];
};

/** Aplatit l'arbre : un parent précède toujours ses enfants ; le rang est calculé par emplacement. */
export function flattenNavigation(entries: NavEntry[] = NAVIGATION): Flat[] {
  const rank: Record<string, number> = {};
  const out: Flat[] = [];
  for (const e of entries) {
    const position = (rank[e.placement] ?? 0) + 1;
    rank[e.placement] = position;
    out.push({
      placement: e.placement,
      style: e.style,
      sort: position * 10,
      parentLabel: null,
      fr: e.fr,
      en: e.en,
    });
    (e.children ?? []).forEach((c, i) => {
      out.push({
        placement: e.placement,
        style: "link",
        sort: (i + 1) * 10,
        parentLabel: e.fr.label,
        fr: c.fr,
        en: c.en,
      });
    });
  }
  return out;
}

const frLabel = (n: ExistingNav) =>
  n.translations.find((t) => t.languages_code === "fr-CA")?.label ?? "";

/**
 * Compare l'arbre voulu à l'existant. Sans `align`, seules les entrées absentes sont créées (jamais
 * d'écrasement du travail d'un éditeur) ; avec `align`, style, rang, statut et textes sont réalignés.
 */
export function planNavigation(
  existing: ExistingNav[],
  desired: Flat[] = flattenNavigation(),
  align = false,
): {
  creates: Flat[];
  updates: { id: string; body: Record<string, unknown> }[];
} {
  const creates: Flat[] = [];
  const updates: { id: string; body: Record<string, unknown> }[] = [];
  const byId = new Map(existing.map((n) => [n.id, n]));
  const find = (d: Flat) =>
    existing.find((n) => {
      if (n.placement !== d.placement || frLabel(n) !== d.fr.label)
        return false;
      const parent = n.parent ? byId.get(n.parent) : undefined;
      return (parent ? frLabel(parent) : null) === d.parentLabel;
    });
  for (const d of desired) {
    const cur = find(d);
    if (!cur) {
      creates.push(d);
      continue;
    }
    if (!align) continue;
    const body: Record<string, unknown> = {};
    if (cur.style !== d.style) body.style = d.style;
    if (cur.sort !== d.sort) body.sort = d.sort;
    if (cur.status !== "published") body.status = "published";
    // Forme explicite { create, update } : un simple tableau REMPLACERAIT l'ensemble et supprimerait les absents.
    const create: Record<string, unknown>[] = [];
    const update: Record<string, unknown>[] = [];
    for (const [code, v] of [
      ["fr-CA", d.fr],
      ["en-CA", d.en],
    ] as const) {
      const t = cur.translations.find((x) => x.languages_code === code);
      const fields = {
        label: v.label,
        href: v.href || null,
        description: v.description ?? null,
      };
      if (!t) create.push({ languages_code: code, ...fields });
      else if (
        t.label !== v.label ||
        (t.href ?? "") !== v.href ||
        (t.description ?? "") !== (v.description ?? "")
      )
        update.push({ id: t.id, ...fields });
    }
    if (create.length || update.length)
      body.translations = { create, update, delete: [] };
    if (Object.keys(body).length) updates.push({ id: cur.id, body });
  }
  return { creates, updates };
}
