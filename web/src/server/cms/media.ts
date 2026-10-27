/**
 * Relais des fichiers Directus (/api/media/<id>). Le jeton lecteur ne quitte jamais le serveur et Directus
 * n'a pas besoin d'être public. Seuls servis : les images raster, les vidéos MP4 et WebM et les sous-titres WebVTT.
 * Le SVG est refusé (D11), de même que tout type exécutable par un navigateur (HTML, PDF…).
 *
 * Lecture vidéo : l'en-tête `Range` est transmis à Directus, et la réponse 206 / 416 est relayée telle quelle
 * (`content-range`, `content-length`, `accept-ranges`), pour que le lecteur puisse avancer dans le fichier.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RASTER = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const VIDEO = new Set(["video/mp4", "video/webm"]);
const TEXT_TRACK = new Set(["text/vtt"]);
const SERVED = new Set([...RASTER, ...VIDEO, ...TEXT_TRACK]);
/** Une seule plage d'octets : `bytes=a-b`, `bytes=a-` ou `bytes=-n`. Tout autre en-tête est ignoré. */
const RANGE = /^bytes=(?:\d+-\d*|-\d+)$/;

export type MediaDeps = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type MediaRequest = {
  /** En-tête `Range` de la requête du navigateur (lecture vidéo). */
  range?: string | null;
};

const plain = (status: number, text: string) =>
  new Response(text, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export async function handleMedia(
  id: string,
  deps: MediaDeps,
  req: MediaRequest = {},
): Promise<Response> {
  if (!UUID.test(id)) return plain(400, "identifiant invalide");
  const range =
    req.range && req.range.length <= 100 && RANGE.test(req.range)
      ? req.range
      : null;
  // Le délai couvre l'obtention des en-têtes seulement : un fichier vidéo peut prendre plus de temps à envoyer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 8_000);
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(
      `${deps.baseUrl.replace(/\/+$/, "")}/assets/${id}`,
      {
        headers: {
          authorization: `Bearer ${deps.token}`,
          ...(range ? { range } : {}),
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
  } catch {
    return plain(502, "fichier indisponible");
  } finally {
    clearTimeout(timer);
  }
  if (upstream.status === 403 || upstream.status === 404) {
    await upstream.body?.cancel();
    return plain(404, "fichier introuvable");
  }
  if (upstream.status === 416) {
    // plage hors du fichier : pas de corps, la taille réelle reste indiquée
    await upstream.body?.cancel();
    return new Response(null, {
      status: 416,
      headers: relayed(upstream),
    });
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return plain(502, "fichier indisponible");
  }
  const type =
    (upstream.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";
  if (!SERVED.has(type)) {
    await upstream.body?.cancel();
    return plain(415, "type de fichier non servi");
  }
  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers: {
      "content-type": type,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      ...relayed(upstream),
    },
  });
}

/** En-têtes de plage et de taille relayés de Directus ; `accept-ranges` est toujours annoncé. */
function relayed(upstream: Response): Record<string, string> {
  const out: Record<string, string> = { "accept-ranges": "bytes" };
  for (const name of ["content-range", "content-length"]) {
    const v = upstream.headers.get(name);
    if (v) out[name] = v;
  }
  return out;
}
