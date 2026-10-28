import http from "node:http";

/**
 * Méthodes HTTP exotiques (TRACE, PROPFIND, PURGE…) : réponse 405 propre AVANT Next.js.
 *
 * Next.js construit un `Request` pour `proxy.ts` avant d'y entrer : `TRACE` lève alors une erreur interne (500 avec la
 * page d'erreur de Next) et les autres méthodes inconnues sont servies comme un GET (200 avec la page). `proxy.ts` ne peut
 * donc pas les refuser ; la garde se place sur l'événement `request` du serveur HTTP de Node, installée par
 * `instrumentation.ts`. La consigne au proxy frontal (guide §9) reste la première barrière.
 */
export const ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const;
const ALLOWED = new Set<string>(ALLOWED_METHODS);
const MARK = Symbol.for("nexora.methodGuard");

type Emit = (event: string | symbol, ...args: unknown[]) => boolean;
type Guarded = Emit & { [MARK]?: Emit };

function reject(res: http.ServerResponse): void {
  const body = "Method Not Allowed\n";
  res.writeHead(405, {
    allow: ALLOWED_METHODS.join(", "),
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
    "content-security-policy": "default-src 'none'",
    "x-content-type-options": "nosniff",
    connection: "close",
  });
  res.end(body);
}

/** Installe la garde (une seule fois) et renvoie la fonction qui la retire. */
export function installMethodGuard(): () => void {
  const proto = http.Server.prototype as unknown as { emit: Guarded };
  if (proto.emit[MARK]) return () => {};
  const original = proto.emit as Emit;
  const guarded: Guarded = function (this: http.Server, event, ...args) {
    if (event === "request") {
      const [req, res] = args as [http.IncomingMessage, http.ServerResponse];
      if (!ALLOWED.has(req.method ?? "")) {
        reject(res);
        return true;
      }
    }
    return original.call(this, event, ...args);
  };
  guarded[MARK] = original;
  proto.emit = guarded;
  return () => {
    if (proto.emit === guarded) proto.emit = original as Guarded;
  };
}
