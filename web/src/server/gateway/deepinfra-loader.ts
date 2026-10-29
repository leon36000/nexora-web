import {
  and,
  count,
  type Database,
  eq,
  type ModelAvailability,
  modelProviders,
  modelRoutes,
  models,
} from "@nexora/db";
import { canonicalJson } from "./canonical";
import {
  addPrice,
  approveVersion,
  CatalogError,
  createDraftVersion,
  createModel,
  createProvider,
  currentFx,
  currentPrice,
  DEFAULT_MARGIN_BPS,
  getModel,
  getPublishedCatalog,
  modelReadiness,
  type ProviderInput,
  publishVersion,
  updateModel,
} from "./catalog";
import type { ProblemKind, Source, SourceEntry } from "./deepinfra-source";

/**
 * Chargement du catalogue DeepInfra de Nexora AI (décision du fondateur du 29/10/2026 : DeepInfra héberge tous les
 * modèles). Piloté par des données (`deepinfra-source.ts`) : fournisseurs, modèles, fiches, prix de vente (amont +
 * marge de 10 %), mise en ligne par la chaîne officielle. Les modèles naissent en « aperçu » : visibles au catalogue
 * public avant que la clé de DeepInfra existe dans le Coffre. Rejouable.
 */

export const DEEPINFRA_PROVIDER: ProviderInput = {
  code: "deepinfra",
  name: "DeepInfra",
  type: "openai_compatible",
  baseUrl: "https://api.deepinfra.com/v1/openai",
  secretRef: "llm.deepinfra",
  // Région : la documentation de DeepInfra n'indique pas où les données sont traitées (lue le 29/10/2026).
  region: "autre",
  priority: 10,
  enabled: true,
  dataPolicyFr:
    "Hébergeur de tous les modèles de Nexora AI. Selon la documentation de DeepInfra (lue le 29 octobre 2026), les données envoyées à son API ne sont pas stockées sur disque : les entrées restent en mémoire le temps du calcul et les sorties sont effacées de la mémoire une fois envoyées (hors traitement par lots, que Nexora n'offre pas). DeepInfra n'entraîne pas de modèles avec ces données, sauf pour les modèles de Google ou d'Anthropic, où s'applique la politique de leur éditeur. La documentation n'indique pas le pays ou la région où les données sont traitées.",
  dataPolicyEn:
    "Host of all Nexora AI models. According to DeepInfra's documentation (read on October 29, 2026), data sent to its API is not stored on disk: inputs are held in memory during inference and outputs are deleted from memory once sent (batch processing excluded, which Nexora does not offer). DeepInfra does not train models on this data, except for Google or Anthropic models, where the model provider's own policy applies. The documentation does not state the country or region where data is processed.",
};

/** Route de secours future : désactivée tant qu'aucune clé n'y est déposée. */
export const OPENROUTER_PROVIDER: ProviderInput = {
  code: "openrouter",
  name: "OpenRouter",
  type: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1",
  secretRef: "llm.openrouter",
  region: "autre",
  priority: 50,
  enabled: false,
  dataPolicyFr:
    "Route de secours : les requêtes passent par OpenRouter, qui les transmet à un hébergeur tiers. Nos consignes de routage refusent les hébergeurs qui conservent ou réutilisent les données.",
  dataPolicyEn:
    "Fallback route: requests go through OpenRouter, which forwards them to a third-party host. Our routing rules exclude hosts that keep or reuse data.",
};

/** Fournisseurs directs du premier chargement (28/10/2026), remplacés par DeepInfra. */
export const DIRECT_PROVIDER_CODES = [
  "deepseek",
  "zai",
  "minimax",
  "moonshot",
] as const;

export interface LoadOptions {
  /** `preview` (défaut) : visible, pas appelable ; `live` : exige la clé de DeepInfra dans le Coffre pour publier. */
  availability?: ModelAvailability;
  /** Supprime les fournisseurs directs que plus aucun modèle ni route ne référence. */
  nettoyer?: boolean;
  now?: Date;
}

export interface LoadReport {
  /** Un taux de change USD → CAD approuvé existe. */
  fx: boolean;
  providers: { created: string[]; warnings: string[] };
  created: string[];
  /** Modèles déjà présents (autre fournisseur) rattachés à DeepInfra. */
  attached: string[];
  /** Modèles de DeepInfra dont la fiche a changé. */
  updated: string[];
  /** Modèles qui ont reçu une nouvelle version de prix. */
  priced: string[];
  retired: string[];
  /** Modèles mis de côté : fiche absente ou invalide, modèle retiré. */
  skipped: {
    publicId: string;
    kind: ProblemKind | "retire";
    message: string;
  }[];
  /** Modèles laissés en brouillon, avec ce qui manque. */
  drafts: { publicId: string; reasons: unknown[] }[];
  published: string[];
  version: {
    status: "published" | "unchanged" | "refused" | "none";
    short?: string;
    issues?: unknown[];
  };
  cleaned: { deleted: string[]; kept: { code: string; reason: string }[] };
}

async function ensureProvider(
  db: Database,
  spec: ProviderInput,
  report: LoadReport,
) {
  const [existing] = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.code, spec.code));
  if (existing) {
    if (!existing.enabled && spec.enabled !== false)
      report.providers.warnings.push(
        `le fournisseur « ${spec.code} » existe déjà et est désactivé : ses modèles ne seront pas publiables avant son activation`,
      );
    return existing;
  }
  report.providers.created.push(spec.code);
  return createProvider(db, spec);
}

const FICHE_FIELDS = [
  "name",
  "descriptionFr",
  "descriptionEn",
  "kind",
  "upstreamId",
  "contextMax",
  "maxOutputTokens",
  "capabilities",
  "residency",
  "sheet",
  "routing",
] as const;

function ficheFields(entry: SourceEntry) {
  return {
    name: entry.name,
    descriptionFr: entry.descriptionFr,
    descriptionEn: entry.descriptionEn,
    kind: entry.kind,
    upstreamId: entry.deepinfraId,
    contextMax: entry.contextMax,
    maxOutputTokens: entry.maxOutputTokens,
    capabilities: entry.capabilities,
    residency: "autre" as const,
    sheet: entry.sheet,
    // Aucune consigne de routage : elles ne servent qu'à OpenRouter.
    routing: {},
  };
}

export async function loadDeepinfraCatalog(
  db: Database,
  source: Source,
  options: LoadOptions = {},
): Promise<LoadReport> {
  const now = options.now ?? new Date();
  const availability = options.availability ?? "preview";
  const fx = await currentFx(db, now);
  const report: LoadReport = {
    fx: fx !== null,
    providers: { created: [], warnings: [] },
    created: [],
    attached: [],
    updated: [],
    priced: [],
    retired: [],
    skipped: source.problems.map((p) => ({
      publicId: p.subject,
      kind: p.kind,
      message: p.message,
    })),
    drafts: [],
    published: [],
    version: { status: "none" },
    cleaned: { deleted: [], kept: [] },
  };

  const deepinfra = await ensureProvider(db, DEEPINFRA_PROVIDER, report);
  await ensureProvider(db, OPENROUTER_PROVIDER, report);

  for (const entry of source.entries) {
    const [existing] = await db
      .select()
      .from(models)
      .where(eq(models.publicId, entry.publicId));
    if (existing?.status === "retired") {
      report.skipped.push({
        publicId: entry.publicId,
        kind: "retire",
        message:
          "modèle retiré : le réactiver est une décision de l'opérateur, pas du chargement",
      });
      continue;
    }
    const fields = ficheFields(entry);
    let id: string;
    if (!existing) {
      const created = await createModel(db, {
        publicId: entry.publicId,
        ...fields,
        providerId: deepinfra.id,
        visibility: "public",
        availability,
      });
      id = created.id;
      report.created.push(entry.publicId);
    } else {
      id = existing.id;
      const attaching = existing.providerId !== deepinfra.id;
      const differs =
        canonicalJson(FICHE_FIELDS.map((k) => existing[k])) !==
        canonicalJson(FICHE_FIELDS.map((k) => fields[k]));
      if (attaching || differs) {
        const patch = { ...fields, providerId: deepinfra.id };
        try {
          // La disponibilité n'est posée qu'au rattachement : un modèle déjà chez DeepInfra garde celle de l'opérateur.
          await updateModel(
            db,
            id,
            attaching ? { ...patch, availability } : patch,
            now,
          );
        } catch (error) {
          if (!(attaching && error instanceof CatalogError)) throw error;
          await updateModel(db, id, patch, now);
          report.drafts.push({
            publicId: entry.publicId,
            reasons: [error.details ?? error.message],
          });
        }
        (attaching ? report.attached : report.updated).push(entry.publicId);
      }
    }

    if (!fx) {
      report.drafts.push({
        publicId: entry.publicId,
        reasons: [
          "fx_missing : aucun taux de change approuvé, donc aucun prix",
        ],
      });
      continue;
    }
    const up = entry.upstream;
    const current = await currentPrice(db, id, now);
    const stale =
      !current ||
      current.upstreamInputUsdMicro !== up.input ||
      current.upstreamOutputUsdMicro !== up.output ||
      (current.upstreamCacheUsdMicro ?? null) !== up.cache ||
      current.upstreamCacheWriteUsdMicro !== null ||
      current.windows.length > 0;
    if (stale) {
      await addPrice(
        db,
        id,
        {
          upstreamInputUsdMicro: up.input,
          upstreamOutputUsdMicro: up.output,
          upstreamCacheUsdMicro: up.cache,
          marginBps: DEFAULT_MARGIN_BPS,
          marginFloorBps: DEFAULT_MARGIN_BPS,
          note: `Prix de DeepInfra lus le ${source.readAt}, marge de 10 %.`,
        },
        now,
      );
      report.priced.push(entry.publicId);
    }

    // Mise en ligne : approbation puis publication du modèle, seulement si la garde (clé comprise hors aperçu) est verte.
    const model = await getModel(db, id);
    if (model.status === "published") continue;
    const readiness = await modelReadiness(db, id, now);
    if (!readiness.ready) {
      report.drafts.push({
        publicId: entry.publicId,
        reasons: readiness.issues,
      });
      continue;
    }
    if (model.status === "draft")
      await updateModel(db, id, { status: "approved" }, now);
    await updateModel(db, id, { status: "published" }, now);
    report.published.push(entry.publicId);
  }

  // Retraits : les modèles du premier chargement absents de DeepInfra.
  const selected = new Set(source.entries.map((e) => e.publicId));
  for (const retrait of source.retraits) {
    if (selected.has(retrait.publicId)) {
      report.skipped.push({
        publicId: retrait.publicId,
        kind: "retire",
        message: "à la fois dans la sélection et dans les retraits : ignoré",
      });
      continue;
    }
    const [row] = await db
      .select()
      .from(models)
      .where(eq(models.publicId, retrait.publicId));
    if (!row || row.status === "retired") continue;
    await updateModel(
      db,
      row.id,
      {
        status: "retired",
        sheet: {
          ...row.sheet,
          notesFr: retrait.noteFr,
          notesEn: retrait.noteEn,
        },
      },
      now,
    );
    report.retired.push(retrait.publicId);
  }

  // Version du catalogue : chaîne officielle (brouillon, approbation, publication).
  if (fx) {
    const [published] = await db
      .select({ n: count() })
      .from(models)
      .where(eq(models.status, "published"));
    if ((published?.n ?? 0) > 0 || (await getPublishedCatalog(db))) {
      const draft = await createDraftVersion(db, now);
      if (draft.unchanged)
        report.version = { status: "unchanged", short: draft.version.short };
      else if (draft.issues.length > 0)
        report.version = { status: "refused", issues: draft.issues };
      else {
        try {
          await approveVersion(db, draft.version.id, now);
          const live = await publishVersion(db, draft.version.id, now);
          report.version = { status: "published", short: live.short };
        } catch (error) {
          if (!(error instanceof CatalogError)) throw error;
          report.version = {
            status: "refused",
            issues: [error.details ?? error.message],
          };
        }
      }
    }
  }

  if (options.nettoyer) {
    for (const code of DIRECT_PROVIDER_CODES) {
      const [provider] = await db
        .select()
        .from(modelProviders)
        .where(eq(modelProviders.code, code));
      if (!provider) continue;
      const [m] = await db
        .select({ n: count() })
        .from(models)
        .where(eq(models.providerId, provider.id));
      const [r] = await db
        .select({ n: count() })
        .from(modelRoutes)
        .where(and(eq(modelRoutes.providerId, provider.id)));
      if ((m?.n ?? 0) + (r?.n ?? 0) > 0) {
        report.cleaned.kept.push({
          code,
          reason: `encore référencé par ${m?.n ?? 0} modèle(s) (retirés compris) et ${r?.n ?? 0} route(s)`,
        });
        continue;
      }
      await db.delete(modelProviders).where(eq(modelProviders.id, provider.id));
      report.cleaned.deleted.push(code);
    }
  }
  return report;
}
