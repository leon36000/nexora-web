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

/** Menus de l'en-tête (refonte « Signal », 02/11/2026) : réutilisés par les colonnes du pied de page. */
const SOLUTIONS = [
  both(
    "Réception virtuelle",
    "Virtual reception",
    "/solutions/reception-virtuelle/",
    "Appels, courriels et textos traités jour et nuit, en français et en anglais.",
    "Calls, emails and text messages handled day and night, in French and English.",
  ),
  both(
    "Surveillance IA",
    "AI surveillance",
    "/solutions/surveillance-ia/",
    "Vos caméras analysées en temps réel ; alertes et rapports à chaque événement.",
    "Your cameras analyzed in real time; alerts and reports for every event.",
  ),
  both(
    "Agents IA",
    "AI agents",
    "/workstudio/",
    "Des agents qui exécutent vos tâches, avec votre approbation.",
    "Agents that carry out your tasks, with your approval.",
  ),
  both(
    "OPSYS-AI",
    "OPSYS-AI",
    "/opsys-ai/",
    "Une équipe coordonnée pour la construction et les services terrain.",
    "A coordinated team for construction and field services.",
  ),
  both(
    "Toutes les solutions",
    "All solutions",
    "/solutions/",
    "Courriels, factures, documents, rendez-vous, comptabilité, service client.",
    "Email, invoices, documents, appointments, accounting, customer service.",
  ),
];
const INFRASTRUCTURE = [
  both(
    "Infrastructure IA",
    "AI infrastructure",
    "/infrastructure/",
    "Postes d'IA compacts, stations d'IA et baies de serveurs, installés chez vous.",
    "Compact AI machines, AI workstations and server racks, installed at your site.",
  ),
  both(
    "Hébergé chez nous",
    "Hosted with us",
    "/deploiement/heberge-quebec/",
    "Vos modèles et vos agents sur nos serveurs, au Québec.",
    "Your models and agents on our servers, in Quebec.",
  ),
  both(
    "Installé chez vous",
    "Installed at your site",
    "/deploiement/sur-place/",
    "Vos données ne quittent pas vos locaux.",
    "Your data never leaves your premises.",
  ),
  both(
    "VPS",
    "VPS",
    "/vps/",
    "Serveurs privés virtuels, avec l’application de votre choix.",
    "Virtual private servers, with the application of your choice.",
  ),
  both(
    "Modèles et API",
    "Models and API",
    "/modeles/",
    "Une passerelle unique vers des modèles, avec la résidence des données affichée.",
    "One gateway to many models, with data residency shown for each.",
  ),
];
const TOOLS = [
  both(
    "Nexora Creative",
    "Nexora Creative",
    "/apps/creative/",
    "Image, vidéo et son : l’IA fait le gros du travail.",
    "Image, video and sound: AI does the heavy lifting.",
  ),
  both(
    "WorkStudio",
    "WorkStudio",
    "/workstudio/",
    "Le studio pour concevoir des agents et des flux de travaux.",
    "The studio for designing agents and workflows.",
  ),
  both(
    "Nexora Code",
    "Nexora Code",
    "/apps/code/",
    "Un environnement de code avec l’IA, dans votre compte.",
    "A coding environment with AI, in your account.",
  ),
  both(
    "Nexora RAG",
    "Nexora RAG",
    "/apps/rag/",
    "Des réponses tirées de vos propres documents.",
    "Answers drawn from your own documents.",
  ),
  both(
    "WebPilot",
    "WebPilot",
    "/apps/webpilot/",
    "Un navigateur que l’IA pilote pour vous.",
    "A browser that AI drives for you.",
  ),
  both(
    "Toutes les applications",
    "All applications",
    "/apps/",
    "L’état de chaque outil est indiqué.",
    "The state of each tool is shown.",
  ),
];
const menu = (
  fr: string,
  en: string,
  children: NonNullable<NavEntry["children"]>,
  placement: NavEntry["placement"] = "header",
) =>
  top(
    placement,
    "link",
    { fr: { label: fr, href: "" }, en: { label: en, href: "" } },
    children,
  );
/** Une colonne du pied de page reprend un menu, sans les descriptions. */
const plain = (c: NonNullable<NavEntry["children"]>) =>
  c.map(({ fr, en }) => ({
    fr: { label: fr.label, href: fr.href },
    en: { label: en.label, href: en.href },
  }));

export const NAVIGATION: NavEntry[] = [
  // --- en-tête : Solutions ▾ · Infrastructure ▾ · Outils ▾ · Tarifs · Ressources ; Connexion ; bouton ---
  menu("Solutions", "Solutions", SOLUTIONS),
  menu("Infrastructure", "Infrastructure", INFRASTRUCTURE),
  menu("Outils", "Tools", TOOLS),
  top("header", "link", both("Tarifs", "Pricing", "/tarifs/")),
  top("header", "link", both("Ressources", "Resources", "/ressources/")),
  top("header", "utility", both("Connexion", "Sign in", "/compte/")),
  top(
    "header",
    "button",
    both("Planifier une consultation", "Plan a consultation", "/contact/"),
  ),

  // --- pied de page : quatre colonnes ---
  menu("Solutions", "Solutions", plain(SOLUTIONS), "footer"),
  menu("Infrastructure", "Infrastructure", plain(INFRASTRUCTURE), "footer"),
  menu(
    "Outils",
    "Tools",
    [...plain(TOOLS), both("Mes outils", "My tools", "/compte/")],
    "footer",
  ),
  menu(
    "Entreprise",
    "Company",
    [
      both("Services", "Services", "/services/"),
      both("Méthode", "Method", "/methode/"),
      both("Entreprise", "About", "/entreprise/"),
      both("Souveraineté", "Sovereignty", "/souverainete/"),
      both("Centre de confiance", "Trust centre", "/centre-de-confiance/"),
      both("Questions fréquentes", "Frequently asked questions", "/faq/"),
      both("Contact", "Contact", "/contact/"),
    ],
    "footer",
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
  const matched = new Set<string>();
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
    matched.add(cur.id);
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
  // Avec `align`, une entrée que l'arbre ne connaît plus (ex. l'ancien menu « Produits ») est archivée, jamais
  // supprimée : le site ne lit que les entrées publiées, et un éditeur peut la republier.
  if (align)
    for (const n of existing)
      if (!matched.has(n.id) && n.status !== "archived")
        updates.push({ id: n.id, body: { status: "archived" } });
  return { creates, updates };
}
