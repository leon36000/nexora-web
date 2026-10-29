import { and, apiKeys, type Database, eq, gt, isNull, or } from "@nexora/db";
import type { Keyring } from "../vault/crypto";
import { putSecret, readSecret } from "../vault/store";
import {
  createApiKey,
  hashApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
} from "./keys";

/**
 * Accès modèle automatique d'une instance WorkStudio (G8) : à la mise en service, l'organisation du client reçoit
 * une clé de la passerelle liée à SON portefeuille ; les jetons sont donc facturés au client, sans réglage de sa part.
 * La valeur de la clé n'existe qu'à la création : elle est rangée chiffrée dans le coffre (`workstudio-key.<org>`,
 * type « other », jamais lisible par une route d'administration de fournisseur) pour que le déploiement la relise.
 * Rend les trois réglages que WorkStudio lit déjà (`NEXORA_UPSTREAM_URL`, `_MODEL`, `_KEY`).
 */

export const WORKSTUDIO_KEY_NAME = "WorkStudio (automatique)";
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,40}\/[a-z0-9][a-z0-9._:-]{0,80}$/;

export interface ModelAccessInput {
  organizationId: string;
  /** Adresse de la passerelle, terminée par `/v1`. */
  gatewayUrl: string;
  /** Modèle par défaut de WorkStudio (identifiant public du catalogue). */
  defaultModel: string;
  /** Développement seulement : admet http sur la boucle locale. */
  allowLoopback?: boolean;
  now?: Date;
}

export interface ModelAccess {
  created: boolean;
  env: {
    NEXORA_UPSTREAM_URL: string;
    NEXORA_UPSTREAM_MODEL: string;
    NEXORA_UPSTREAM_KEY: string;
  };
}

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])$/;

function checkedGatewayUrl(raw: string, allowLoopback: boolean): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("adresse de passerelle illisible");
  }
  if (url.username || url.password)
    throw new Error("adresse de passerelle : aucun identifiant dans l'adresse");
  const secure = url.protocol === "https:";
  const local =
    allowLoopback && url.protocol === "http:" && LOOPBACK.test(url.hostname);
  if (!secure && !local) throw new Error("adresse de passerelle : https exigé");
  const clean = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  if (!clean.endsWith("/v1"))
    throw new Error("adresse de passerelle : doit se terminer par /v1");
  return clean;
}

export async function ensureModelAccess(
  db: Database,
  keyring: Keyring,
  input: ModelAccessInput,
): Promise<ModelAccess> {
  const url = checkedGatewayUrl(input.gatewayUrl, input.allowLoopback ?? false);
  if (!MODEL_ID.test(input.defaultModel))
    throw new Error("modèle par défaut : identifiant public invalide");
  const now = input.now ?? new Date();
  const ref = `workstudio-key.${input.organizationId}`;
  const env = (key: string) => ({
    NEXORA_UPSTREAM_URL: url,
    NEXORA_UPSTREAM_MODEL: input.defaultModel,
    NEXORA_UPSTREAM_KEY: key,
  });

  // Clé déjà rangée : elle sert tant qu'elle est active et à cette organisation.
  let stored: string | null = null;
  try {
    stored = await readSecret(db, keyring, ref);
  } catch {
    stored = null;
  }
  if (stored) {
    const [row] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, hashApiKey(stored)),
          eq(apiKeys.organizationId, input.organizationId),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      );
    if (row) return { created: false, env: env(stored) };
  }

  const { key } = await createApiKey(db, {
    organizationId: input.organizationId,
    name: WORKSTUDIO_KEY_NAME,
    maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION,
  });
  await putSecret(db, keyring, { ref, value: key, kind: "other" });
  return { created: true, env: env(key) };
}
