import { createLogger } from "@nexora/log";

/** Journal structuré du site : JSON par ligne, champs sensibles masqués. */
export const log = createLogger({
  name: "web",
  level: process.env.LOG_LEVEL === "debug" ? "debug" : "info",
});
