import { join } from "node:path";
import { type CmsClient, createCmsClient } from "./client";
import { createSnapshotStore, type SnapshotStore } from "./snapshots";

/**
 * Configuration et singletons du CMS, lus dans l'environnement À L'USAGE (jamais au chargement du module).
 * - DIRECTUS_URL                : adresse interne de Directus (défaut : http://localhost:8456)
 * - DIRECTUS_READER_TOKEN       : jeton « Lecteur site » (contenu publié ET brouillons de la table principale sans licence :
 *                                 le filtre status = published est appliqué par le code)
 * - DIRECTUS_PUBLISHER_TOKEN    : jeton « Publication » ; sert UNIQUEMENT à l'aperçu (lecture des versions)
 * - CMS_SNAPSHOT_DIR            : dossier des instantanés (défaut : .cache/cms sous le dossier de travail)
 * - CMS_TIMEOUT_MS              : délai par requête (défaut 4000)
 */
export function cmsBaseUrl(): string {
  return (process.env.DIRECTUS_URL ?? "http://localhost:8456").replace(
    /\/+$/,
    "",
  );
}

function timeoutMs(): number {
  const n = Number(process.env.CMS_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 4_000;
}

export function readerClient(): CmsClient {
  return createCmsClient({
    baseUrl: cmsBaseUrl(),
    token: process.env.DIRECTUS_READER_TOKEN ?? "",
    timeoutMs: timeoutMs(),
  });
}

/** Jeton « Publication » : à n'utiliser qu'en Draft Mode (aperçu authentifié). */
export function previewClient(): CmsClient {
  return createCmsClient({
    baseUrl: cmsBaseUrl(),
    token: process.env.DIRECTUS_PUBLISHER_TOKEN ?? "",
    timeoutMs: timeoutMs(),
  });
}

let store: SnapshotStore | undefined;
export function snapshotStore(): SnapshotStore {
  store ??= createSnapshotStore({
    dir: process.env.CMS_SNAPSHOT_DIR ?? join(process.cwd(), ".cache", "cms"),
  });
  return store;
}
