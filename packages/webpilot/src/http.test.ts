import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSafeHttpClient, SafeFetchError } from "./http.ts";

let server: Server;
let port = 0;
const hits: { path: string; headers: Record<string, unknown> }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push({ path: req.url ?? "", headers: req.headers });
    const path = (req.url ?? "").split("?")[0];
    if (path === "/ok") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>Bonjour</h1>");
    } else if (path === "/to-ok") {
      res.writeHead(302, { location: "/ok" });
      res.end();
    } else if (path === "/to-private") {
      res.writeHead(302, { location: "http://10.0.0.5/secret" });
      res.end();
    } else if (path === "/to-meta") {
      res.writeHead(301, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      res.end();
    } else if (path === "/to-file") {
      res.writeHead(302, { location: "file:///etc/passwd" });
      res.end();
    } else if (path === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (path === "/big") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("x".repeat(100_000));
    } else if (path === "/slow") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("lent");
      }, 2000);
    } else if (path === "/empty") {
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404);
      res.end("introuvable");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
});

const PUBLIC = "93.184.216.34";
/** Client qui joint le serveur local en croyant joindre une adresse publique (la jonction se fait après la validation). */
function client(
  extra: Partial<Parameters<typeof createSafeHttpClient>[0]> = {},
) {
  return createSafeHttpClient({
    userAgent: "NexoraWebPilot/test",
    allowedPorts: [80, 443, port],
    maxBytes: 50_000,
    timeoutMs: 1000,
    maxRedirects: 3,
    resolve: async () => [PUBLIC],
    dial: (_ip, p) => ({ address: "127.0.0.1", port: p }),
    ...extra,
  });
}
const url = (path: string) => `http://pilote.example:${port}${path}`;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof SafeFetchError ? e.code : `autre:${String(e)}`;
  }
}

describe("client HTTP de sortie : lecture", () => {
  it("lit une page, s'identifie et n'envoie ni cookies ni autorisation", async () => {
    hits.length = 0;
    const res = await client().get(url("/ok"));
    expect(res.status).toBe(200);
    expect(new TextDecoder().decode(res.body)).toBe("<h1>Bonjour</h1>");
    expect(res.url).toBe(url("/ok"));
    const h = hits[0]?.headers ?? {};
    expect(h["user-agent"]).toBe("NexoraWebPilot/test");
    expect(h.cookie).toBeUndefined();
    expect(h.authorization).toBeUndefined();
    expect(h.host).toBe(`pilote.example:${port}`);
  });

  it("suit une redirection et renvoie l'adresse finale", async () => {
    const res = await client().get(url("/to-ok"));
    expect(res.status).toBe(200);
    expect(res.url).toBe(url("/ok"));
    expect(res.redirects).toBe(1);
  });

  it("renvoie un statut 404 sans lever d'erreur (l'appelant décide)", async () => {
    const res = await client().get(url("/rien"));
    expect(res.status).toBe(404);
  });

  it("interrompt une réponse trop volumineuse", async () => {
    expect(await code(client().get(url("/big")))).toBe("response_too_large");
  });

  it("interrompt une cible trop lente", async () => {
    expect(await code(client({ timeoutMs: 300 }).get(url("/slow")))).toBe(
      "target_timeout",
    );
  });

  it("refuse une boucle de redirections", async () => {
    expect(await code(client().get(url("/loop")))).toBe("too_many_redirects");
  });
});

describe("client HTTP de sortie : garde SSRF", () => {
  const blocked = [
    "http://127.0.0.1:80/",
    "http://localhost/",
    "http://10.1.2.3/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0.0.0.0/",
    "http://metadata.google.internal/",
    "http://searxng/",
    "http://db.local/",
    "http://exemple.internal/",
  ];
  for (const target of blocked) {
    it(`refuse ${target}`, async () => {
      const real = createSafeHttpClient({
        userAgent: "t",
        allowedPorts: [80, 443],
        maxBytes: 1000,
        timeoutMs: 500,
        maxRedirects: 2,
      });
      expect(await code(real.get(target))).toBe("url_not_allowed");
    });
  }

  it("refuse les schémas autres que http et https, les identifiants et les ports hors liste", async () => {
    const c = client();
    expect(await code(c.get("file:///etc/passwd"))).toBe("url_not_allowed");
    expect(await code(c.get("ftp://pilote.example/"))).toBe("url_not_allowed");
    expect(await code(c.get("gopher://pilote.example/"))).toBe(
      "url_not_allowed",
    );
    expect(await code(c.get(`http://u:p@pilote.example:${port}/ok`))).toBe(
      "url_not_allowed",
    );
    expect(await code(c.get("http://pilote.example:22/"))).toBe(
      "url_not_allowed",
    );
    expect(await code(c.get("http://pilote.example:5432/"))).toBe(
      "url_not_allowed",
    );
    expect(await code(c.get("pas une adresse"))).toBe("url_not_allowed");
  });

  it("refuse un nom qui se résout vers une adresse privée", async () => {
    for (const ip of [
      "10.0.0.9",
      "127.0.0.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
    ]) {
      const c = client({ resolve: async () => [ip], dial: undefined });
      expect(await code(c.get(url("/ok")))).toBe("url_not_allowed");
    }
  });

  it("refuse si UNE des adresses résolues est privée", async () => {
    const c = client({ resolve: async () => [PUBLIC, "10.0.0.9"] });
    expect(await code(c.get(url("/ok")))).toBe("url_not_allowed");
  });

  it("refuse une redirection vers le réseau privé, les métadonnées ou un fichier", async () => {
    const c = client({
      resolve: async (host) => (host === "pilote.example" ? [PUBLIC] : [host]),
    });
    expect(await code(c.get(url("/to-private")))).toBe("url_not_allowed");
    expect(await code(c.get(url("/to-meta")))).toBe("url_not_allowed");
    expect(await code(c.get(url("/to-file")))).toBe("url_not_allowed");
  });

  it("rebond DNS : la connexion se fait à l'adresse validée, le nom n'est résolu qu'une fois par saut", async () => {
    let calls = 0;
    const dialed: string[] = [];
    const c = client({
      // Première réponse publique, toute réponse suivante privée : un client qui résoudrait deux fois se ferait piéger.
      resolve: async () => (++calls === 1 ? [PUBLIC] : ["10.0.0.9"]),
      dial: (ip, p) => {
        dialed.push(ip);
        return { address: "127.0.0.1", port: p };
      },
    });
    const res = await c.get(url("/ok"));
    expect(res.status).toBe(200);
    expect(calls).toBe(1);
    expect(dialed).toEqual([PUBLIC]);
  });

  it("une adresse interne explicitement approuvée (service de recherche) passe, jamais les métadonnées", async () => {
    const trusted = createSafeHttpClient({
      userAgent: "t",
      allowedPorts: [port],
      maxBytes: 1000,
      timeoutMs: 1000,
      maxRedirects: 0,
      trustedHosts: ["127.0.0.1"],
    });
    expect((await trusted.get(`http://127.0.0.1:${port}/ok`)).status).toBe(200);
    expect(await code(trusted.get(`http://169.254.169.254:${port}/`))).toBe(
      "url_not_allowed",
    );
    expect(await code(trusted.get(`http://10.0.0.5:${port}/`))).toBe(
      "url_not_allowed",
    );
  });

  it("DNS inconnu : cible injoignable, pas un refus", async () => {
    const c = client({
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(await code(c.get(url("/ok")))).toBe("target_unreachable");
  });

  it("le crochet de saut peut refuser une redirection vers un autre hôte", async () => {
    const c = client();
    const seen: string[] = [];
    const out = await code(
      c.get(url("/to-ok"), {
        beforeHop: async (u) => {
          seen.push(u.pathname);
          if (u.pathname === "/ok")
            throw new SafeFetchError("url_not_allowed", "refusé");
        },
      }),
    );
    expect(out).toBe("url_not_allowed");
    expect(seen).toEqual(["/to-ok", "/ok"]);
  });
});
