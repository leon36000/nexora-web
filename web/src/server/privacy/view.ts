import type { Database, PrivacyLevel } from "@nexora/db";
import {
  DEFAULT_POLICY,
  DEFAULT_POLICY_VERSION,
  type EffectivePolicy,
  parsePolicyConfig,
  resolvePolicy,
} from "./policy";
import {
  type DecisionCounts,
  decisionCounts,
  listPolicyVersions,
  loadCurrentPolicy,
} from "./store";

/** Vue de la politique d'une organisation pour l'espace client (API et page) : sérialisable, sans contenu. */

export const RECENT_DAYS = 30;
const VERSIONS_SHOWN = 20;

export interface PrivacyConfigView {
  maskCategories: string[];
  denyCategories: string[];
  allowedHosts: string[];
  blockedHosts: string[];
  allowedModels: string[];
  blockAttachments: boolean;
}

export interface PrivacyView {
  level: PrivacyLevel;
  /** 0 = politique par défaut de Nexora (aucune version enregistrée). */
  version: number;
  isDefault: boolean;
  /** La configuration enregistrée est illisible : le routeur refuse tout jusqu'à correction. */
  invalid: boolean;
  config: PrivacyConfigView;
  recent: { days: number; counts: DecisionCounts };
  versions: {
    version: number;
    level: PrivacyLevel;
    current: boolean;
    createdAt: string;
  }[];
}

export const configView = (p: EffectivePolicy): PrivacyConfigView => ({
  maskCategories: [...p.maskCategories],
  denyCategories: [...p.denyCategories],
  allowedHosts: [...p.allowedHosts],
  blockedHosts: [...p.blockedHosts],
  allowedModels: [...p.allowedModels],
  blockAttachments: p.blockAttachments,
});

export async function loadPrivacyView(
  db: Database,
  organizationId: string,
  now: Date,
): Promise<PrivacyView> {
  const from = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  // Marge d'une minute : l'horloge de la base peut avancer sur celle du site.
  const to = new Date(now.getTime() + 60_000);
  const [stored, counts, versions] = await Promise.all([
    loadCurrentPolicy(db, organizationId),
    decisionCounts(db, organizationId, from, to),
    listPolicyVersions(db, organizationId, VERSIONS_SHOWN),
  ]);
  let policy = DEFAULT_POLICY;
  let version = DEFAULT_POLICY_VERSION;
  let invalid = false;
  if (stored) {
    const parsed = parsePolicyConfig(stored.config);
    invalid = !parsed.success;
    // Politique illisible : le routeur refuse tout ; l'écran repart de la politique par défaut à corriger.
    policy = parsed.success
      ? resolvePolicy(stored.level, parsed.data)
      : { ...DEFAULT_POLICY, level: stored.level };
    version = stored.version;
  }
  return {
    level: policy.level,
    version,
    isDefault: stored === null,
    invalid,
    config: configView(policy),
    recent: { days: RECENT_DAYS, counts },
    versions: versions.map((v) => ({
      version: v.version,
      level: v.level,
      current: v.current,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}
