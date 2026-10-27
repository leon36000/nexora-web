import type { SeoAdapterKey } from "@nexora/db";

/**
 * Adaptateurs externes du SEO (indexation, mesure, veille, diffusion) et leur ÉTAT HONNÊTE.
 *
 * - `not_connected` : aucune clé utilisable (absente du Coffre, ou présente mais jamais vérifiée avec succès).
 * - `read` : clé présente ET dernière vérification réussie (lecture seulement).
 * - `write` : en plus, autorisation humaine explicite d'écrire (`seo_adapters.write_enabled`). Un agent ne peut
 *   jamais accorder cette autorisation.
 * Aucun appel externe n'a lieu sans clé fournie par le fondateur dans le Coffre.
 *
 * Les références du Coffre ci-dessous sont recopiées dans le worker (`worker/src/seo/…`) : les garder identiques.
 */
export const SEO_ADAPTER_SECRET_REFS = {
  indexnow: null,
  bing: "seo.bing.api_key",
  searchconsole: "seo.searchconsole.credentials",
  dataforseo: "seo.dataforseo.credentials",
  postiz: "seo.postiz.api_key",
} as const satisfies Record<SeoAdapterKey, string | null>;

export const SEO_ADAPTER_LABELS: Record<
  SeoAdapterKey,
  { label: string; role: string }
> = {
  indexnow: {
    label: "IndexNow",
    role: "Signale les pages nouvelles ou modifiées aux moteurs (Bing, Yandex). La clé est publique, servie à la racine du site.",
  },
  bing: {
    label: "Bing Webmaster",
    role: "Soumission d’URL et quota (clé d’API dans le Coffre).",
  },
  searchconsole: {
    label: "Google Search Console",
    role: "Lecture des performances de recherche (compte de service dans le Coffre).",
  },
  dataforseo: {
    label: "DataForSEO",
    role: "Mots-clés, concurrents, liens entrants (identifiants dans le Coffre, plafond de dépense à fixer).",
  },
  postiz: {
    label: "Postiz",
    role: "Brouillons de publications sociales, validation humaine (clé dans le Coffre).",
  },
};

export type AdapterState = "not_connected" | "read" | "write";

export function adapterState(input: {
  secretPresent: boolean;
  lastCheckStatus: string;
  writeEnabled: boolean;
}): AdapterState {
  if (!input.secretPresent) return "not_connected";
  if (input.lastCheckStatus !== "ok") return "not_connected";
  return input.writeEnabled ? "write" : "read";
}

/** Explication courte (sans secret) de l'état affiché. */
export function adapterStateDetail(input: {
  key: SeoAdapterKey;
  secretPresent: boolean;
  lastCheckStatus: string;
  lastCheckDetail: string | null;
}): string {
  const ref = SEO_ADAPTER_SECRET_REFS[input.key];
  if (!input.secretPresent)
    return input.key === "indexnow"
      ? "Clé IndexNow pas encore générée (elle est créée par la première soumission ou par la vérification)."
      : `Aucune clé dans le Coffre (référence ${ref}).`;
  if (input.lastCheckStatus === "error")
    return input.lastCheckDetail
      ? `Dernière vérification en échec : ${input.lastCheckDetail}`
      : "Dernière vérification en échec.";
  if (input.lastCheckStatus !== "ok")
    return "Clé présente, non vérifiée : lancer « Vérifier ».";
  return input.lastCheckDetail ?? "Vérification réussie.";
}
