import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  CATEGORY_TOKEN,
  type DetectorCategory,
  findMatches,
} from "./detectors";
import type { PrivacyEventInput, PrivacyJournal } from "./events";
import {
  DEFAULT_POLICY,
  DEFAULT_POLICY_VERSION,
  type EffectivePolicy,
  hostMatches,
  modelMatches,
  parsePolicyConfig,
  resolvePolicy,
} from "./policy";
import { loadCurrentPolicy } from "./store";
import {
  type OutboundIntent,
  type PrivacyDecision,
  type PrivacyDenyReason,
  type PrivacyRouter,
  PrivacyRouterUnavailableError,
} from "./types";

/**
 * Nexora Privacy Router (v1). Toute sortie de données passe par `evaluate` AVANT d'avoir lieu.
 *
 *  - la politique est lue par organisation (cache court) ; une organisation sans politique applique la politique
 *    par défaut « standard » ;
 *  - toute erreur interne lève `PrivacyRouterUnavailableError` : jamais `allow` par défaut (échec fermé) ;
 *  - une politique enregistrée mais illisible refuse tout (`policy_invalid`) ;
 *  - chaque évaluation laisse une ligne de journal sans contenu.
 */

type Loaded =
  | { valid: true; policy: EffectivePolicy; version: number }
  | { valid: false; version: number };

/** Règles de refus : identifiants stables (journal, message d'erreur, rapport). */
export const RULE = {
  hostBlocked: "host.blocked",
  hostNotAllowed: "host.not_allowed",
  modelNotAllowed: "model.not_allowed",
  sovereignClosed: "sovereign.closed",
  attachmentBlocked: "attachment.blocked",
  policyInvalid: "policy.invalid",
  mask: (category: DetectorCategory) => `mask.${category}`,
  deny: (category: DetectorCategory) => `deny.${category}`,
} as const;

interface Outcome {
  decision: PrivacyDecision;
  detected: DetectorCategory[];
  maskedCount: number;
}

const deny = (
  version: string,
  ruleId: string,
  reason: PrivacyDenyReason,
): Outcome => ({
  decision: { decision: "deny", policyVersion: version, ruleId, reason },
  detected: [],
  maskedCount: 0,
});

/** Décision pure d'une politique pour une sortie. */
export function decide(loaded: Loaded, intent: OutboundIntent): Outcome {
  const version = String(loaded.version);
  if (!loaded.valid) return deny(version, RULE.policyInvalid, "policy_invalid");
  const { policy } = loaded;
  const destination = intent.destination;

  if ("host" in destination) {
    if (hostMatches(policy.blockedHosts, destination.host))
      return deny(version, RULE.hostBlocked, "host_blocked");
    if (policy.level === "souverain") {
      if (policy.allowedHosts.length === 0)
        return deny(version, RULE.sovereignClosed, "strict_sovereignty");
      if (!hostMatches(policy.allowedHosts, destination.host))
        return deny(version, RULE.hostNotAllowed, "host_not_allowed");
    } else if (
      policy.level === "renforce" &&
      policy.allowedHosts.length > 0 &&
      !hostMatches(policy.allowedHosts, destination.host)
    ) {
      return deny(version, RULE.hostNotAllowed, "host_not_allowed");
    }
  } else if (policy.level === "souverain") {
    if (policy.allowedModels.length === 0)
      return deny(version, RULE.sovereignClosed, "strict_sovereignty");
    if (!modelMatches(policy.allowedModels, destination.model))
      return deny(version, RULE.modelNotAllowed, "model_not_allowed");
  } else if (
    policy.level === "renforce" &&
    policy.allowedModels.length > 0 &&
    !modelMatches(policy.allowedModels, destination.model)
  ) {
    return deny(version, RULE.modelNotAllowed, "model_not_allowed");
  }

  if (policy.blockAttachments && intent.kinds.includes("attachment"))
    return deny(version, RULE.attachmentBlocked, "attachment_blocked");

  if (intent.content === undefined || intent.content === "")
    return {
      decision: { decision: "allow", policyVersion: version },
      detected: [],
      maskedCount: 0,
    };

  const inspected = [...policy.maskCategories, ...policy.denyCategories];
  const matches = findMatches(intent.content, inspected);
  const refused = matches.find((m) =>
    policy.denyCategories.includes(m.category),
  );
  if (refused)
    return {
      ...deny(version, RULE.deny(refused.category), "sensitive_data"),
      detected: [refused.category],
    };
  if (matches.length === 0)
    return {
      decision: { decision: "allow", policyVersion: version },
      detected: [],
      maskedCount: 0,
    };

  const parts: string[] = [];
  let cursor = 0;
  for (const m of matches) {
    parts.push(
      intent.content.slice(cursor, m.start),
      CATEGORY_TOKEN[m.category],
    );
    cursor = m.end;
  }
  parts.push(intent.content.slice(cursor));
  const detected = [...new Set(matches.map((m) => m.category))];
  return {
    decision: {
      decision: "mask",
      policyVersion: version,
      content: parts.join(""),
      ruleIds: detected.map(RULE.mask),
    },
    detected,
    maskedCount: matches.length,
  };
}

export interface PrivacyRouterDeps {
  db: () => Database;
  journal: PrivacyJournal;
  log: Logger;
  now: () => Date;
  /** Durée de conservation d'une politique lue (ms) ; 0 = relue à chaque évaluation. */
  cacheTtlMs: number;
}

export interface ManagedPrivacyRouter extends PrivacyRouter {
  /** Oublie la politique en cache (une organisation, ou toutes) : à appeler après un enregistrement. */
  invalidate(organizationId?: string): void;
}

const MAX_CACHED_ORGANIZATIONS = 5000;
const DEFAULT_LOADED: Loaded = {
  valid: true,
  policy: DEFAULT_POLICY,
  version: DEFAULT_POLICY_VERSION,
};

export function createPrivacyRouter(
  deps: PrivacyRouterDeps,
): ManagedPrivacyRouter {
  const cache = new Map<string, { expiresAt: number; loaded: Loaded }>();

  async function load(organizationId: string): Promise<Loaded> {
    const nowMs = deps.now().getTime();
    const hit = cache.get(organizationId);
    if (hit && hit.expiresAt > nowMs) return hit.loaded;
    const stored = await loadCurrentPolicy(deps.db(), organizationId);
    let loaded: Loaded = DEFAULT_LOADED;
    if (stored) {
      const parsed = parsePolicyConfig(stored.config);
      loaded = parsed.success
        ? {
            valid: true,
            policy: resolvePolicy(stored.level, parsed.data),
            version: stored.version,
          }
        : { valid: false, version: stored.version };
    }
    if (deps.cacheTtlMs > 0) {
      if (cache.size >= MAX_CACHED_ORGANIZATIONS) cache.clear();
      cache.set(organizationId, {
        expiresAt: nowMs + deps.cacheTtlMs,
        loaded,
      });
    }
    return loaded;
  }

  return {
    invalidate(organizationId) {
      if (organizationId) cache.delete(organizationId);
      else cache.clear();
    },
    async evaluate(intent) {
      let outcome: Outcome;
      let version: number;
      try {
        if (!intent.organizationId) throw new Error("organisation absente");
        const loaded = await load(intent.organizationId);
        version = loaded.version;
        outcome = decide(loaded, intent);
      } catch (error) {
        // Échec fermé : on ne sait pas décider, donc rien ne sort. Le message d'erreur n'est pas journalisé
        // (il pourrait citer une valeur).
        deps.log.error("Privacy Router : décision impossible", {
          errorName: error instanceof Error ? error.name : typeof error,
          organizationId: intent.organizationId,
        });
        throw new PrivacyRouterUnavailableError();
      }
      const d = outcome.decision;
      const destination =
        "host" in intent.destination
          ? intent.destination.host.trim().toLowerCase().replace(/\.$/, "")
          : intent.destination.model;
      const event: PrivacyEventInput = {
        organizationId: intent.organizationId,
        apiKeyId: intent.apiKeyId,
        product: intent.product,
        operation: intent.operation,
        decision: d.decision,
        ruleIds:
          d.decision === "mask"
            ? d.ruleIds
            : d.decision === "deny"
              ? [d.ruleId]
              : [],
        policyVersion: version,
        destination: destination.slice(0, 253),
        destinationKind: "host" in intent.destination ? "host" : "model",
        dataKinds: intent.kinds,
        detected: outcome.detected,
        maskedCount: outcome.maskedCount,
        denyReason: d.decision === "deny" ? d.reason : null,
      };
      await deps.journal.record(event);
      return d;
    },
  };
}
