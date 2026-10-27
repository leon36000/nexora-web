import type { VaultKind } from "@nexora/db";

/**
 * Portée d'un secret : où une clé du coffre peut être ENVOYÉE. Les clés partent en en-tête d'autorisation vers des
 * adresses saisies dans l'administration (fournisseurs, instances WorkStudio, serveurs Proxmox) ; sans portée, un
 * administrateur pourrait désigner « stripe.secret_key » comme clé d'un fournisseur et la faire parvenir à son
 * propre serveur par « Tester le fournisseur » (le coffre ne relit jamais une clé, mais il peut l'utiliser).
 */
export type SecretScope = "model-provider" | "workstudio-instance" | "proxmox";

const KINDS: Record<SecretScope, readonly VaultKind[]> = {
  "model-provider": ["llm_provider"],
  "workstudio-instance": ["llm_provider", "other"],
  proxmox: ["proxmox"],
};

/** Secrets de la plateforme (dont la clé SSH du worker, `vps.*`) : jamais envoyés vers une adresse saisie. */
const RESERVED_REF = /^(stripe|site-agent|seo|directus|vps)[._-]/;

/** null si l'usage est permis, sinon un motif (sans valeur de secret). `kind` null : secret pas encore déposé. */
export function secretScopeProblem(
  scope: SecretScope,
  ref: string,
  kind: VaultKind | null,
): string | null {
  if (RESERVED_REF.test(ref))
    return "référence réservée à la plateforme : elle ne peut pas servir d'identifiant vers une adresse saisie";
  if (kind !== null && !KINDS[scope].includes(kind))
    return `ce secret est de type « ${kind} » : usage refusé ici (types admis : ${KINDS[scope].join(", ")})`;
  return null;
}
