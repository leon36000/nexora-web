import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client.ts";
import {
  type SiteAgent,
  type SiteAgentKey,
  siteAgentRuns,
  siteAgents,
} from "./schema-site.ts";

/**
 * Définition (code) des agents du site : mission, besoins, valeurs par défaut. La ligne `site_agents` porte l'état
 * (activé, budget, modèle…) ; ce fichier porte ce qui ne change pas sans déploiement.
 *
 * - `usesLlm` : appelle un modèle par la passerelle (budget obligatoire). `sante` n'en appelle aucun coûteux.
 * - `writesDrafts` : écrit des brouillons dans Directus (outil unique `create_draft`) ; les autres n'écrivent pas
 *   dans Directus.
 * - `inputs` : champs d'entrée acceptés au lancement manuel (module « Agents du site »).
 */
export interface SiteAgentDefinition {
  key: SiteAgentKey;
  name: string;
  mission: string;
  usesLlm: boolean;
  writesDrafts: boolean;
  defaultModel: string | null;
  inputs: readonly {
    field: "brief" | "sourceUrl" | "pageId";
    required: boolean;
    label: string;
  }[];
  /** Compte de service Directus de l'agent (rôle créé par apply.ts) : variable d'environnement de développement. */
  directusRole: string | null;
}

export const DEFAULT_AGENT_MODEL = "nexora/glm-5-3";

export const SITE_AGENT_DEFINITIONS: readonly SiteAgentDefinition[] = [
  {
    key: "redacteur",
    name: "Rédacteur",
    mission:
      "Transforme un brief en brouillon de page (fr-CA) et demande une approbation. Ne publie jamais.",
    usesLlm: true,
    writesDrafts: true,
    defaultModel: DEFAULT_AGENT_MODEL,
    inputs: [
      { field: "brief", required: true, label: "Brief" },
      {
        field: "sourceUrl",
        required: false,
        label: "Source (URL, facultatif)",
      },
    ],
    directusRole: "Agent Rédacteur",
  },
  {
    key: "traducteur",
    name: "Traducteur fr-CA → en-CA",
    mission:
      "Propose la version en-CA d'une page dont le français est approuvé. Brouillon et approbation, jamais de publication.",
    usesLlm: true,
    writesDrafts: true,
    defaultModel: DEFAULT_AGENT_MODEL,
    inputs: [{ field: "pageId", required: true, label: "Page (identifiant)" }],
    directusRole: "Agent Traducteur",
  },
  {
    key: "seo",
    name: "SEO on-page",
    mission:
      "Propose titre, description, slug et liens internes d'une page, en brouillon. Les données structurées sont générées par le code, jamais par le modèle.",
    usesLlm: true,
    writesDrafts: true,
    defaultModel: DEFAULT_AGENT_MODEL,
    inputs: [{ field: "pageId", required: true, label: "Page (identifiant)" }],
    directusRole: "Agent SEO on-page",
  },
  {
    key: "veille",
    name: "Veille",
    mission:
      "Lit une source fournie (lecture seule, contenu non fiable) et propose des briefs. N'écrit rien dans Directus.",
    usesLlm: true,
    writesDrafts: false,
    defaultModel: DEFAULT_AGENT_MODEL,
    inputs: [{ field: "sourceUrl", required: true, label: "Source (URL)" }],
    directusRole: null,
  },
  {
    key: "sante",
    name: "Santé des modèles",
    mission:
      "Vérifie, sans appeler de modèle, que les modèles publiés sont bien listés par la passerelle et que LiteLLM répond. Aucun débit, aucune écriture dans Directus.",
    usesLlm: false,
    writesDrafts: false,
    defaultModel: null,
    inputs: [],
    directusRole: null,
  },
];

export function getAgentDefinition(
  key: string,
): SiteAgentDefinition | undefined {
  return SITE_AGENT_DEFINITIONS.find((d) => d.key === key);
}

/** Références du Coffre d'un agent (les valeurs n'y sont jamais lisibles par l'API). */
export const agentGatewayKeyRef = (key: SiteAgentKey) =>
  `site-agent.${key}.gateway`;
export const agentDirectusTokenRef = (key: SiteAgentKey) =>
  `site-agent.${key}.directus`;

/** Organisation interne qui porte le grand livre et les clés des agents (D9). */
export const INTERNAL_AGENTS_ORG = {
  id: "org_nexora_agents_site",
  name: "Nexora AI — agents du site",
  slug: "nexora-agents-site",
} as const;

/** Crée les lignes manquantes (désactivées, budget 0) ; ne modifie jamais une ligne existante. Idempotent. */
export async function ensureSiteAgents(db: Database): Promise<SiteAgent[]> {
  await db
    .insert(siteAgents)
    .values(
      SITE_AGENT_DEFINITIONS.map((d) => ({
        key: d.key,
        name: d.name,
        mission: d.mission,
        model: d.defaultModel,
        enabled: false,
        budgetMicro: 0n,
        state: "disabled" as const,
        directusTokenRef: d.writesDrafts ? agentDirectusTokenRef(d.key) : null,
        gatewayKeyRef: d.usesLlm ? agentGatewayKeyRef(d.key) : null,
      })),
    )
    .onConflictDoNothing();
  return db.select().from(siteAgents).orderBy(siteAgents.key);
}

/**
 * Dépense du mois civil courant (UTC) d'un agent, en micro-CAD, d'après ses exécutions. Source du budget mensuel.
 * Les exécutions en cours comptent déjà ce qu'elles ont dépensé (le coût est écrit après chaque appel).
 */
export async function agentMonthSpendMicro(
  db: Database,
  key: SiteAgentKey,
  now: Date = new Date(),
): Promise<bigint> {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${siteAgentRuns.costMicro}), 0)::text`,
    })
    .from(siteAgentRuns)
    .where(
      and(
        eq(siteAgentRuns.agentKey, key),
        sql`${siteAgentRuns.createdAt} >= ${start}::timestamptz`,
      ),
    );
  return BigInt(row?.total ?? "0");
}
