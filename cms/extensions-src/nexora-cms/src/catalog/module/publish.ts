// Publication d'un modèle (bouton « Publier » de l'assistant) : enchaîne les étapes que l'on ferait à la main dans les
// onglets Modèles puis Versions, sans jamais contourner la garde du serveur. Rejouable : chaque étape part de l'état
// actuel (modèle déjà approuvé, version déjà approuvée…) et s'arrête au premier refus, en rendant les problèmes.

import type { CallResult, CatalogCall, CatalogError } from "./errors";

export type PublishStep =
  | "model_draft"
  | "model_approved"
  | "model_published"
  | "version_drafted"
  | "version_approved"
  | "version_published"
  | "synced";

export const STEP_LABELS: Record<PublishStep, string> = {
  model_draft: "Modèle remis en brouillon",
  model_approved: "Modèle approuvé",
  model_published: "Modèle publié",
  version_drafted: "Version du catalogue préparée",
  version_approved: "Version approuvée",
  version_published: "Version publiée : le modèle est en ligne",
  synced: "LiteLLM synchronisé",
};

export type PublishOutcome =
  | {
      ok: true;
      version: string;
      /** Catalogue identique au catalogue publié : rien de nouveau à mettre en ligne. */
      unchanged: boolean;
      diff: Record<string, unknown>[];
      /** null : synchronisation non demandée. */
      synced: boolean | null;
      syncError?: string;
    }
  | { ok: false; failedStep: PublishStep; error: CatalogError };

const fail = (failedStep: PublishStep, r: CallResult): PublishOutcome =>
  r.ok
    ? {
        ok: false,
        failedStep,
        error: {
          code: "",
          status: null,
          text: "Échec de l’opération.",
          issues: [],
        },
      }
    : { ok: false, failedStep, error: r.error };

export async function publishModel(
  call: CatalogCall,
  model: { id: string; publicId: string; status: string },
  options: { sync: boolean },
  onStep: (step: PublishStep) => void = () => {},
): Promise<PublishOutcome> {
  // 1. Le modèle passe de son état actuel à « publié », une marche à la fois.
  let status = model.status;
  if (status === "retired") {
    const r = await call("PATCH", `models/${model.id}`, { status: "draft" });
    if (!r.ok) return fail("model_draft", r);
    status = "draft";
    onStep("model_draft");
  }
  if (status === "draft") {
    const r = await call("PATCH", `models/${model.id}`, { status: "approved" });
    if (!r.ok) return fail("model_approved", r);
    status = "approved";
    onStep("model_approved");
  }
  if (status === "approved") {
    const r = await call("PATCH", `models/${model.id}`, {
      status: "published",
    });
    if (!r.ok) return fail("model_published", r);
    onStep("model_published");
  }

  return publishCatalog(call, options, onStep);
}

/**
 * Met en ligne une nouvelle version du catalogue (brouillon, approbation, publication, synchronisation facultative) :
 * ce que l'on fait après avoir changé un prix, publié ou retiré un modèle. Rejouable : repart de l'état de la version.
 */
export async function publishCatalog(
  call: CatalogCall,
  options: { sync: boolean },
  onStep: (step: PublishStep) => void = () => {},
): Promise<PublishOutcome> {
  // La version du catalogue.
  const draft = await call<{
    version: { id: string; short: string; status: string };
    unchanged: boolean;
    diff: Record<string, unknown>[];
    issues: { code: string }[];
  }>("POST", "versions");
  if (!draft.ok) return fail("version_drafted", draft);
  const { version, unchanged, diff, issues } = draft.data;
  if (issues.length > 0)
    return {
      ok: false,
      failedStep: "version_drafted",
      error: {
        code: "publication_refused",
        status: 422,
        text: "Refusé par la garde de publication.",
        issues: issues as Record<string, unknown>[],
      },
    };
  onStep("version_drafted");
  if (!unchanged) {
    if (version.status === "draft") {
      const r = await call("POST", `versions/${version.id}/approve`);
      if (!r.ok) return fail("version_approved", r);
      onStep("version_approved");
    }
    if (version.status === "draft" || version.status === "approved") {
      const r = await call("POST", `versions/${version.id}/publish`);
      if (!r.ok) return fail("version_published", r);
      onStep("version_published");
    }
  }

  // 3. LiteLLM : un échec ne défait pas la publication, il est signalé.
  let synced: boolean | null = null;
  let syncError: string | undefined;
  if (options.sync) {
    const r = await call("POST", "sync-litellm");
    synced = r.ok;
    if (r.ok) onStep("synced");
    else syncError = r.error.text;
  }
  return {
    ok: true,
    version: version.short,
    unchanged,
    diff,
    synced,
    ...(syncError ? { syncError } : {}),
  };
}
