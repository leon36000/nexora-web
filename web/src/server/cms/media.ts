/**
 * Relais des fichiers Directus (/api/media/<id>). Le jeton lecteur ne quitte jamais le serveur et Directus
 * n'a pas besoin d'être public. Seules les images raster sont servies : le SVG est refusé (D11), de même que tout
 * type exécutable par un navigateur (HTML, PDF…).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RASTER = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);

export type MediaDeps = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
): Promise<Response> {
  if (!UUID.test(id)) return plain(400, "identifiant invalide");
  let upstream: Response;
  try {
    upstream = await (deps.fetchImpl ?? fetch)(
      `${deps.baseUrl.replace(/\/+$/, "")}/assets/${id}`,
      {
        headers: { authorization: `Bearer ${deps.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(deps.timeoutMs ?? 8_000),
      },
    );
  } catch {
    return plain(502, "fichier indisponible");
  }
  if (upstream.status === 403 || upstream.status === 404) {
    await upstream.body?.cancel();
    return plain(404, "fichier introuvable");
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
  if (!RASTER.has(type)) {
    await upstream.body?.cancel();
    return plain(415, "type de fichier non servi");
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
