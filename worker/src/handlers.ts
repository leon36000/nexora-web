import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { EngineDeps } from "@nexora/vps";
import {
  createSiteAgentRunHandler,
  productionRunnerDeps,
} from "./agents/index.ts";
import { registerBalanceAlertHandler } from "./balance-alerts.ts";
import { createNotifyHandler, mailerFromEnv } from "./contact-notify.ts";
import { registerLedgerHandlers } from "./ledger-handlers.ts";
import { HandlerRegistry } from "./registry.ts";
import { registerSeoHandlers } from "./seo/handlers.ts";
import { registerVpsHandlers } from "./vps-handlers.ts";
import { registerWebpilotHandlers } from "./webpilot/handlers.ts";

/**
 * Gestionnaires du worker : contrôle de vie (S1), notification des demandes de contact (S3),
 * VPS (S6) et tâches périodiques du grand livre (libération des réservations perdues, expiration). Les types qui exigent la base ne sont enregistrés que si `db` est fourni ; ceux du VPS
 * seulement si le moteur est configuré (clé maîtresse du coffre).
 */
export function defaultRegistry(
  deps: { db?: Database; log?: Logger; vps?: EngineDeps | null } = {},
): HandlerRegistry {
  const registry = new HandlerRegistry().register(
    "system.ping",
    async (_job, ctx) => {
      ctx.log.info("pong");
    },
  );
  if (deps.db)
    registry.register(
      "contact.notify",
      createNotifyHandler({ db: deps.db, mailer: mailerFromEnv() }),
    );
  if (deps.vps)
    registerVpsHandlers(registry, deps.vps, {
      mailer: mailerFromEnv(),
      alertTo: process.env.VPS_ALERT_TO ?? process.env.CONTACT_NOTIFY_TO,
      alertFrom: process.env.SMTP_FROM,
    });
  if (deps.db && deps.log)
    registry.register(
      "site-agent.run",
      createSiteAgentRunHandler(productionRunnerDeps(deps.db, deps.log)),
    );
  if (deps.db && deps.log)
    registerSeoHandlers(registry, { db: deps.db, log: deps.log });
  if (deps.db && deps.log)
    registerLedgerHandlers(registry, { db: deps.db, log: deps.log });
  if (deps.db && deps.log)
    registerBalanceAlertHandler(registry, {
      db: deps.db,
      log: deps.log,
      mailer: mailerFromEnv(),
      from: process.env.SMTP_FROM?.trim() || "site@nexora.dev",
      siteUrl: process.env.SITE_URL?.trim() || "http://localhost:3500",
    });
  if (deps.db && deps.log)
    registerWebpilotHandlers(registry, { db: deps.db, log: deps.log });
  return registry;
}
