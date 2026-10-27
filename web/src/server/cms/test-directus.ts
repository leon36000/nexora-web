/**
 * Faux Directus pour les tests : un vrai serveur HTTP qui évalue les filtres comme Directus
 * (assez pour `_and`, `_or`, `_eq`, `_empty`, filtre relationnel `pages_id.status`) et qui
 * enregistre chaque requête (chemin, requête, jeton reçu).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Json = Record<string, unknown>;

export type Seen = {
  path: string;
  query: URLSearchParams;
  authorization: string;
};

export type FakePage = Json & {
  id: string;
  status: string;
  translations: Json[];
  blocks: Json[];
};

export type FakeDirectus = {
  url: string;
  seen: Seen[];
  pages: FakePage[];
  /** Versions : clé -> page fusionnée renvoyée par `?version=`. */
  versions: {
    id: string;
    key: string;
    name: string;
    item: string;
    date_updated: string;
    page: FakePage;
  }[];
  /** Mode de panne : "ok" | "500" | "garbage" | "hang". */
  mode: "ok" | "500" | "garbage" | "hang";
  /** Ignore les filtres reçus (simule un filtre oublié ou ignoré) : renvoie tout. */
  ignoreFilters: boolean;
  close(): Promise<void>;
};

function matches(
  row: Json,
  filter: unknown,
  ctx: { pages: FakePage[] },
): boolean {
  if (!filter || typeof filter !== "object") return true;
  for (const [k, v] of Object.entries(filter as Json)) {
    if (k === "_and")
      return (v as unknown[]).every((f) => matches(row, f, ctx));
    if (k === "_or") return (v as unknown[]).some((f) => matches(row, f, ctx));
    const value = (row as Json)[k];
    if (k === "pages_id" && v && typeof v === "object") {
      const page = ctx.pages.find((p) => p.id === row.pages_id);
      if (!page) return false;
      if (!matches(page, v, ctx)) return false;
      continue;
    }
    if (v && typeof v === "object") {
      const ops = v as Json;
      for (const [op, arg] of Object.entries(ops)) {
        if (op === "_eq") {
          if (arg === "")
            throw new Error("Directus refuse _eq avec une chaîne vide");
          if (value !== arg) return false;
        } else if (op === "_empty") {
          const empty = value === null || value === undefined || value === "";
          if (empty !== arg) return false;
        } else if (op === "_null") {
          if ((value === null || value === undefined) !== arg) return false;
        } else throw new Error(`opérateur non géré : ${op}`);
      }
    }
  }
  return true;
}

export async function startFakeDirectus(): Promise<FakeDirectus> {
  const state: FakeDirectus = {
    url: "",
    seen: [],
    pages: [],
    versions: [],
    mode: "ok",
    ignoreFilters: false,
    close: async () => {},
  };
  const sockets = new Set<import("node:net").Socket>();
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    state.seen.push({
      path: url.pathname,
      query: url.searchParams,
      authorization: String(req.headers.authorization ?? ""),
    });
    if (state.mode === "hang") return; // ne répond jamais
    if (state.mode === "500") {
      res.writeHead(500).end("boom");
      return;
    }
    if (state.mode === "garbage") {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end("<html>pas du json");
      return;
    }
    const send = (status: number, body: unknown) =>
      res
        .writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(body));

    try {
      const filter = url.searchParams.get("filter");
      const parsed = filter ? JSON.parse(filter) : null;
      const limit = Number(url.searchParams.get("limit") ?? "100");

      if (url.pathname === "/items/pages_translations") {
        const rows = state.pages.flatMap((p) =>
          p.translations.map((t) => ({ ...t, pages_id: p.id })),
        );
        const hit = state.ignoreFilters
          ? rows
          : rows.filter((r) => matches(r, parsed, { pages: state.pages }));
        return send(200, { data: limit > 0 ? hit.slice(0, limit) : hit });
      }
      const one = /^\/items\/pages\/([^/]+)$/.exec(url.pathname);
      if (one) {
        const id = decodeURIComponent(one[1] as string);
        const version = url.searchParams.get("version");
        if (version) {
          const v = state.versions.find(
            (x) => x.key === version && x.item === id,
          );
          return v ? send(200, { data: v.page }) : send(404, { errors: [{}] });
        }
        const p = state.pages.find((x) => x.id === id);
        return p ? send(200, { data: p }) : send(403, { errors: [{}] });
      }
      if (url.pathname === "/versions") {
        const list = state.versions
          .filter(
            (v) =>
              !parsed ||
              matches(
                { ...v, collection: "pages" } as unknown as Json,
                parsed,
                { pages: state.pages },
              ),
          )
          .sort((a, b) => b.date_updated.localeCompare(a.date_updated))
          .map(({ page: _p, ...v }) => v);
        return send(200, {
          data: list.slice(0, limit > 0 ? limit : list.length),
        });
      }
      return send(404, {
        errors: [{ message: "route inconnue du faux Directus" }],
      });
    } catch (e) {
      return send(400, { errors: [{ message: String(e) }] });
    }
  });
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  state.close = () =>
    new Promise<void>((r) => {
      for (const s of sockets) s.destroy();
      server.close(() => r());
    });
  return state;
}
