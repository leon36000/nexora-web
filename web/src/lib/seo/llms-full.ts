import { LANGS, type Lang } from "@/i18n/config";
import {
  factLines,
  factsFor,
  factsTitle,
  LANG_TAG,
  type LlmsInput,
  llmsHeader,
  orderKey,
} from "./llms";

/** Page publiée déjà convertie en Markdown (par `pageToMarkdown`) : titre, adresse, description, contenu. */
export interface LlmsDoc {
  lang: Lang;
  /** Chemin neutre français (clé de tri commune aux deux langues). */
  frPath: string;
  url: string;
  title: string;
  description: string | null;
  markdown: string;
}

export interface LlmsModel {
  id: string;
  name: string;
  provider: string;
  /** Libellé du lieu d'hébergement, par langue (« Hébergé au Québec »). */
  residency: Record<Lang, string>;
  kind: "chat" | "embedding";
  contextMax: number;
  /** Prix de développement (catalogue d'essai) : il n'est jamais reproduit ici. */
  devPrice: boolean;
  inputPerMillion: string;
  outputPerMillion: string;
}

export interface LlmsCatalog {
  models: readonly LlmsModel[];
  /** Date de publication de la version du catalogue (ISO), ou null. */
  publishedAt: string | null;
}

export interface LlmsVpsApp {
  name: string;
  tagline: Record<Lang, string>;
  minRamMb: number;
}

export interface LlmsFullInput extends LlmsInput {
  /** Une seule langue (`?lang=fr` ou `?lang=en`) ; absent = les deux, français d'abord. */
  lang?: Lang;
  docs: readonly LlmsDoc[];
  catalog: LlmsCatalog | null;
  vps: { apps: readonly LlmsVpsApp[] } | null;
}

const T = {
  fr: {
    pages: "Contenu des pages",
    address: "Adresse :",
    catalog: "Catalogue de modèles",
    catalogIntro:
      "Catalogue public de la passerelle (API au format OpenAI). Prix en dollars canadiens, avant taxes, par million de jetons. Les offres en libre-service ne sont pas encore ouvertes à la vente (paiements en mode test).",
    catalogAt: "Version du catalogue au",
    columns: [
      "Modèle",
      "Identifiant",
      "Fournisseur",
      "Hébergement",
      "Contexte (jetons)",
      "Entrée / sortie",
    ],
    devPrice: "prix de développement, non publié",
    embedding: "embeddings",
    vps: "Applications VPS",
    vpsIntro:
      "Applications d'IA installables sur un serveur privé virtuel (VPS) hébergé au Québec. Plans et prix : voir la page VPS.",
    ram: "mémoire vive minimale (Mo)",
  },
  en: {
    pages: "Page contents",
    address: "Address:",
    catalog: "Model catalogue",
    catalogIntro:
      "Public catalogue of the gateway (OpenAI-format API). Prices in Canadian dollars, before tax, per million tokens. Self-service offers are not yet open for sale (payments in test mode).",
    catalogAt: "Catalogue version of",
    columns: [
      "Model",
      "Identifier",
      "Provider",
      "Hosting",
      "Context (tokens)",
      "Input / output",
    ],
    devPrice: "development price, not published",
    embedding: "embeddings",
    vps: "VPS applications",
    vpsIntro:
      "AI applications that can be installed on a virtual private server (VPS) hosted in Quebec. Plans and prices: see the VPS page.",
    ram: "minimum memory (MB)",
  },
} as const;

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** Espace fine pour les grands nombres, sans dépendre de la locale du serveur. */
const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

function catalogSection(
  catalog: LlmsCatalog,
  lang: Lang,
  tag: string,
): string[] {
  if (catalog.models.length === 0) return [];
  const t = T[lang];
  const rows = catalog.models.map((m) => {
    const price = m.devPrice
      ? t.devPrice
      : m.kind === "embedding"
        ? `${m.inputPerMillion} (${t.embedding})`
        : `${m.inputPerMillion} / ${m.outputPerMillion}`;
    return `| ${[cell(m.name), `\`${m.id}\``, cell(m.provider), cell(m.residency[lang]), grouped(m.contextMax), cell(price)].join(" | ")} |`;
  });
  const when = catalog.publishedAt?.slice(0, 10);
  return [
    `## ${t.catalog} (${tag})`,
    "",
    t.catalogIntro,
    ...(when ? ["", `${t.catalogAt} ${when}.`] : []),
    "",
    `| ${t.columns.join(" | ")} |`,
    `| ${t.columns.map(() => "---").join(" | ")} |`,
    ...rows,
    "",
  ];
}

function vpsSection(
  vps: { apps: readonly LlmsVpsApp[] },
  lang: Lang,
  tag: string,
): string[] {
  if (vps.apps.length === 0) return [];
  const t = T[lang];
  return [
    `## ${t.vps} (${tag})`,
    "",
    t.vpsIntro,
    "",
    ...vps.apps.map(
      (a) =>
        `- **${cell(a.name)}** : ${cell(a.tagline[lang])} (${t.ram} : ${a.minRamMb})`,
    ),
    "",
  ];
}

/**
 * `llms-full.txt` : le contenu essentiel des pages publiées en Markdown propre, tel que les pages l'affichent (généré
 * depuis les modèles de page, jamais écrit à la main), avec les faits à retenir en tête, le catalogue de modèles
 * (prix de développement jamais reproduits) et les applications VPS. Déterministe : aucune date de génération.
 */
export function buildLlmsFullTxt(input: LlmsFullInput): string {
  const lines = llmsHeader(input);
  for (const lang of input.lang ? [input.lang] : LANGS) {
    const tag = LANG_TAG[lang];
    const t = T[lang];
    const facts = factLines(factsFor(input, lang));
    if (facts.length > 0)
      lines.push(`## ${factsTitle(lang)} (${tag})`, "", ...facts, "");
    const docs = input.docs
      .filter((d) => d.lang === lang && d.markdown.trim() !== "")
      .sort((a, b) => {
        const ka = orderKey(a.frPath);
        const kb = orderKey(b.frPath);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
    if (docs.length > 0) {
      lines.push(`## ${t.pages} (${tag})`, "");
      for (const d of docs) {
        lines.push(`### ${d.title.replace(/\s+/g, " ").trim()}`, "");
        lines.push(`${t.address} ${d.url}`, "");
        if (d.description)
          lines.push(d.description.replace(/\s+/g, " ").trim(), "");
        lines.push(d.markdown.trim(), "");
      }
    }
    if (input.catalog) lines.push(...catalogSection(input.catalog, lang, tag));
    if (input.vps) lines.push(...vpsSection(input.vps, lang, tag));
  }
  return `${lines
    .join("\n")
    .trimEnd()
    .replace(/\n{3,}/g, "\n\n")}\n`;
}
