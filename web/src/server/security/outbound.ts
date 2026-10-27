import {
  checkOutboundUrl,
  type OutboundCheck,
  type OutboundOptions,
  policyFromEnv,
} from "@nexora/net";

/**
 * Garde des URL saisies dans l'administration (fournisseur de modèles, instance WorkStudio, serveur Proxmox).
 * Voir @nexora/net pour les règles ; le réseau interne est refusé en production sauf liste de l'opérateur
 * (NEXORA_OUTBOUND_ALLOW), les métadonnées du nuage et adresses réservées toujours.
 */
export type OutboundGuard = (
  raw: string,
  options?: OutboundOptions,
) => Promise<OutboundCheck>;

/** Garde par défaut : politique lue dans l'environnement à chaque appel. */
export const envOutboundGuard: OutboundGuard = (raw, options) =>
  checkOutboundUrl(raw, policyFromEnv(process.env), options);

/** Serveurs Proxmox : par nature sur le réseau de l'opérateur ; seuls lien local, métadonnées et réservées sont refusés. */
export const lanOutboundGuard: OutboundGuard = (raw, options) =>
  checkOutboundUrl(raw, { allowInternal: true, allow: [] }, options);
