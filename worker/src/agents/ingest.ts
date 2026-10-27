import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isNonPublicAddress } from "@nexora/net";
import { parse } from "node-html-parser";

/**
 * INGESTION (lecture seule, sources NON FIABLES). Ce module ne fait que lire une URL fournie par un humain et rendre
 * du texte borné ; il n'a accès à aucun outil d'écriture, aucun secret, aucun client Directus.
 *
 * Défenses : http(s) seulement ; adresse résolue publique (ni boucle locale, ni réseau privé, ni métadonnées du
 * nuage) — la boucle locale n'est admise qu'en développement, jamais en production ; pas de redirection suivie vers
 * un autre hôte ; taille et durée bornées ; contenu cachable (script, style, commentaires, éléments cachés)
 * retiré ; le texte est enveloppé en données (`<source_non_fiable>`) et tronqué.
 */

export class IngestError extends Error {
  readonly code: "scheme" | "address" | "fetch" | "type" | "size";
  constructor(code: IngestError["code"], message: string) {
    super(message);
    this.name = "IngestError";
    this.code = code;
  }
}

export interface IngestedSource {
  url: string;
  title: string | null;
  /** Texte brut, tronqué. Données, jamais des instructions. */
  text: string;
  truncated: boolean;
}

const MAX_BYTES = 400_000;
const MAX_CHARS = 12_000;

/** Vrai si l'adresse n'est pas une adresse publique routable (garde partagée : @nexora/net). */
export { isNonPublicAddress };

export interface IngestOptions {
  fetchImpl?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
  /** Boucle locale admise (développement et tests seulement). */
  allowLoopback?: boolean;
}

async function defaultResolve(host: string): Promise<string[]> {
  if (isIP(host)) return [host];
  const all = await lookup(host, { all: true });
  return all.map((a) => a.address);
}

export async function assertPublicHttpUrl(
  raw: string,
  options: IngestOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new IngestError("scheme", "URL invalide");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new IngestError("scheme", "seuls http et https sont admis");
  if (url.username || url.password)
    throw new IngestError("scheme", "URL avec identifiants refusée");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await (options.resolve ?? defaultResolve)(host);
  if (addresses.length === 0)
    throw new IngestError("address", "hôte introuvable");
  for (const a of addresses) {
    const loop = a === "::1" || a.startsWith("127.");
    if (isNonPublicAddress(a) && !(options.allowLoopback && loop))
      throw new IngestError("address", "adresse non publique refusée");
  }
  return url;
}

/** HTML -> texte : retire ce qu'un lecteur humain ne voit pas (vecteurs d'injection classiques). */
export function htmlToText(html: string): {
  title: string | null;
  text: string;
} {
  const root = parse(html, { comment: false });
  for (const el of root.querySelectorAll(
    "script, style, noscript, template, iframe, object, embed, svg, head > meta, [hidden], [aria-hidden='true']",
  ))
    el.remove();
  for (const el of root.querySelectorAll("[style]")) {
    const style = (el.getAttribute("style") ?? "").replace(/\s+/g, "");
    if (/display:none|visibility:hidden|font-size:0|opacity:0/i.test(style))
      el.remove();
  }
  const title = root.querySelector("title")?.text.trim() || null;
  const text = root.structuredText
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

export async function ingestSource(
  rawUrl: string,
  options: IngestOptions = {},
): Promise<IngestedSource> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = await assertPublicHttpUrl(rawUrl, options);
  let res: Response;
  try {
    res = await doFetch(url, {
      redirect: "manual",
      headers: { accept: "text/html,text/plain,text/markdown;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new IngestError("fetch", "source injoignable");
  }
  if (res.status >= 300 && res.status < 400)
    throw new IngestError(
      "fetch",
      "redirection non suivie (donner l'URL finale)",
    );
  if (!res.ok)
    throw new IngestError("fetch", `source en erreur (${res.status})`);
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!/^(text\/(html|plain|markdown)|application\/xhtml)/.test(type))
    throw new IngestError("type", "type de contenu non lisible");
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES)
    throw new IngestError("size", "source trop volumineuse");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES)
    throw new IngestError("size", "source trop volumineuse");
  const body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const { title, text } =
    type.startsWith("text/html") || type.includes("xhtml")
      ? htmlToText(body)
      : { title: null, text: body.replace(/\r/g, "").trim() };
  return {
    url: url.toString(),
    title,
    text: text.slice(0, MAX_CHARS),
    truncated: text.length > MAX_CHARS,
  };
}

/** Enveloppe de données non fiables transmise au modèle : balisage explicite, aucune balise de fermeture forgeable. */
export function wrapUntrusted(source: IngestedSource): string {
  const safe = source.text.replace(/<\/?source_non_fiable[^>]*>/gi, "");
  return `<source_non_fiable url="${source.url.replace(/"/g, "")}">\n${safe}\n</source_non_fiable>`;
}
