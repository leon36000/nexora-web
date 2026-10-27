export interface BackoffOptions {
  baseMs: number;
  maxMs: number;
  /** Retourne un nombre dans [0, 1] ; le délai est multiplié par cette valeur (gigue). */
  jitter?: () => number;
}

/** Délai avant la reprise après l'échec numéro `attempt` (1 = premier échec) : base × 2^(n-1), plafonné. */
export function backoffDelayMs(
  attempt: number,
  options: BackoffOptions,
): number {
  const exponential = options.baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(options.maxMs, exponential);
  const factor = options.jitter ? options.jitter() : 1;
  return Math.round(capped * Math.min(1, Math.max(0, factor)));
}
