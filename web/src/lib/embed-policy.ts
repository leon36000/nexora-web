import { embedAppliesTo, embedCsp } from "./workstudio-embed";

/**
 * Politique de sécurité (CSP) des pages qui accueillent la bulle WorkStudio. Le réglage est lu dans la base `app`
 * (via le proxy) avec un cache mémoire court : un changement d'administrateur s'applique en quelques secondes. Sans
 * bulle active, ou en cas d'erreur de lecture, AUCUN en-tête n'est ajouté (la bulle est alors absente aussi : la
 * page lit le même réglage).
 */

export interface EmbedPolicySource {
  origin: string;
  pages: string[];
}

const TTL_MS = 10_000;
let cache: { at: number; value: EmbedPolicySource | null } | null = null;

async function loadEmbedPolicySource(): Promise<EmbedPolicySource | null> {
  const { getDb } = await import("@/server/db");
  const { getEmbedSettings } = await import("@/server/agents/catalog");
  const s = await getEmbedSettings(getDb());
  return s.enabled && s.origin && s.pages.length > 0
    ? { origin: s.origin, pages: s.pages }
    : null;
}

export async function embedCspFor(
  pathname: string,
  options: {
    load?: () => Promise<EmbedPolicySource | null>;
    now?: number;
    dev?: boolean;
  } = {},
): Promise<string | null> {
  const now = options.now ?? Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    try {
      cache = {
        at: now,
        value: await (options.load ?? loadEmbedPolicySource)(),
      };
    } catch {
      cache = { at: now, value: null };
    }
  }
  const source = cache.value;
  if (!source || !embedAppliesTo(source.pages, pathname)) return null;
  return embedCsp(source.origin, { dev: options.dev });
}

/** Pour les tests. */
export function resetEmbedPolicyCache(): void {
  cache = null;
}
