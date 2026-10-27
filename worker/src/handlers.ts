import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { EngineDeps } from "@nexora/vps";
import {
  createSiteAgentRunHandler,
  productionRunnerDeps,
} from "./agents/index.ts";
import { createNotifyHandler, mailerFromEnv } from "./contact-notify.ts";
import { HandlerRegistry } from "./registry.ts";
import { registerSeoHandlers } from "./seo/handlers.ts";
import { registerVpsHandlers } from "./vps-handlers.ts";

/**
 * Gestionnaires du worker : contrôle de vie (S1), notification des demandes de contact (S3) et
 * VPS (S6). Les types qui exigent la base ne sont enregistrés que si `db` est fourni ; ceux du VPS
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
  return registry;
}
