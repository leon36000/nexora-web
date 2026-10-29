import http from "node:http";
import net from "node:net";
import {
  type AddressPolicy,
  checkDestination,
  checkUrlSyntax,
  type Resolver,
  systemResolver,
} from "./address.ts";

/**
 * Mandataire de sortie du navigateur : écoute sur 127.0.0.1 DANS le conteneur et est le seul chemin du navigateur
 * vers le réseau. Pour chaque connexion (HTTP direct ou tunnel CONNECT de HTTPS / WebSocket) il résout le nom UNE
 * fois, classe toutes les adresses (`checkDestination`), puis se connecte À L'ADRESSE VALIDÉE : le navigateur ne résout
 * jamais lui-même (pas de rebond DNS entre le contrôle et la connexion) et ne peut pas joindre une adresse privée,
 * de boucle locale, de lien local ni les métadonnées du nuage, même par redirection ou sous-ressource.
 * Les tunnels CONNECT transportent du TLS de bout en bout : le mandataire ne lit jamais le contenu.
 */
export interface EgressProxyOptions {
  policy: AddressPolicy;
  resolve?: Resolver;
  /** ESSAIS : adresse et port réellement joints, APRÈS validation. */
  dial?: (address: string, port: number) => { address: string; port: number };
  /** Appelé à chaque refus ; ne reçoit jamais l'adresse résolue. */
  onBlocked?: (host: string, reason: string) => void;
  connectTimeoutMs?: number;
  /** Inactivité maximale d'une connexion. */
  idleTimeoutMs?: number;
  maxConnections?: number;
}

export interface EgressProxy {
  listen(): Promise<{ port: number }>;
  close(): Promise<void>;
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const MAX_PLAIN_BODY = 10_000_000;

/** Corps d'une requête en clair (HTTP, pas HTTPS) lu en entier, plafonné : permet de réessayer une autre adresse. */
async function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  const parts: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > MAX_PLAIN_BODY) return null;
    parts.push(chunk as Buffer);
  }
  return Buffer.concat(parts);
}

const REFUSED_BODY = "Destination refusée par la politique de sortie.\n";

export function createEgressProxy(options: EgressProxyOptions): EgressProxy {
  const resolve = options.resolve ?? systemResolver;
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
  const server = http.createServer();
  server.maxConnections = options.maxConnections ?? 512;
  server.requestTimeout = 0;
  const sockets = new Set<net.Socket>();
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });

  const dialTarget = (address: string, port: number) =>
    options.dial?.(address, port) ?? { address, port };

  /** Se connecte à la première adresse validée qui répond. */
  function connectAny(addresses: string[], port: number): Promise<net.Socket> {
    return new Promise((resolveSocket, reject) => {
      let index = 0;
      const next = () => {
        const address = addresses[index++];
        if (address === undefined) {
          reject(new Error("aucune adresse n'a répondu"));
          return;
        }
        const target = dialTarget(address, port);
        const socket = net.connect({
          host: target.address,
          port: target.port,
        });
        socket.setTimeout(connectTimeoutMs);
        socket.once("connect", () => {
          socket.setTimeout(idleTimeoutMs);
          socket.removeListener("error", onError);
          resolveSocket(socket);
        });
        const onError = () => {
          socket.destroy();
          next();
        };
        socket.once("error", onError);
        socket.once("timeout", onError);
      };
      next();
    });
  }

  server.on("request", (req, res) => {
    const refuse = (status: number, host: string, reason: string) => {
      if (status === 403) options.onBlocked?.(host, reason);
      if (res.writableEnded) return;
      if (!res.headersSent)
        res.writeHead(status, {
          "content-type": "text/plain; charset=utf-8",
          connection: "close",
          // Permet au pilote du navigateur de reconnaître un refus de sortie (et non une vraie réponse 403 de la cible).
          "x-nexora-egress-refused": "1",
        });
      res.end(REFUSED_BODY);
    };
    void (async () => {
      const raw = req.url ?? "";
      if (!/^http:\/\//i.test(raw) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
        refuse(400, "", "requête non absolue");
        return;
      }
      const syntax = checkUrlSyntax(raw, options.policy);
      let hostForLog = "";
      try {
        hostForLog = new URL(raw).hostname;
      } catch {
        // adresse invalide : refusée plus bas
      }
      if (!syntax.ok) {
        refuse(403, hostForLog, syntax.reason);
        return;
      }
      const url = syntax.url;
      if (url.protocol !== "http:") {
        // Le HTTPS passe par CONNECT : une requête en clair vers https:// n'a pas de sens ici.
        refuse(403, url.hostname, "schéma non permis sur ce canal");
        return;
      }
      const port = url.port ? Number(url.port) : 80;
      const dest = await checkDestination(
        url.hostname,
        port,
        options.policy,
        resolve,
      );
      if (!dest.ok) {
        refuse(403, url.hostname, dest.reason);
        return;
      }
      const headers: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(req.headers))
        if (!HOP_BY_HOP.has(name) && value !== undefined) headers[name] = value;
      headers.host = url.host;
      const body = await readBody(req);
      if (body === null) {
        refuse(413, url.hostname, "corps trop volumineux");
        return;
      }
      // Connexion à une adresse VALIDÉE (littérale : aucune résolution) ; la suivante est essayée si celle-ci ne répond pas.
      const attempt = (index: number): void => {
        const address = dest.addresses[index];
        if (address === undefined) {
          refuse(502, url.hostname, "connexion impossible");
          return;
        }
        const target = dialTarget(address, port);
        const upstream = http.request({
          host: target.address,
          port: target.port,
          method: req.method,
          path: `${url.pathname}${url.search}`,
          headers,
          agent: false,
          timeout: connectTimeoutMs,
        });
        let answered = false;
        upstream.on("response", (up) => {
          answered = true;
          const out: http.OutgoingHttpHeaders = {};
          for (const [name, value] of Object.entries(up.headers))
            if (!HOP_BY_HOP.has(name) && value !== undefined) out[name] = value;
          res.writeHead(up.statusCode ?? 502, out);
          up.pipe(res);
        });
        upstream.on("timeout", () => upstream.destroy());
        upstream.on("error", () => {
          if (answered) res.destroy();
          else if (!res.headersSent && !upstream.socket?.bytesWritten)
            attempt(index + 1);
          else refuse(502, url.hostname, "erreur de la cible");
        });
        res.on("close", () => upstream.destroy());
        upstream.end(body);
      };
      attempt(0);
    })().catch(() => {
      if (!res.headersSent) refuse(502, "", "erreur interne");
      else res.destroy();
    });
  });

  server.on("connect", (req, duplex, head) => {
    const clientSocket = duplex as net.Socket;
    const deny = (status: number, host: string, reason: string) => {
      if (status === 403) options.onBlocked?.(host, reason);
      clientSocket.end(
        `HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Bad Request"}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`,
      );
    };
    clientSocket.on("error", () => clientSocket.destroy());
    void (async () => {
      const m = /^(\[[0-9a-f:.]+\]|[^:\s]+):(\d{1,5})$/i.exec(req.url ?? "");
      if (!m) {
        deny(400, "", "autorité invalide");
        return;
      }
      const host = (m[1] as string).replace(/^\[|\]$/g, "");
      const port = Number(m[2]);
      const dest = await checkDestination(host, port, options.policy, resolve);
      if (!dest.ok) {
        deny(403, host, dest.reason);
        return;
      }
      let upstream: net.Socket;
      try {
        upstream = await connectAny(dest.addresses, port);
      } catch {
        clientSocket.end(
          "HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\ncontent-length: 0\r\n\r\n",
        );
        return;
      }
      upstream.on("error", () => clientSocket.destroy());
      upstream.on("timeout", () => upstream.destroy());
      clientSocket.setTimeout(idleTimeoutMs, () => clientSocket.destroy());
      clientSocket.on("close", () => upstream.destroy());
      upstream.on("close", () => clientSocket.destroy());
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    })().catch(() => clientSocket.destroy());
  });

  return {
    listen: () =>
      new Promise((resolveListen, reject) => {
        server.once("error", reject);
        // Boucle locale du conteneur seulement, port choisi par le système.
        server.listen(0, "127.0.0.1", () => {
          resolveListen({ port: (server.address() as net.AddressInfo).port });
        });
      }),
    close: () =>
      new Promise((resolveClose) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolveClose());
      }),
  };
}
