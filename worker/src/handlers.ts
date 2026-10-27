import { HandlerRegistry } from "./registry.ts";

/** Gestionnaires livrés au jalon S1 : seulement le contrôle de vie. Les autres arrivent avec S4–S8. */
export function defaultRegistry(): HandlerRegistry {
  return new HandlerRegistry().register("system.ping", async (_job, ctx) => {
    ctx.log.info("pong");
  });
}
