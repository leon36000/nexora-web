import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Plans d'abonnement (collection Directus `subscription_plans`, publiés seulement).
 *
 * La collection n'existe pas encore dans le schéma Directus (propriétaire : l'orchestrateur) ; le
 * diff proposé est dans le compte rendu du jalon S4. En attendant, `FakePlanSource` sert les tests
 * et ce lecteur est isolé derrière l'interface `PlanSource`.
 *
 * Sans licence Open Innovation Grant, Directus renvoie aussi les brouillons au jeton de lecture :
 * le filtre `status = published` est donc appliqué dans la requête ET une seconde fois ici.
 */
export interface PlanTranslation {
  name: string;
  description: string | null;
  features: string[];
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  kind: string;
  interval: "month" | "year";
  /** Prix récurrent avant taxes, en cents CAD. Toujours > 0. */
  priceCents: number;
  /** Crédits offerts à chaque période payée, en cents CAD (0 = aucun). */
  includedCreditsCents: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
  /** Par code de langue BCP 47 (fr-CA, en-CA). */
  translations: Record<string, PlanTranslation>;
}

export interface PlanSource {
  listPublished(): Promise<SubscriptionPlan[]>;
  getByCode(code: string): Promise<SubscriptionPlan | null>;
  getByPriceId(priceId: string): Promise<SubscriptionPlan | null>;
}

const rowSchema = z.object({
  id: z.string(),
  code: z.string().min(1),
  kind: z.string().default("other"),
  status: z.string(),
  interval: z.enum(["month", "year"]),
  price_cents: z.number().int().positive(),
  included_credits_cents: z.number().int().min(0).nullish(),
  stripe_product_id: z.string().nullish(),
  stripe_price_id: z.string().nullish(),
  translations: z
    .array(
      z.object({
        languages_code: z.string(),
        name: z.string().nullish(),
        description: z.string().nullish(),
        features: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
});

/** Version de configuration d'un plan : change avec le prix, la période et les crédits inclus. */
export function planConfigVersion(
  plan: Pick<
    SubscriptionPlan,
    "code" | "interval" | "priceCents" | "includedCreditsCents"
  >,
): string {
  const canonical = JSON.stringify([
    plan.code,
    plan.interval,
    plan.priceCents,
    plan.includedCreditsCents,
  ]);
  return `plan_${createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

export interface DirectusPlanConfig {
  baseUrl: string;
  /** Jeton « Lecteur site » (DIRECTUS_READER_TOKEN). */
  token: string;
  fetch?: typeof fetch;
}

const FIELDS = [
  "id",
  "code",
  "kind",
  "status",
  "interval",
  "price_cents",
  "included_credits_cents",
  "stripe_product_id",
  "stripe_price_id",
  "sort",
  "translations.languages_code",
  "translations.name",
  "translations.description",
  "translations.features",
].join(",");

export function createDirectusPlanSource(
  config: DirectusPlanConfig,
): PlanSource {
  const doFetch = config.fetch ?? fetch;

  async function load(): Promise<SubscriptionPlan[]> {
    const url = `${config.baseUrl.replace(/\/+$/, "")}/items/subscription_plans?filter[status][_eq]=published&sort=sort&limit=200&fields=${FIELDS}`;
    let response: Response;
    try {
      response = await doFetch(url, {
        headers: { authorization: `Bearer ${config.token}` },
        cache: "no-store",
      });
    } catch (error) {
      // Le message d'origine pourrait citer l'en-tête : on ne garde que le nom.
      throw new Error(
        `Directus injoignable (${error instanceof Error ? error.name : "erreur"})`,
      );
    }
    if (!response.ok)
      throw new Error(
        `Directus a répondu ${response.status} (plans d'abonnement)`,
      );
    const body = (await response.json()) as { data?: unknown[] };
    const plans: SubscriptionPlan[] = [];
    for (const raw of body.data ?? []) {
      // Second filtre : un brouillon ne passe jamais, même si Directus l'a renvoyé.
      if ((raw as { status?: unknown })?.status !== "published") continue;
      const parsed = rowSchema.safeParse(raw);
      if (!parsed.success) continue; // prix absent ou nul, période inconnue… jamais publié « à 0 $ »
      const r = parsed.data;
      plans.push({
        id: r.id,
        code: r.code,
        kind: r.kind,
        interval: r.interval,
        priceCents: r.price_cents,
        includedCreditsCents: r.included_credits_cents ?? 0,
        stripeProductId: r.stripe_product_id ?? null,
        stripePriceId: r.stripe_price_id ?? null,
        translations: Object.fromEntries(
          (r.translations ?? []).map((t) => [
            t.languages_code,
            {
              name: t.name ?? r.code,
              description: t.description ?? null,
              features: t.features ?? [],
            },
          ]),
        ),
      });
    }
    return plans;
  }

  return {
    listPublished: load,
    async getByCode(code) {
      return (await load()).find((p) => p.code === code) ?? null;
    },
    async getByPriceId(priceId) {
      return (await load()).find((p) => p.stripePriceId === priceId) ?? null;
    },
  };
}

/** Source en mémoire : tests et développement tant que la collection Directus n'existe pas. */
export class FakePlanSource implements PlanSource {
  private readonly plans: SubscriptionPlan[];
  constructor(plans: SubscriptionPlan[]) {
    this.plans = plans;
  }
  async listPublished() {
    return [...this.plans];
  }
  async getByCode(code: string) {
    return this.plans.find((p) => p.code === code) ?? null;
  }
  async getByPriceId(priceId: string) {
    return this.plans.find((p) => p.stripePriceId === priceId) ?? null;
  }
}

/** Source de production : Directus, avec DIRECTUS_URL et DIRECTUS_READER_TOKEN. */
export function planSourceFromEnv(
  env: Record<string, string | undefined> = process.env,
): PlanSource {
  const baseUrl = env.DIRECTUS_URL ?? "http://localhost:8456";
  const token = env.DIRECTUS_READER_TOKEN;
  if (!token) throw new Error("DIRECTUS_READER_TOKEN est absent");
  return createDirectusPlanSource({ baseUrl, token });
}

/** Source créée à la première lecture : un webhook d'achat de crédits n'exige pas Directus. */
export function lazyPlanSource(factory: () => PlanSource): PlanSource {
  let source: PlanSource | undefined;
  const get = () => {
    source ??= factory();
    return source;
  };
  return {
    listPublished: () => get().listPublished(),
    getByCode: (code) => get().getByCode(code),
    getByPriceId: (priceId) => get().getByPriceId(priceId),
  };
}
