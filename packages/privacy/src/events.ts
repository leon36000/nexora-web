import { type Database, privacyEvents } from "@nexora/db";
import type { Logger } from "@nexora/log";

/**
 * Journal des sorties de données : une ligne par évaluation, MÉTADONNÉES seulement (règles appliquées, version de
 * politique, hôte ou modèle visé, genres de données). Jamais le contenu, jamais un chemin ni une requête.
 *
 * Une panne du journal ne bloque jamais la requête du client (la décision est déjà prise) : l'erreur est
 * comptée et journalisée par son nom seulement, sans message (un message d'erreur de base de données peut citer
 * une valeur).
 */

export interface PrivacyEventInput {
  organizationId: string;
  apiKeyId: string | null;
  product: string;
  operation: string;
  decision: "allow" | "mask" | "deny";
  ruleIds: readonly string[];
  /** 0 = politique par défaut de Nexora. */
  policyVersion: number;
  destination: string | null;
  destinationKind: "host" | "model" | null;
  dataKinds: readonly string[];
  detected: readonly string[];
  maskedCount: number;
  denyReason: string | null;
}

export interface PrivacyJournal {
  /** N'échoue jamais. */
  record(event: PrivacyEventInput): Promise<void>;
  /** Nombre d'écritures du journal qui ont échoué depuis le démarrage. */
  failures(): number;
}

export function createPrivacyJournal(deps: {
  db: () => Database;
  log: Logger;
}): PrivacyJournal {
  let failures = 0;
  return {
    async record(event) {
      try {
        await deps
          .db()
          .insert(privacyEvents)
          .values({
            organizationId: event.organizationId,
            apiKeyId: event.apiKeyId,
            product: event.product,
            operation: event.operation,
            decision: event.decision,
            ruleIds: [...event.ruleIds],
            policyVersion: event.policyVersion,
            destination: event.destination,
            destinationKind: event.destinationKind,
            dataKinds: [...event.dataKinds],
            detected: [...event.detected],
            maskedCount: event.maskedCount,
            denyReason: event.denyReason,
          });
      } catch (error) {
        failures += 1;
        deps.log.error("Privacy Router : écriture du journal impossible", {
          errorName: error instanceof Error ? error.name : typeof error,
          failures,
          organizationId: event.organizationId,
          decision: event.decision,
        });
      }
    },
    failures: () => failures,
  };
}
