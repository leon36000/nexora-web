import type { PublicModel } from "@/server/gateway/public";

/**
 * Équivalent d'un nombre de crédits en jetons, pour la page Tarifs. 1 crédit = 1 ¢ CA de jetons au prix du catalogue
 * (conception du 30/10/2026) : tout est calculé depuis les prix de vente PUBLIÉS du catalogue (coût amont × taux de
 * change approuvé + marge, déjà inclus dans ces prix). Rien n'est saisi à la main, rien n'est inventé.
 */
const MICRO_PER_CREDIT = 10_000n;
const PER_MILLION = 1_000_000n;

/** Prix décimal du catalogue (« 0.30855 », CAD par million de jetons) -> micro-CAD ; null s'il est illisible ou nul. */
export function perMillionToMicro(value: string): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) return null;
  const frac = (m[2] ?? "").slice(0, 6).padEnd(6, "0");
  const micro = BigInt(m[1] as string) * PER_MILLION + BigInt(frac);
  return micro > 0n ? micro : null;
}

/** Jetons (entiers, arrondis vers le bas) qu'achètent `credits` crédits au prix donné en micro-CAD par million. */
export function tokensForCredits(
  credits: number,
  pricePerMillionMicro: bigint,
): number {
  if (credits <= 0 || pricePerMillionMicro <= 0n) return 0;
  return Number(
    (BigInt(credits) * MICRO_PER_CREDIT * PER_MILLION) / pricePerMillionMicro,
  );
}

export interface CreditEquivalent {
  id: string;
  name: string;
  /** Jetons d'entrée (invite) pour le nombre de crédits demandé. */
  inputTokens: number;
  /** Jetons de sortie (réponse) pour le même nombre de crédits. */
  outputTokens: number;
  /** Vrai si le modèle est en aperçu : son prix est un prix de développement, non définitif. */
  preview: boolean;
}

/**
 * Quelques modèles de discussion appelables du catalogue avec leur équivalent en jetons : le moins cher, le plus cher,
 * le modèle par défaut (s'il existe) puis des intermédiaires, au plus `max`, triés du moins cher au plus cher
 * (prix de sortie). Écarte les modèles d'une autre nature et les prix illisibles ou nuls, ainsi que les aperçus sauf si
 * `includePreview` est vrai (ils sont alors marqués `preview: true`).
 */
export function creditEquivalents(
  models: readonly PublicModel[],
  options: {
    credits: number;
    max: number;
    defaultId?: string;
    includePreview?: boolean;
  },
): CreditEquivalent[] {
  const priced = models.flatMap((m) => {
    if (m.kind !== "chat") return [];
    if (
      m.availability !== "live" &&
      !(options.includePreview && m.availability === "preview")
    )
      return [];
    const input = perMillionToMicro(m.inputPerMillion);
    const output = perMillionToMicro(m.outputPerMillion);
    if (input === null || output === null) return [];
    return [{ m, input, output }];
  });
  priced.sort((a, b) =>
    a.output === b.output
      ? a.m.id.localeCompare(b.m.id)
      : a.output < b.output
        ? -1
        : 1,
  );
  const picked = new Set<number>();
  const take = (i: number) => {
    if (i >= 0 && i < priced.length && picked.size < options.max) picked.add(i);
  };
  take(0);
  take(priced.length - 1);
  take(priced.findIndex((p) => p.m.id === options.defaultId));
  // Intermédiaires : à chaque tour, le modèle le plus éloigné de ceux déjà retenus (couvre l'étendue des prix).
  const want = Math.min(options.max, priced.length);
  while (picked.size < want) {
    let best = -1;
    let bestGap = -1;
    for (let i = 0; i < priced.length; i++) {
      if (picked.has(i)) continue;
      const gap = Math.min(...[...picked].map((j) => Math.abs(i - j)));
      if (gap > bestGap) {
        best = i;
        bestGap = gap;
      }
    }
    picked.add(best);
  }
  return [...picked]
    .sort((a, b) => a - b)
    .map((i) => {
      const p = priced[i] as (typeof priced)[number];
      return {
        id: p.m.id,
        name: p.m.name,
        inputTokens: tokensForCredits(options.credits, p.input),
        outputTokens: tokensForCredits(options.credits, p.output),
        preview: p.m.availability === "preview",
      };
    });
}
