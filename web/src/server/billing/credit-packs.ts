import { z } from "zod";

/**
 * Forfaits de recharge de crédits (collection Directus `credit_packs`, publiés seulement). 1 $ = 100 crédits, crédits sans
 * expiration. Jamais affiché sans prix valide : comme pour les offres, le filtre `status = published` est appliqué dans la
 * requête ET une seconde fois ici, et une ligne sans prix > 0 ou sans crédits est écartée (jamais « à 0 $ »).
 */
export interface CreditPack {
  code: string;
  /** Prix avant taxes, en cents CA. Toujours > 0. */
  priceCents: number;
  /** Crédits accordés (1 crédit = 1 ¢ CA). Toujours > 0. */
  credits: number;
}

export interface PackSource {
  listPublished(): Promise<CreditPack[]>;
}

const rowSchema = z.object({
  code: z.string().min(1),
  status: z.string(),
  price_cents: z.number().int().positive(),
  credits: z.number().int().positive(),
});

const FIELDS = "id,code,status,price_cents,credits,sort";

export interface DirectusPackConfig {
  baseUrl: string;
  /** Jeton « Lecteur site » (DIRECTUS_READER_TOKEN). */
  token: string;
  fetch?: typeof fetch;
}

export function createDirectusPackSource(
  config: DirectusPackConfig,
): PackSource {
  const doFetch = config.fetch ?? fetch;
  return {
    async listPublished() {
      const url = `${config.baseUrl.replace(/\/+$/, "")}/items/credit_packs?filter[status][_eq]=published&sort=sort&limit=50&fields=${FIELDS}`;
      let response: Response;
      try {
        response = await doFetch(url, {
          headers: { authorization: `Bearer ${config.token}` },
          cache: "no-store",
        });
      } catch (error) {
        throw new Error(
          `Directus injoignable (${error instanceof Error ? error.name : "erreur"})`,
        );
      }
      if (!response.ok)
        throw new Error(
          `Directus a répondu ${response.status} (forfaits de recharge)`,
        );
      const body = (await response.json()) as { data?: unknown[] };
      const packs: CreditPack[] = [];
      for (const raw of body.data ?? []) {
        if ((raw as { status?: unknown })?.status !== "published") continue;
        const parsed = rowSchema.safeParse(raw);
        if (!parsed.success) continue;
        packs.push({
          code: parsed.data.code,
          priceCents: parsed.data.price_cents,
          credits: parsed.data.credits,
        });
      }
      return packs;
    },
  };
}

/** Source de production : Directus, avec DIRECTUS_URL et DIRECTUS_READER_TOKEN. */
export function packsFromEnv(
  env: Record<string, string | undefined> = process.env,
): PackSource {
  const token = env.DIRECTUS_READER_TOKEN;
  if (!token) throw new Error("DIRECTUS_READER_TOKEN est absent");
  return createDirectusPackSource({
    baseUrl: env.DIRECTUS_URL ?? "http://localhost:8456",
    token,
  });
}
