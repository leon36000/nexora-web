// Fichiers référencés par le contenu (S10) : vidéos et sous-titres d'une section.
// Dans un fichier de page : `"media": { "asset": "video-opsys.mp4" }` et, dans la traduction,
// `"media_captions": { "asset": "video-opsys.fr-CA.vtt" }`. Au chargement, chaque nom est ramené à l'identifiant
// d'un fichier Directus :
//   - fichier présent dans `cms/content/assets/` (petit, versionné) : téléversé s'il n'existe pas déjà dans Directus
//     avec la même empreinte SHA-256 (rangée dans `description` sous la forme `sha256:<hex>`), sinon réutilisé ;
//   - fichier absent du dépôt (gros fichier, ex. la vidéo) : doit déjà exister dans Directus sous ce
//     `filename_download` ; sinon le chargement échoue en nommant le fichier.
// Idempotent. Aucun secret ici : le client Directus est reçu en paramètre.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assetRefName, type DesiredPage, type Fields } from "./content";
import type { Directus, Entity } from "./directus";

/** Nom d'un fichier : lettres, chiffres, point, tiret ; ni chemin, ni caché. */
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  vtt: "text/vtt",
};

/** Type MIME d'après l'extension ; les autres formats ne sont pas des actifs de contenu. */
export function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  const mime = MIME[ext];
  if (!ASSET_NAME.test(name) || !mime)
    throw new Error(
      `actif « ${name} » : format non admis (mp4, webm ou vtt, nom simple)`,
    );
  return mime;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type AssetRow = { id: string; description: string | null };

/** Accès aux fichiers Directus par nom ; les lignes sont classées de la plus récente à la plus ancienne. */
export type AssetStore = {
  find(name: string): Promise<AssetRow[]>;
  upload(
    name: string,
    bytes: Uint8Array,
    mime: string,
    sha256: string,
  ): Promise<string>;
};

export type AssetAction =
  | "televerse"
  | "reutilise"
  | "existant"
  | "a-televerser";

/** Identifiant provisoire affiché à blanc (aucun envoi, aucune écriture). */
export const DRY_RUN_ID = "(à téléverser)";

export async function resolveAsset(
  name: string,
  opts: { store: AssetStore; dir: string; dryRun?: boolean },
): Promise<{ id: string; action: AssetAction }> {
  const mime = mimeOf(name);
  const path = join(opts.dir, name);
  const rows = await opts.store.find(name);

  if (!existsSync(path)) {
    const existing = rows[0];
    if (!existing)
      throw new Error(
        `fichier « ${name} » absent du dépôt (cms/content/assets) et introuvable dans Directus : ` +
          "téléverser le fichier dans Directus (nom de fichier identique), puis relancer le chargement",
      );
    return { id: existing.id, action: "existant" };
  }

  const bytes = readFileSync(path);
  const sha = sha256Hex(bytes);
  const match = rows.find((r) => r.description?.includes(`sha256:${sha}`));
  if (match) return { id: match.id, action: "reutilise" };
  if (opts.dryRun) return { id: DRY_RUN_ID, action: "a-televerser" };
  const id = await opts.store.upload(name, bytes, mime, sha);
  return { id, action: "televerse" };
}

async function resolveFields(
  fields: Fields,
  resolve: (name: string) => Promise<string>,
): Promise<Fields> {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    const name = assetRefName(v);
    if (name === "invalide")
      throw new Error(
        `référence d'actif « ${k} » mal formée : seule la clé « asset » est admise`,
      );
    out[k] = name === null ? v : await resolve(name);
  }
  return out;
}

/**
 * Remplace chaque référence `{ asset }` d'une page par l'identifiant du fichier. Un même nom n'est résolu qu'une fois
 * (`resolve` peut donc téléverser ou interroger Directus sans doublon). Ne modifie pas `want`.
 */
export async function resolveAssetRefs(
  want: DesiredPage,
  resolve: (name: string) => Promise<string>,
): Promise<DesiredPage> {
  const cache = new Map<string, Promise<string>>();
  const once = (name: string) => {
    let p = cache.get(name);
    if (!p) {
      p = resolve(name);
      cache.set(name, p);
    }
    return p;
  };
  const blocks = [];
  for (const b of want.blocks) {
    const translations: Record<string, Fields> = {};
    for (const [code, f] of Object.entries(b.translations))
      translations[code] = await resolveFields(f, once);
    blocks.push({
      ...b,
      fields: await resolveFields(b.fields, once),
      translations,
    });
  }
  return { ...want, blocks };
}

/** Magasin Directus (compte administrateur du chargement). */
export function directusAssetStore(admin: Directus): AssetStore {
  return {
    async find(name) {
      const rows = await admin.get<Entity[]>(
        `/files?filter[filename_download][_eq]=${encodeURIComponent(name)}&fields=id,description,uploaded_on&sort=-uploaded_on&limit=-1`,
      );
      return (rows ?? []).map((r) => ({
        id: String(r.id),
        description: typeof r.description === "string" ? r.description : null,
      }));
    },
    async upload(name, bytes, mime, sha256) {
      const form = new FormData();
      form.append("filename_download", name);
      form.append("title", name);
      form.append("description", `sha256:${sha256}`);
      form.append(
        "file",
        new Blob([new Uint8Array(bytes)], { type: mime }),
        name,
      );
      const created = await admin.postFile<Entity>("/files", form);
      return String(created.id);
    },
  };
}
