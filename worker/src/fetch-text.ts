import { checkOutboundUrl, readLimitedBytes } from "@nexora/net";

/**
 * Lecture d'un petit fichier texte public (fichier de sommes de contrôle publié par l'éditeur d'une
 * image). HTTPS seulement ; chaque adresse (y compris après redirection) doit être publique : ni
 * réseau interne, ni lien local, ni métadonnées du nuage (garde commune @nexora/net, politique
 * « public seulement »). Redirections limitées, taille et durée bornées.
 */
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;

export interface FetchTextOptions {
  fetchImpl?: typeof fetch;
  resolve?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
}

export async function fetchPublicText(
  raw: string,
  options: FetchTextOptions = {},
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!current.startsWith("https://"))
      throw new Error("seul HTTPS est admis pour lire un fichier de sommes");
    const check = await checkOutboundUrl(
      current,
      { allowInternal: false, allow: [] },
      options.resolve ? { resolve: options.resolve } : {},
    );
    if (!check.ok) throw new Error(`adresse refusée : ${check.reason}`);
    const res = await doFetch(current, {
      redirect: "manual",
      headers: { accept: "text/plain, */*" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("redirection sans destination");
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`réponse ${res.status}`);
    const read = await readLimitedBytes(res, MAX_BYTES);
    if (!read.ok) throw new Error("fichier trop volumineux");
    return new TextDecoder().decode(read.bytes);
  }
  throw new Error("trop de redirections");
}
