import type { PublicModel } from "@/server/gateway/public";

const CAPABILITY_ORDER = [
  "tools",
  "vision",
  "reasoning",
  "streaming",
  "json_mode",
] as const;

/** Capacités déclarées par la fiche, dans un ordre stable. */
export function activeCapabilities(model: PublicModel) {
  return CAPABILITY_ORDER.filter((c) => model.capabilities[c] === true);
}
