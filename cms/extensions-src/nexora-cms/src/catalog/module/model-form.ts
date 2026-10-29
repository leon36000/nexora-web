// Assistant « Ajouter un modèle » : état du formulaire, validation par étape (mêmes règles que web/…/sheet.ts et
// admin-handlers.ts, qui restent juges) et corps envoyé à l'app. Une modification ne perd JAMAIS ce que l'assistant
// ne sait pas éditer (mesures sourcées, sources, consignes de routage avancées) : on fusionne dans l'existant.

export type Modality = "text" | "image" | "video" | "audio";
export const MODALITY_OPTIONS: { value: Modality; text: string }[] = [
  { value: "text", text: "Texte" },
  { value: "image", text: "Image" },
  { value: "video", text: "Vidéo" },
  { value: "audio", text: "Audio" },
];
export const CAPABILITY_OPTIONS = [
  { id: "streaming", label: "Diffusion en continu" },
  { id: "tools", label: "Appel d’outils" },
  { id: "vision", label: "Vision" },
  { id: "reasoning", label: "Raisonnement" },
  { id: "json_mode", label: "Mode JSON" },
];
export const KIND_OPTIONS = [
  { value: "chat", text: "Conversation" },
  { value: "embedding", text: "Embeddings (représentations vectorielles)" },
];
export const VISIBILITY_OPTIONS = [
  { value: "public", text: "Public (listé au catalogue)" },
  {
    value: "unlisted",
    text: "Non listé (accessible si on connaît l’identifiant)",
  },
  { value: "private", text: "Privé (clés autorisées seulement)" },
];

export interface ModelForm {
  id: string;
  publicId: string;
  name: string;
  family: string;
  descriptionFr: string;
  descriptionEn: string;
  kind: string;
  visibility: string;
  /** `preview` : visible au catalogue, pas encore appelable (case « Aperçu »). */
  availability: "live" | "preview";
  residency: string;
  releasedAt: string;
  knowledgeCutoff: string;
  licenseName: string;
  licenseUrl: string;
  /** '' : inconnu (aucune licence enregistrée si le nom est vide). */
  openWeights: "" | "open" | "closed";
  totalB: string;
  activeB: string;
  inputModalities: Modality[];
  outputModalities: Modality[];
  contextMax: string;
  maxOutputTokens: string;
  capabilities: Record<string, boolean>;
  providerId: string;
  upstreamId: string;
  dataCollection: "" | "allow" | "deny";
  allowFallbacks: "" | "yes" | "no";
  notesFr: string;
  notesEn: string;
  sunsetAt: string;
}

export const emptyModelForm = (): ModelForm => ({
  id: "",
  publicId: "",
  name: "",
  family: "",
  descriptionFr: "",
  descriptionEn: "",
  kind: "chat",
  visibility: "public",
  availability: "live",
  residency: "autre",
  releasedAt: "",
  knowledgeCutoff: "",
  licenseName: "",
  licenseUrl: "",
  openWeights: "",
  totalB: "",
  activeB: "",
  // Rien de coché d'avance : un champ inconnu reste absent de la fiche plutôt qu'inventé.
  inputModalities: [],
  outputModalities: [],
  contextMax: "32000",
  maxOutputTokens: "",
  capabilities: {},
  providerId: "",
  upstreamId: "",
  dataCollection: "",
  allowFallbacks: "",
  notesFr: "",
  notesEn: "",
  sunsetAt: "",
});

type Sheet = {
  family?: string;
  releasedAt?: string;
  knowledgeCutoff?: string;
  license?: { name?: string; openWeights: boolean; url?: string };
  parameters?: { totalB?: number; activeB?: number };
  modalities?: { input: string[]; output: string[] };
  benchmarks?: {
    name: string;
    score: number;
    unit: string;
    publisher: string;
    sourceUrl: string;
  }[];
  sources?: { label: string; url: string; readAt: string }[];
  notesFr?: string;
  notesEn?: string;
};
type Routing = Record<string, unknown>;

export interface ModelRecord {
  id: string;
  publicId: string;
  name: string;
  descriptionFr: string;
  descriptionEn: string;
  kind: string;
  providerId: string;
  upstreamId: string;
  contextMax: number;
  maxOutputTokens: number | null;
  capabilities: Record<string, boolean | undefined>;
  residency: string;
  visibility: string;
  /** Absente des modèles enregistrés avant l'aperçu : « live ». */
  availability?: string;
  status: string;
  sunsetAt: string | null;
  sheet: Sheet;
  routing: Routing;
}

const MANAGED_SHEET = [
  "family",
  "releasedAt",
  "knowledgeCutoff",
  "license",
  "parameters",
  "modalities",
  "notesFr",
  "notesEn",
] as const;
const MANAGED_ROUTING = ["dataCollection", "allowFallbacks"] as const;

export function modelToForm(m: ModelRecord): ModelForm {
  const s = m.sheet ?? {};
  const r = m.routing ?? {};
  return {
    id: m.id,
    publicId: m.publicId,
    name: m.name,
    family: s.family ?? "",
    descriptionFr: m.descriptionFr,
    descriptionEn: m.descriptionEn,
    kind: m.kind,
    visibility: m.visibility,
    availability: m.availability === "preview" ? "preview" : "live",
    residency: m.residency,
    releasedAt: s.releasedAt ?? "",
    knowledgeCutoff: s.knowledgeCutoff ?? "",
    licenseName: s.license?.name ?? "",
    licenseUrl: s.license?.url ?? "",
    openWeights: s.license ? (s.license.openWeights ? "open" : "closed") : "",
    totalB:
      s.parameters?.totalB === undefined ? "" : String(s.parameters.totalB),
    activeB:
      s.parameters?.activeB === undefined ? "" : String(s.parameters.activeB),
    inputModalities: [...(s.modalities?.input ?? [])] as Modality[],
    outputModalities: [...(s.modalities?.output ?? [])] as Modality[],
    contextMax: String(m.contextMax),
    maxOutputTokens:
      m.maxOutputTokens === null ? "" : String(m.maxOutputTokens),
    capabilities: Object.fromEntries(
      Object.entries(m.capabilities ?? {}).filter(
        ([, v]) => typeof v === "boolean",
      ),
    ) as Record<string, boolean>,
    providerId: m.providerId,
    upstreamId: m.upstreamId,
    dataCollection:
      r.dataCollection === "allow" || r.dataCollection === "deny"
        ? r.dataCollection
        : "",
    allowFallbacks:
      r.allowFallbacks === undefined ? "" : r.allowFallbacks ? "yes" : "no",
    notesFr: s.notesFr ?? "",
    notesEn: s.notesEn ?? "",
    sunsetAt: m.sunsetAt ? m.sunsetAt.slice(0, 10) : "",
  };
}

const decimal = (v: string) => Number(v.trim().replace(",", "."));

/** Corps de création (avec `publicId`) ou de modification (sans `publicId` ni `status`). */
export function formToBody(
  f: ModelForm,
  existing: ModelRecord | null,
): Record<string, unknown> {
  const sheet: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existing?.sheet ?? {}))
    if (!(MANAGED_SHEET as readonly string[]).includes(k)) sheet[k] = v;
  if (f.family.trim()) sheet.family = f.family.trim();
  if (f.releasedAt.trim()) sheet.releasedAt = f.releasedAt.trim();
  if (f.knowledgeCutoff.trim())
    sheet.knowledgeCutoff = f.knowledgeCutoff.trim();
  if (f.licenseName.trim() || f.licenseUrl.trim() || f.openWeights) {
    sheet.license = {
      ...(f.licenseName.trim() ? { name: f.licenseName.trim() } : {}),
      openWeights: f.openWeights === "open",
      ...(f.licenseUrl.trim() ? { url: f.licenseUrl.trim() } : {}),
    };
  }
  const parameters = {
    ...(f.totalB.trim() ? { totalB: decimal(f.totalB) } : {}),
    ...(f.activeB.trim() ? { activeB: decimal(f.activeB) } : {}),
  };
  if (Object.keys(parameters).length > 0) sheet.parameters = parameters;
  if (f.inputModalities.length > 0 || f.outputModalities.length > 0)
    sheet.modalities = {
      input: [...f.inputModalities],
      output: [...f.outputModalities],
    };
  if (f.notesFr.trim()) sheet.notesFr = f.notesFr.trim();
  if (f.notesEn.trim()) sheet.notesEn = f.notesEn.trim();

  const routing: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existing?.routing ?? {}))
    if (!(MANAGED_ROUTING as readonly string[]).includes(k)) routing[k] = v;
  if (f.dataCollection) routing.dataCollection = f.dataCollection;
  if (f.allowFallbacks) routing.allowFallbacks = f.allowFallbacks === "yes";

  const keepSunset =
    existing?.sunsetAt && existing.sunsetAt.slice(0, 10) === f.sunsetAt;
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    descriptionFr: f.descriptionFr,
    descriptionEn: f.descriptionEn,
    kind: f.kind,
    providerId: f.providerId,
    upstreamId: f.upstreamId.trim(),
    contextMax: Number(f.contextMax),
    maxOutputTokens: f.maxOutputTokens.trim()
      ? Number(f.maxOutputTokens)
      : null,
    capabilities: Object.fromEntries(
      Object.entries(f.capabilities).filter(([, v]) => typeof v === "boolean"),
    ),
    residency: f.residency,
    visibility: f.visibility,
    availability: f.availability,
    sunsetAt: f.sunsetAt.trim()
      ? keepSunset
        ? existing?.sunsetAt
        : `${f.sunsetAt.trim()}T00:00:00.000Z`
      : null,
    sheet,
    routing,
  };
  if (!f.id) body.publicId = f.publicId.trim();
  return body;
}

/** « GLM 5.3 Flash » -> « nexora/glm-5.3-flash ». */
export function slugModelId(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return slug ? `nexora/${slug}` : "";
}

export type Step = "identity" | "sheet" | "provider";

const PUBLIC_ID = /^nexora\/[a-z0-9][a-z0-9._:-]{0,80}$/;
const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
};
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const posInt = (v: string, max: number) =>
  /^\d{1,9}$/.test(v.trim()) && Number(v) >= 1 && Number(v) <= max;

export function validateStep(
  step: Step,
  f: ModelForm,
  existingIds: readonly string[],
): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === "identity") {
    if (!f.id) {
      if (!PUBLIC_ID.test(f.publicId))
        e.publicId =
          "Identifiant public de la forme nexora/nom-du-modele (minuscules, chiffres, point, tiret).";
      else if (existingIds.includes(f.publicId))
        e.publicId = "Cet identifiant public est déjà utilisé.";
    }
    if (!f.name.trim() || f.name.length > 120)
      e.name = "Donnez un nom (120 caractères au plus).";
    if (f.family.length > 80) e.family = "Famille : 80 caractères au plus.";
    if (f.descriptionFr.length > 4000 || f.descriptionEn.length > 4000)
      e.descriptionFr = "Description : 4 000 caractères au plus.";
  }
  if (step === "sheet") {
    if (f.releasedAt.trim() && !isDay(f.releasedAt.trim()))
      e.releasedAt = "Date de sortie au format AAAA-MM-JJ.";
    if (f.knowledgeCutoff.trim() && !isMonth(f.knowledgeCutoff.trim()))
      e.knowledgeCutoff = "Coupure des connaissances au format AAAA-MM.";
    if ((f.licenseName.trim() || f.licenseUrl.trim()) && !f.openWeights)
      e.openWeights = "Précisez si les poids du modèle sont ouverts ou fermés.";
    if (f.licenseUrl.trim() && !/^https:\/\/\S+$/.test(f.licenseUrl.trim()))
      e.licenseUrl = "Adresse https attendue pour le texte de la licence.";
    for (const [key, label] of [
      ["totalB", "Paramètres totaux"],
      ["activeB", "Paramètres actifs"],
    ] as const) {
      const v = f[key].trim();
      if (v && !(Number.isFinite(decimal(v)) && decimal(v) > 0))
        e[key] = `${label} : nombre positif attendu (en milliards).`;
    }
    if (
      !e.totalB &&
      !e.activeB &&
      f.totalB.trim() &&
      f.activeB.trim() &&
      decimal(f.activeB) > decimal(f.totalB)
    )
      e.activeB = "Les paramètres actifs ne peuvent pas dépasser le total.";
    if (!posInt(f.contextMax, 10_000_000))
      e.contextMax = "Fenêtre de contexte : entier de 1 à 10 000 000 jetons.";
    if (f.maxOutputTokens.trim() && !posInt(f.maxOutputTokens, 10_000_000))
      e.maxOutputTokens = "Sortie maximale : entier de 1 à 10 000 000 jetons.";
    if (f.notesFr.length > 2000 || f.notesEn.length > 2000)
      e.notesFr = "Notes : 2 000 caractères au plus.";
  }
  if (step === "provider") {
    if (!f.providerId) e.providerId = "Choisissez le fournisseur principal.";
    if (!f.upstreamId.trim() || f.upstreamId.length > 200)
      e.upstreamId =
        "Indiquez l’identifiant du modèle chez le fournisseur (ex. meta-llama/Llama-3.3-70B).";
  }
  return e;
}

/** Mesures et sources d'une fiche, en lignes lisibles (lecture seule dans l'assistant). */
export function sheetExtras(sheet: Sheet): {
  benchmarks: { text: string; url: string }[];
  sources: { text: string; url: string }[];
} {
  return {
    benchmarks: (sheet.benchmarks ?? []).map((b) => ({
      text: `${b.name} : ${b.score} ${b.unit} (${b.publisher})`,
      url: b.sourceUrl,
    })),
    sources: (sheet.sources ?? []).map((s) => ({
      text: `${s.label} (lu le ${s.readAt})`,
      url: s.url,
    })),
  };
}
