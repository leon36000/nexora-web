import { PRIVACY_LEVELS, type PrivacyLevel } from "@nexora/db";
import { z } from "zod";
import { DETECTOR_CATEGORIES, type DetectorCategory } from "./detectors.ts";

/**
 * Politique de confidentialité d'une organisation : schémas zod, politique par défaut et correspondance des
 * hôtes et des modèles. Fonctions pures.
 *
 * Trois niveaux (la confidentialité est une propriété de Nexora, pas une option payante) :
 *  - `standard` (défaut) : les renseignements personnels évidents sont masqués avant l'envoi à un fournisseur d'IA ;
 *  - `renforce` : en plus, liste blanche d'hôtes et de modèles (si elle n'est pas vide) et pièces jointes bloquées ;
 *  - `souverain` : rien ne sort sauf ce qui est explicitement permis ; liste vide = tout est refusé (échec fermé).
 * Les hôtes et modèles interdits s'appliquent à tous les niveaux. Les secrets sont toujours masqués.
 */

export { PRIVACY_LEVELS, type PrivacyLevel };

const MAX_LIST = 200;

const categorySchema = z.enum(DETECTOR_CATEGORIES);

/** Hôte (sans schéma, port ni chemin) ou « *.domaine » pour les sous-domaines ; ASCII (IDN en punycode). */
const HOST_PATTERN =
  /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

const hostSchema = z
  .string()
  .max(253)
  .transform((value) => value.trim().toLowerCase().replace(/\.$/, ""))
  .refine((value) => HOST_PATTERN.test(value) && value !== "*", {
    message: "hôte invalide",
  });

/** Identifiant de modèle exact, ou préfixe terminé par « * ». */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}\*?$/;
const modelSchema = z
  .string()
  .max(130)
  .transform((value) => value.trim())
  .refine((value) => MODEL_PATTERN.test(value), { message: "modèle invalide" });

export const privacyConfigSchema = z
  .object({
    /** Genres à masquer ; absent = tous. Les secrets sont toujours masqués. */
    maskCategories: z
      .array(categorySchema)
      .max(DETECTOR_CATEGORIES.length)
      .optional(),
    /** Genres qui font REFUSER la requête au lieu d'être masqués. */
    denyCategories: z
      .array(categorySchema)
      .max(DETECTOR_CATEGORIES.length)
      .default([]),
    /** Renforcé et souverain : seuls ces hôtes peuvent recevoir des données. */
    allowedHosts: z.array(hostSchema).max(MAX_LIST).default([]),
    /** Tous les niveaux : ces hôtes ne reçoivent jamais rien. */
    blockedHosts: z.array(hostSchema).max(MAX_LIST).default([]),
    /** Renforcé et souverain : seuls ces modèles peuvent être appelés. */
    allowedModels: z.array(modelSchema).max(MAX_LIST).default([]),
    /** Pièces jointes : bloquées par défaut en renforcé et en souverain, permises en standard. */
    blockAttachments: z.boolean().optional(),
  })
  .strict();

export type PrivacyConfig = z.infer<typeof privacyConfigSchema>;
export type PrivacyConfigInput = z.input<typeof privacyConfigSchema>;

export function parsePolicyConfig(raw: unknown) {
  return privacyConfigSchema.safeParse(raw);
}

/** Politique effective, prête à être appliquée (valeurs par défaut du niveau résolues). */
export interface EffectivePolicy {
  level: PrivacyLevel;
  maskCategories: readonly DetectorCategory[];
  denyCategories: readonly DetectorCategory[];
  allowedHosts: readonly string[];
  blockedHosts: readonly string[];
  allowedModels: readonly string[];
  blockAttachments: boolean;
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

export function resolvePolicy(
  level: PrivacyLevel,
  config: PrivacyConfigInput | PrivacyConfig,
): EffectivePolicy {
  const deny = unique(config.denyCategories ?? []);
  const wanted = unique([
    ...(config.maskCategories ?? DETECTOR_CATEGORIES),
    // Une clé ou un secret ne doit jamais partir en clair, quel que soit le réglage.
    "secret" as const,
  ]);
  return {
    level,
    // Un genre refusé n'est pas masqué : la requête est rejetée avant. Les secrets restent masqués.
    maskCategories: wanted.filter((c) => c === "secret" || !deny.includes(c)),
    denyCategories: deny.filter((c) => c !== "secret"),
    allowedHosts: unique(config.allowedHosts ?? []),
    blockedHosts: unique(config.blockedHosts ?? []),
    allowedModels: unique(config.allowedModels ?? []),
    blockAttachments: config.blockAttachments ?? level !== "standard",
  };
}

/** Politique appliquée à une organisation qui n'en a pas choisi : « standard », jamais « tout permis ». */
export const DEFAULT_POLICY: EffectivePolicy = resolvePolicy("standard", {});

/** Version affichée de la politique par défaut (aucune ligne en base). */
export const DEFAULT_POLICY_VERSION = 0;

/** L'hôte correspond-il à l'un des motifs ? « exemple.ca » exact ; « *.exemple.ca » les sous-domaines seulement. */
export function hostMatches(
  patterns: readonly string[],
  host: string,
): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return patterns.some((pattern) =>
    pattern.startsWith("*.")
      ? h.endsWith(pattern.slice(1)) && h.length > pattern.length - 1
      : h === pattern,
  );
}

/** Le modèle correspond-il à l'un des motifs ? Identifiant exact, ou préfixe quand le motif se termine par « * ». */
export function modelMatches(
  patterns: readonly string[],
  model: string,
): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith("*")
      ? model.startsWith(pattern.slice(0, -1))
      : model === pattern,
  );
}
