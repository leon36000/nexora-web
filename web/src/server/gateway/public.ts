import type {
  ModelCapabilities,
  ModelKind,
  ModelSheet,
  Region,
} from "@nexora/db";
import { formatMicro } from "./pricing";
import type {
  CatalogSnapshot,
  SnapshotModel,
  SnapshotProvider,
} from "./snapshot";

/**
 * Vue PUBLIQUE d'un modèle publié : ce que le catalogue (/modeles, /v1/models) peut montrer. Ni
 * l'adresse du fournisseur, ni la référence du coffre, ni le coût amont, ni la marge n'en sortent.
 */
/** Plage horaire UTC où le prix baisse, en CAD par million de jetons (décimaux exacts). */
export interface PublicPriceWindow {
  label: string;
  days: number[];
  startMinute: number;
  endMinute: number;
  inputPerMillion: string;
  outputPerMillion: string;
  cachePerMillion: string | null;
}

export interface PublicModel {
  id: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  kind: ModelKind;
  contextMax: number;
  maxOutputTokens: number | null;
  capabilities: ModelCapabilities;
  residency: Region;
  /** `preview` : visible avec sa fiche et ses prix, mais pas encore appelable. */
  availability: "live" | "preview";
  providerName: string;
  dataPolicyFr: string;
  dataPolicyEn: string;
  /** Décimaux exacts, CAD par million de jetons. */
  inputPerMillion: string;
  outputPerMillion: string;
  cachePerMillion: string | null;
  /** Écriture du cache facturée à part (Kimi) ; null = au prix d'entrée. */
  cacheWritePerMillion: string | null;
  /** Plages horaires où le prix baisse ; vide = un seul prix. */
  priceWindows: PublicPriceWindow[];
  /** Fiche : licence, paramètres, mesures sourcées. Jamais de routage ni de coût amont. */
  sheet: ModelSheet;
  note: string;
  sunsetAt: string | null;
}

export function toPublicModel(
  model: SnapshotModel,
  provider: SnapshotProvider | undefined,
): PublicModel | null {
  if (!model.price) return null;
  return {
    id: model.publicId,
    name: model.name,
    descriptionFr: model.descriptionFr,
    descriptionEn: model.descriptionEn,
    kind: model.kind,
    contextMax: model.contextMax,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities,
    residency: model.residency,
    availability: model.availability ?? "live",
    providerName: provider?.name ?? "",
    dataPolicyFr: provider?.dataPolicyFr ?? "",
    dataPolicyEn: provider?.dataPolicyEn ?? "",
    inputPerMillion: formatMicro(BigInt(model.price.sellInputCadMicro)),
    outputPerMillion: formatMicro(BigInt(model.price.sellOutputCadMicro)),
    cachePerMillion:
      model.price.sellCacheCadMicro === null
        ? null
        : formatMicro(BigInt(model.price.sellCacheCadMicro)),
    cacheWritePerMillion:
      model.price.sellCacheWriteCadMicro == null
        ? null
        : formatMicro(BigInt(model.price.sellCacheWriteCadMicro)),
    priceWindows: (model.price.windows ?? []).map((w) => ({
      label: w.label,
      days: w.days,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
      inputPerMillion: formatMicro(BigInt(w.sell.input)),
      outputPerMillion: formatMicro(BigInt(w.sell.output)),
      cachePerMillion:
        w.sell.cache === null ? null : formatMicro(BigInt(w.sell.cache)),
    })),
    sheet: model.sheet ?? {},
    note: model.price.note,
    sunsetAt: model.sunsetAt,
  };
}

/** Modèles à lister publiquement : publiés, visibilité « public », non échus. */
export function publicModels(
  snapshot: CatalogSnapshot,
  now: Date = new Date(),
): PublicModel[] {
  const providers = new Map(snapshot.providers.map((p) => [p.id, p]));
  const out: PublicModel[] = [];
  for (const m of snapshot.models) {
    if (m.visibility !== "public") continue;
    if (m.sunsetAt && Date.parse(m.sunsetAt) <= now.getTime()) continue;
    const provider = providers.get(m.providerId);
    if (provider && !provider.enabled) continue;
    const view = toPublicModel(m, provider);
    if (view) out.push(view);
  }
  return out;
}
