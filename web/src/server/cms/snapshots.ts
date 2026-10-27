import { createHash, randomBytes } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Dernière version connue de chaque contenu (instantané), en mémoire et sur disque.
 * Sert uniquement quand Directus est en panne. Le disque la fait survivre à un redémarrage
 * du site. Écritures atomiques (fichier temporaire puis renommage) ; toute erreur d'E/S est
 * ignorée : un instantané manquant ne doit jamais faire échouer une requête.
 */
export type SnapshotStore = {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
};

export function createSnapshotStore(opts: {
  dir: string | null;
}): SnapshotStore {
  const mem = new Map<string, string>(); // clé -> JSON sérialisé
  const file = (key: string) =>
    opts.dir
      ? join(
          opts.dir,
          `${createHash("sha256").update(key).digest("hex").slice(0, 32)}.json`,
        )
      : null;

  return {
    get<T>(key: string): T | undefined {
      let json = mem.get(key);
      if (json === undefined) {
        const f = file(key);
        if (f) {
          try {
            const stored = JSON.parse(readFileSync(f, "utf8")) as {
              key: string;
              json: string;
            };
            if (stored.key === key) {
              json = stored.json;
              mem.set(key, json);
            }
          } catch {
            // pas d'instantané sur disque
          }
        }
      }
      if (json === undefined) return undefined;
      try {
        return JSON.parse(json) as T;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      const json = JSON.stringify(value);
      if (mem.get(key) === json) return;
      mem.set(key, json);
      const f = file(key);
      if (!f || !opts.dir) return;
      try {
        mkdirSync(opts.dir, { recursive: true });
        const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
        writeFileSync(tmp, JSON.stringify({ key, json }), { mode: 0o600 });
        renameSync(tmp, f);
      } catch {
        // disque indisponible : l'instantané mémoire reste
      }
    },
    delete(key) {
      mem.delete(key);
      const f = file(key);
      if (!f) return;
      try {
        rmSync(f, { force: true });
      } catch {
        // rien
      }
    },
  };
}
