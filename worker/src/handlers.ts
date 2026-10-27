import type { Database } from "@nexora/db";
import { createNotifyHandler, mailerFromEnv } from "./contact-notify.ts";
import { HandlerRegistry } from "./registry.ts";

/**
 * Gestionnaires du worker : contrôle de vie (S1) et notification des demandes de contact (S3).
 * Les types qui exigent la base ne sont enregistrés que si `db` est fourni.
 */
export function defaultRegistry(deps: { db?: Database } = {}): HandlerRegistry {
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
  return registry;
}
