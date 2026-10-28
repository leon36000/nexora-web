import {
  type Database,
  expireAllDue,
  grantDueTranches,
  releaseStaleReservations,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { HandlerRegistry } from "./registry.ts";

/**
 * Tâches périodiques du grand livre de crédits (D1/D7), déclarées par le planificateur :
 *
 * - `ledger.release-stale` (toutes les 10 minutes) : libère les réservations ouvertes depuis plus longtemps que
 *   `staleReservationAfterMs` (requête perdue : arrêt du serveur entre la réservation et le règlement). Le montant
 *   redevient disponible et la part retenue sur le plafond de la clé API est rendue.
 * - `ledger.grant-tranches` (une fois par heure) : verse les douzièmes mensuels des crédits inclus des offres annuelles à
 *   leur échéance (un abonnement terminé n'en reçoit plus, un abonnement impayé attend).
 * - `ledger.expire` (une fois par jour) : expire les crédits échus et non consommés (12 mois), pour toutes les
 *   organisations.
 *
 * Chaque tâche est idempotente : la file peut la rejouer, deux workers ne la font jamais deux fois par occurrence.
 */

/** Version de configuration inscrite sur les écritures d'expiration faites par le worker. */
export const EXPIRY_CONFIG_VERSION = "worker-expiration-v1";

const MINUTE = 60_000;
/** Plancher du délai de libération. */
const MIN_STALE_AFTER_MS = 30 * MINUTE;
/** Marge ajoutée à la durée maximale d'un flux. */
const STREAM_MARGIN_MS = 15 * MINUTE;
const DEFAULT_STREAM_TIMEOUT_MS = 900_000;

/**
 * Âge à partir duquel une réservation ouverte est tenue pour perdue. Il DOIT dépasser la durée maximale d'un flux
 * (`GATEWAY_STREAM_TIMEOUT_MS`, 900 s par défaut) avec une marge : sinon le règlement d'un long flux arriverait
 * après la libération. Un tel règlement tardif reste facturé au coût réel (écriture « overage »), mais on évite de
 * prêter le disponible pendant qu'une requête légitime est encore en cours. 30 minutes au moins.
 */
export function staleReservationAfterMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.GATEWAY_STREAM_TIMEOUT_MS);
  const stream =
    Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STREAM_TIMEOUT_MS;
  return Math.max(MIN_STALE_AFTER_MS, stream + STREAM_MARGIN_MS);
}

export function registerLedgerHandlers(
  registry: HandlerRegistry,
  deps: {
    db: Database;
    log: Logger;
    now?: () => Date;
    staleAfterMs?: number;
  },
): HandlerRegistry {
  const now = deps.now ?? (() => new Date());
  registry.register("ledger.release-stale", async () => {
    const afterMs = deps.staleAfterMs ?? staleReservationAfterMs();
    const released = await releaseStaleReservations(deps.db, {
      olderThan: new Date(now().getTime() - afterMs),
    });
    if (released > 0)
      deps.log.warn("grand livre : réservations perdues libérées", {
        released,
        afterMs,
      });
  });
  registry.register("ledger.grant-tranches", async () => {
    const out = await grantDueTranches(deps.db, { now: now() });
    if (out.granted + out.canceled + out.waiting > 0)
      deps.log.info("grand livre : douzièmes des offres annuelles", { ...out });
  });
  registry.register("ledger.expire", async () => {
    const out = await expireAllDue(deps.db, {
      now: now(),
      configVersion: EXPIRY_CONFIG_VERSION,
    });
    deps.log.info("grand livre : expiration des crédits échus", {
      organizations: out.organizations,
      expiredMicro: out.expiredMicro.toString(),
    });
  });
  return registry;
}
