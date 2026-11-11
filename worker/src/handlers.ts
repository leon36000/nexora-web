import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { EngineDeps } from "@nexora/vps";
import {
  createSiteAgentRunHandler,
  productionRunnerDeps,
} from "./agents/index.ts";
import { registerBalanceAlertHandler } from "./balance-alerts.ts";
import { type CodeSweepDeps, registerCodeHandlers } from "./code/handlers.ts";
import { createNotifyHandler, mailerFromEnv } from "./contact-notify.ts";
import { registerLedgerHandlers } from "./ledger-handlers.ts";
import { indexClientFromEnv, registerRagHandlers } from "./rag/handlers.ts";
import {
  reconcileSourcesFromEnv,
  registerReconcileHandlers,
} from "./reconcile-handlers.ts";
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
  deps: {
    db?: Database;
    log?: Logger;
    vps?: EngineDeps | null;
    /** Nexora Code hébergé : pilote, client du site, image (voir code/handlers.ts) ; `null` : balayage désactivé. */
    code?: Omit<CodeSweepDeps, "db" | "log"> | null;
  } = {},
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
  if (deps.db && deps.log) {
    // Réconciliation quotidienne avec l'amont (audit de facturation) : sources selon l'environnement, alerte par courriel.
    const mailer = mailerFromEnv();
    const to = process.env.VPS_ALERT_TO ?? process.env.CONTACT_NOTIFY_TO;
    const from = process.env.SMTP_FROM?.trim() || "site@nexora.dev";
    registerReconcileHandlers(registry, {
      db: deps.db,
      log: deps.log,
      ...reconcileSourcesFromEnv(deps.db, deps.log),
      notify:
        mailer && to
          ? (subject, text) =>
              mailer.send({ from, to, replyTo: from, subject, text })
          : undefined,
    });
  }
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
  if (deps.db && deps.log && deps.code)
    registerCodeHandlers(registry, {
      ...deps.code,
      db: deps.db,
      log: deps.log,
    });
  if (deps.db && deps.log) {
    const index = indexClientFromEnv(process.env);
    if (!index)
      deps.log.warn(
        "RAG : NEXORA_APP_INTERNAL_URL ou NEXORA_APP_ADMIN_TOKEN absent, les gros documents resteront en file",
      );
    registerRagHandlers(registry, { db: deps.db, log: deps.log, index });
  }
  return registry;
}
