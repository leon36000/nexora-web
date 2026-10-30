import type { Database } from "@nexora/db";
import { loadOrgEntitlements } from "../billing/entitlements";
import { loadWallet } from "../billing/wallet";
import {
  type CreditsView,
  creditsView,
  type PlanView,
  type ProductHint,
  planView,
  productHints,
  type StorageView,
  storageView,
} from "./panel-data";
import {
  type ProductId,
  type ResolvedProduct,
  resolveProducts,
} from "./registry";

type PlanSubscriptionInput = Parameters<typeof planView>[1][number];

export interface ToolsHomeData {
  /** Crédits, espace et offre ; null quand les droits n'ont pas pu être lus (jamais de faux chiffres). */
  summary: {
    credits: CreditsView;
    storage: StorageView;
    plan: PlanView;
  } | null;
  products: ResolvedProduct[];
  hints: Partial<Record<ProductId, ProductHint>>;
  workstudioUrl: string | null;
}

/**
 * Données de la page « Mes outils » : les droits de l'organisation (`OrgEntitlements`, contrat du chantier A) mis en
 * forme, et les produits avec leur état réel. Une lecture de droits qui échoue ne casse pas la page : le résumé est
 * absent (la page le dit) et les produits restent affichés, sans rappels de crédits ni d'espace.
 */
export async function loadToolsHome(
  db: Database,
  organizationId: string,
  input: {
    env: Record<string, string | undefined>;
    /** Adresse sûre de l'instance WorkStudio, null tant qu'elle n'est pas connue. */
    workstudioOrigin: string | null;
    /** Organisation « maison » : accès gratuit, espace sans limite. */
    house: boolean;
    /** Compte à solde négatif (remboursement, litige). */
    blocked: boolean;
    subscriptions: readonly PlanSubscriptionInput[];
    now?: Date;
  },
  deps: { loadEntitlements?: typeof loadOrgEntitlements } = {},
): Promise<ToolsHomeData> {
  const now = input.now ?? new Date();
  const products = resolveProducts({
    env: input.env,
    workstudioUrl: input.workstudioOrigin,
  });
  const base = { products, workstudioUrl: input.workstudioOrigin };
  try {
    const [ent, wallet] = await Promise.all([
      (deps.loadEntitlements ?? loadOrgEntitlements)(db, organizationId, now),
      loadWallet(db, organizationId, now),
    ]);
    return {
      ...base,
      summary: {
        credits: creditsView(ent, {
          house: input.house,
          blocked: input.blocked,
          subscriptionExpiresAt: wallet.included?.expiresAt ?? null,
        }),
        storage: storageView(ent.storage, input.house),
        plan: planView(ent, input.subscriptions),
      },
      hints: productHints(products, ent, { free: input.house }),
    };
  } catch {
    return { ...base, summary: null, hints: {} };
  }
}
