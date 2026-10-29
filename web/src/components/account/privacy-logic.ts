import type { PrivacyLevel } from "@nexora/db";
import {
  DETECTOR_CATEGORIES,
  type DetectorCategory,
} from "@/server/privacy/detectors";
import type { PrivacyView } from "@/server/privacy/view";

/**
 * Logique pure du formulaire de confidentialité : passage entre la vue de l'API et l'état des champs. Les listes
 * se saisissent une entrée par ligne.
 */

export interface PrivacyDraft {
  level: PrivacyLevel;
  mask: Record<DetectorCategory, boolean>;
  deny: Record<DetectorCategory, boolean>;
  allowedModels: string;
  allowedHosts: string;
  blockedHosts: string;
  blockAttachments: boolean;
  /** L'utilisateur a coché ou décoché la case : un changement de niveau ne la règle plus. */
  attachmentsTouched: boolean;
}

export function linesToList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const entry = line.trim();
    if (entry && !out.includes(entry)) out.push(entry);
  }
  return out;
}

const record = (value: (c: DetectorCategory) => boolean) =>
  Object.fromEntries(DETECTOR_CATEGORIES.map((c) => [c, value(c)])) as Record<
    DetectorCategory,
    boolean
  >;

export function draftFromView(view: PrivacyView): PrivacyDraft {
  const masked = new Set(view.config.maskCategories);
  const denied = new Set(view.config.denyCategories);
  return {
    level: view.level,
    // Un genre refusé reste coché : refuser suppose de le reconnaître.
    mask: record((c) => masked.has(c) || denied.has(c)),
    deny: record((c) => denied.has(c)),
    allowedModels: view.config.allowedModels.join("\n"),
    allowedHosts: view.config.allowedHosts.join("\n"),
    blockedHosts: view.config.blockedHosts.join("\n"),
    blockAttachments: view.config.blockAttachments,
    attachmentsTouched: false,
  };
}

export function requestFromDraft(draft: PrivacyDraft) {
  const mask = DETECTOR_CATEGORIES.filter(
    (c) => c === "secret" || draft.mask[c],
  );
  return {
    level: draft.level,
    config: {
      maskCategories: mask,
      denyCategories: DETECTOR_CATEGORIES.filter(
        (c) => c !== "secret" && draft.mask[c] && draft.deny[c],
      ),
      allowedHosts: linesToList(draft.allowedHosts),
      blockedHosts: linesToList(draft.blockedHosts),
      allowedModels: linesToList(draft.allowedModels),
      blockAttachments: draft.blockAttachments,
    },
  };
}

/** Nouveau niveau : les pièces jointes suivent le défaut du niveau tant que l'utilisateur n'a pas choisi. */
export function withLevel(
  draft: PrivacyDraft,
  level: PrivacyLevel,
): PrivacyDraft {
  return {
    ...draft,
    level,
    blockAttachments: draft.attachmentsTouched
      ? draft.blockAttachments
      : level !== "standard",
  };
}
