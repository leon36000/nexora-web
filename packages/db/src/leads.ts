/**
 * Listes de valeurs du formulaire de contact : une seule source pour la validation côté serveur (web),
 * les libellés du courriel destiné à l'équipe (worker) et les dictionnaires du site.
 */
export const LEAD_NEEDS = [
  "diagnostic",
  "installation",
  "automatisation",
  "opsys-ai",
  "workstudio",
  "vps-api",
  "autre",
] as const;
export const LEAD_SECTORS = [
  "construction",
  "services-professionnels",
  "sante",
  "commerce",
  "industrie",
  "technologie",
  "autre",
] as const;
export const LEAD_DEPLOYMENTS = ["sur-place", "heberge", "indecis"] as const;

export type LeadNeed = (typeof LEAD_NEEDS)[number];
export type LeadSector = (typeof LEAD_SECTORS)[number];
export type LeadDeployment = (typeof LEAD_DEPLOYMENTS)[number];

/** Libellés français, pour le courriel interne (l'équipe lit en français). */
export const LEAD_LABELS_FR = {
  need: {
    diagnostic: "Un diagnostic pour cerner le besoin",
    installation: "Installation d'un serveur d'IA",
    automatisation: "Automatisation sur mesure",
    "opsys-ai": "OPSYS-AI (construction et services terrain)",
    workstudio: "Nexora WorkStudio",
    "vps-api": "Serveur privé virtuel, modèles et API",
    autre: "Autre besoin",
  },
  sector: {
    construction: "Construction et services terrain",
    "services-professionnels": "Services professionnels",
    sante: "Santé et services sociaux",
    commerce: "Commerce et services aux clients",
    industrie: "Industrie et fabrication",
    technologie: "Technologie et développement",
    autre: "Autre secteur",
  },
  deployment: {
    "sur-place": "Sur place, chez le client",
    heberge: "Hébergé au Québec par Nexora AI",
    indecis: "Pas encore décidé",
  },
} as const satisfies {
  need: Record<LeadNeed, string>;
  sector: Record<LeadSector, string>;
  deployment: Record<LeadDeployment, string>;
};
