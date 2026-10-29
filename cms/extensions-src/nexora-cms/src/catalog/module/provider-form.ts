// Assistant « Ajouter un fournisseur » : valeurs de départ, validation et corps envoyé à l'app. La CLÉ n'est jamais
// saisie ici : elle se dépose dans le module « Coffre », sous la référence indiquée ici (D2).

export interface ProviderOption {
  value: string;
  text: string;
}

export const PROVIDER_TYPE_OPTIONS: ProviderOption[] = [
  {
    value: "openai_compatible",
    text: "Compatible OpenAI (DeepSeek, Z.ai, DeepInfra…)",
  },
  { value: "openrouter", text: "OpenRouter" },
];
/** Types plus rares, affichés seulement pour un fournisseur déjà enregistré avec l'un d'eux. */
const OTHER_TYPE_TEXT: Record<string, string> = {
  litellm_upstream: "LiteLLM amont",
  vllm: "vLLM (hébergement interne)",
  ollama: "Ollama (hébergement interne)",
};
export const typeOptionsFor = (current: string): ProviderOption[] =>
  PROVIDER_TYPE_OPTIONS.some((o) => o.value === current) ||
  !OTHER_TYPE_TEXT[current]
    ? PROVIDER_TYPE_OPTIONS
    : [
        ...PROVIDER_TYPE_OPTIONS,
        { value: current, text: OTHER_TYPE_TEXT[current] as string },
      ];

export const REGION_OPTIONS: ProviderOption[] = [
  { value: "quebec", text: "Québec" },
  { value: "canada", text: "Canada" },
  { value: "etats_unis", text: "États-Unis" },
  { value: "europe", text: "Europe" },
  { value: "autre", text: "Autre / non précisée" },
];

export interface ProviderPreset {
  id: string;
  name: string;
  type: "openai_compatible" | "openrouter";
  baseUrl: string;
}

/** Adresses de base publiées par les fournisseurs (interface compatible OpenAI). Aucun prix ici. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    type: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
  },
  {
    id: "zai",
    name: "Z.ai",
    type: "openai_compatible",
    baseUrl: "https://api.z.ai/api/paas/v4",
  },
  {
    id: "minimax",
    name: "MiniMax",
    type: "openai_compatible",
    baseUrl: "https://api.minimax.io/v1",
  },
  {
    id: "moonshot",
    name: "Moonshot AI (Kimi)",
    type: "openai_compatible",
    baseUrl: "https://api.moonshot.ai/v1",
  },
  {
    id: "deepinfra",
    name: "DeepInfra",
    type: "openai_compatible",
    baseUrl: "https://api.deepinfra.com/v1/openai",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
];

export interface ProviderForm {
  id: string;
  code: string;
  name: string;
  type: string;
  baseUrl: string;
  litellmBaseUrl: string;
  region: string;
  secretRef: string;
  dataPolicyFr: string;
  dataPolicyEn: string;
  priority: string;
  enabled: boolean;
}

export const emptyProviderForm = (): ProviderForm => ({
  id: "",
  code: "",
  name: "",
  type: "openai_compatible",
  baseUrl: "",
  litellmBaseUrl: "",
  region: "autre",
  secretRef: "",
  dataPolicyFr: "",
  dataPolicyEn: "",
  priority: "100",
  enabled: false,
});

/** Minuscules sans accents, tirets entre les mots : « Moonshot AI (Kimi) » -> « moonshot-ai-kimi ». */
export function suggestCode(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const suggestSecretRef = (code: string): string =>
  code ? `llm.${code}` : "";

export function suggestPolicies(name: string): { fr: string; en: string } {
  return {
    fr: `Requêtes envoyées directement à ${name}.`,
    en: `Requests sent directly to ${name}.`,
  };
}

export function applyPreset(
  form: ProviderForm,
  presetId: string,
): ProviderForm {
  const preset = PROVIDER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return form;
  const policies =
    preset.type === "openrouter" ? null : suggestPolicies(preset.name);
  return {
    ...form,
    code: preset.id,
    name: preset.name,
    type: preset.type,
    baseUrl: preset.baseUrl,
    secretRef: suggestSecretRef(preset.id),
    dataPolicyFr:
      policies?.fr ??
      "Route de secours : les requêtes passent par OpenRouter, qui les transmet à un hébergeur tiers.",
    dataPolicyEn:
      policies?.en ??
      "Fallback route: requests go through OpenRouter, which forwards them to a third-party host.",
    enabled: false,
  };
}

const CODE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const REF = /^[a-z0-9._-]{3,64}$/;
const RESERVED_REF = /^(stripe|site-agent|seo|directus|vps)[._-]/;
const KEY_TYPES = new Set([
  "openai_compatible",
  "openrouter",
  "litellm_upstream",
]);

export function validateProviderForm(
  f: ProviderForm,
  existingCodes: readonly string[],
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim() || f.name.length > 100)
    e.name = "Donnez un nom (100 caractères au plus).";
  if (!f.id) {
    if (!CODE.test(f.code))
      e.code =
        "Code de 3 à 40 caractères : minuscules, chiffres et tirets (ex. deepinfra).";
    else if (existingCodes.includes(f.code))
      e.code = "Ce code est déjà pris par un autre fournisseur.";
  }
  try {
    const u = new URL(f.baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:")
      throw new Error("schéma");
  } catch {
    e.baseUrl =
      "Adresse http(s) attendue, par exemple https://api.deepinfra.com/v1/openai.";
  }
  if (f.litellmBaseUrl.trim()) {
    try {
      const u = new URL(f.litellmBaseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:")
        throw new Error("schéma");
    } catch {
      e.litellmBaseUrl = "Adresse http(s) attendue.";
    }
  }
  if (f.secretRef.trim()) {
    if (!REF.test(f.secretRef))
      e.secretRef =
        "Référence de 3 à 64 caractères : minuscules, chiffres, point, tiret, tiret bas.";
    else if (RESERVED_REF.test(f.secretRef))
      e.secretRef =
        "Référence réservée à la plateforme : choisissez-en une autre (ex. llm.deepinfra).";
  } else if (KEY_TYPES.has(f.type)) {
    e.secretRef =
      "Indiquez la référence de la clé dans le Coffre (ex. llm.deepinfra).";
  }
  // Le champ numérique de Directus peut rendre un nombre : on compare toujours sur le texte.
  const priorityText = String(f.priority).trim();
  if (!/^\d{1,5}$/.test(priorityText) || Number(priorityText) > 10_000)
    e.priority =
      "Priorité : entier de 0 à 10 000 (plus petit = essayé d’abord).";
  return e;
}

/** Corps de création (avec `code`) ou de modification (sans `code`). Aucune clé. */
export function providerBody(f: ProviderForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    type: f.type,
    baseUrl: f.baseUrl.trim(),
    region: f.region,
    secretRef: f.secretRef.trim() || null,
    dataPolicyFr: f.dataPolicyFr,
    dataPolicyEn: f.dataPolicyEn,
    priority: Number(f.priority),
    enabled: f.enabled,
  };
  if (f.id) body.litellmBaseUrl = f.litellmBaseUrl.trim() || null;
  else {
    body.code = f.code;
    if (f.litellmBaseUrl.trim()) body.litellmBaseUrl = f.litellmBaseUrl.trim();
    if (!body.secretRef) delete body.secretRef;
  }
  return body;
}

export interface ProviderRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  baseUrl: string;
  litellmBaseUrl: string | null;
  secretRef: string | null;
  region: string;
  dataPolicyFr: string;
  dataPolicyEn: string;
  priority: number;
  enabled: boolean;
  healthState?: string;
  secretPresent?: boolean | null;
}

export function providerToForm(p: ProviderRecord): ProviderForm {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    litellmBaseUrl: p.litellmBaseUrl ?? "",
    region: p.region,
    secretRef: p.secretRef ?? "",
    dataPolicyFr: p.dataPolicyFr,
    dataPolicyEn: p.dataPolicyEn,
    priority: String(p.priority),
    enabled: p.enabled,
  };
}

export interface NextStep {
  id: "secret" | "test" | "enable" | "ready";
  text: string;
}

/** Ce qu'il reste à faire pour qu'un fournisseur serve : clé dans le Coffre, test de connexion, activation. */
export function providerNextStep(p: {
  type: string;
  secretRef: string | null;
  secretPresent?: boolean | null;
  healthState?: string;
  enabled: boolean;
}): NextStep {
  const needsKey = KEY_TYPES.has(p.type) || p.secretRef !== null;
  if (needsKey && p.secretPresent !== true)
    return {
      id: "secret",
      text: `Collez la clé dans le module « Coffre », sous la référence « ${p.secretRef ?? "llm.…"} ».`,
    };
  if (p.healthState !== "ok")
    return {
      id: "test",
      text: "Testez la connexion pour vérifier l’adresse et la clé.",
    };
  if (!p.enabled)
    return { id: "enable", text: "Activez le fournisseur pour qu’il serve." };
  return { id: "ready", text: "Le fournisseur est prêt." };
}
