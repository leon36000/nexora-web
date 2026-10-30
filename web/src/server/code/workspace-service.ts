import { randomBytes, randomUUID } from "node:crypto";
import {
  type CodeHostingConfig,
  type WorkspaceDriver,
  WorkspaceDriverError,
  type WorkspaceRuntimeState,
} from "@nexora/code";
import {
  and,
  apiKeys,
  codeWorkspaces,
  type Database,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "@nexora/db";
import type { Logger } from "@nexora/log";
import {
  ApiKeyLimitError,
  createApiKey,
  MAX_ACTIVE_KEYS_PER_ORGANIZATION,
  revokeApiKey,
} from "../gateway/keys";
import type {
  CodeCliInfo,
  CodeWorkspaceService,
  CodeWorkspaceState,
} from "../products/code-workspace";
import type { Keyring } from "../vault/crypto";
import { putSecret, readSecret, revokeSecret } from "../vault/store";

/**
 * Environnement Nexora Code hébergé : un conteneur `nexora/code-workspace` par personne, sur nos serveurs, derrière un
 * `WorkspaceDriver` (Docker aujourd'hui, le module VPS plus tard). Implémente `CodeWorkspaceService` du panneau.
 *
 * - **Secrets** : le mot de passe du serveur est rangé chiffré au coffre (`code-workspace-password.<id>`), la clé `nxk_`
 *   dédiée de l'environnement n'est qu'une ligne de `api_keys` (empreinte, révocable depuis « Modèles et clés ») ; l'une
 *   et l'autre ne vont qu'à l'environnement du processus `docker`, jamais dans une commande ni un journal.
 * - **Espace** : un environnement neuf réserve `RESERVE_BYTES` dans le quota (produit `code`) ; la tâche périodique du
 *   worker remplace cette réserve par la taille mesurée du volume. Sans espace : `quota_exceeded`, rien n'est créé.
 * - **Solde nul** : l'environnement démarre (il n'appelle aucun modèle) ; c'est la passerelle qui refuse les appels.
 */

/** Espace réservé au démarrage d'un environnement (et marge exigée pour redémarrer un environnement existant). */
export const RESERVE_BYTES = 64 * 1_000_000;
export const WORKSPACE_KEY_NAME = "Nexora Code (environnement hébergé)";
export const passwordRef = (workspaceId: string) =>
  `code-workspace-password.${workspaceId}`;

export type WorkspaceRow = typeof codeWorkspaces.$inferSelect;

export interface WorkspaceServiceDeps {
  db: () => Database;
  keyring: () => Keyring;
  driver: WorkspaceDriver;
  config: CodeHostingConfig;
  siteUrl: string;
  now: () => Date;
  log: Logger;
  /** Compte (ou libère) de l'espace du produit `code` ; refuse (`quota_exceeded`) un ajout au-delà de l'offre. */
  record: (
    organizationId: string,
    deltaBytes: number,
  ) => Promise<{ ok: true } | { ok: false; reason: "quota_exceeded" }>;
  /** Commande d'installation du CLI ; `null` tant que la sortie n'est pas publiée. */
  installCommand: string | null;
  /**
   * Adresse d'ouverture d'un environnement prêt. Défaut : le mandataire sous `/code/ws/<id>/` (API seulement : les pages HTML
   * n'y sont pas servies). Avec une origine dédiée (`NEXORA_CODE_HOST_SUFFIX`) : `/api/account/code/open`, qui y envoie la personne.
   */
  openUrl?: (proxyId: string) => string;
}

type Who = { orgId: string; userId: string };

export interface WorkspaceService extends CodeWorkspaceService {
  /** Arrête l'environnement de la personne (les données restent). */
  stop(who: Who): Promise<void>;
  /** Supprime l'environnement, son volume, sa clé et son mot de passe ; libère l'espace compté. */
  remove(who: Who): Promise<void>;
}

/** Adresse d'ouverture : le mandataire inverse du site, par identifiant opaque (jamais l'identifiant de la personne). */
export const workspaceOpenUrl = (siteUrl: string, proxyId: string) =>
  `${siteUrl.replace(/\/+$/, "")}/code/ws/${proxyId}/`;

function stateFrom(
  deps: Pick<WorkspaceServiceDeps, "siteUrl" | "openUrl">,
  row: WorkspaceRow,
  runtime: WorkspaceRuntimeState,
): CodeWorkspaceState {
  const usedBytes = Number(row.accountedBytes);
  const base = { usedBytes, openUrl: null as string | null };
  switch (runtime.status) {
    case "running":
      if (runtime.health === "unhealthy") return { status: "error", ...base };
      if (runtime.health === "starting") return { status: "starting", ...base };
      return {
        status: "ready",
        usedBytes,
        openUrl:
          deps.openUrl?.(row.proxyId) ??
          workspaceOpenUrl(deps.siteUrl, row.proxyId),
      };
    case "restarting":
      return { status: "starting", ...base };
    case "created":
      return {
        status: row.desiredStatus === "running" ? "starting" : "stopped",
        ...base,
      };
    default:
      // arrêté, mort ou absent : « arrêté » si la personne (ou l'inactivité) l'a voulu, sinon c'est un incident
      return {
        status: row.desiredStatus === "running" ? "error" : "stopped",
        ...base,
      };
  }
}

const lockOf = (who: Who) =>
  sql`SELECT pg_advisory_xact_lock(hashtext(${`code-ws:${who.orgId}:${who.userId}`}))`;

export function createWorkspaceService(
  deps: WorkspaceServiceDeps,
): WorkspaceService {
  const findRow = async (d: Database, who: Who) => {
    const [row] = await d
      .select()
      .from(codeWorkspaces)
      .where(
        and(
          eq(codeWorkspaces.organizationId, who.orgId),
          eq(codeWorkspaces.userId, who.userId),
        ),
      );
    return row;
  };

  async function keyIsActive(d: Database, row: WorkspaceRow, now: Date) {
    if (!row.apiKeyId) return false;
    const [key] = await d
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.id, row.apiKeyId),
          isNull(apiKeys.revokedAt),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now)),
        ),
      );
    return Boolean(key);
  }

  /** Crée la ligne (port libre de la plage, noms dérivés d'un identifiant neuf) et le mot de passe au coffre. */
  async function insertRow(
    d: Database,
    who: Who,
  ): Promise<WorkspaceRow | null> {
    const taken = new Set(
      (await d.select({ port: codeWorkspaces.port }).from(codeWorkspaces)).map(
        (r) => r.port,
      ),
    );
    const free: number[] = [];
    for (let p = deps.config.portMin; p <= deps.config.portMax; p++)
      if (!taken.has(p)) free.push(p);
    for (let attempt = 0; attempt < 5 && free.length > 0; attempt++) {
      const port = free.splice(
        Math.floor(Math.random() * free.length),
        1,
      )[0] as number;
      const id = randomUUID();
      const short = id.replaceAll("-", "").slice(0, 12);
      const inserted = await d
        .insert(codeWorkspaces)
        .values({
          id,
          organizationId: who.orgId,
          userId: who.userId,
          proxyId: randomBytes(16).toString("hex"),
          containerName: `nexora-code-${short}`,
          volumeName: `nexora-code-vol-${short}`,
          port,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        await putSecret(d, deps.keyring(), {
          ref: passwordRef(id),
          value: randomBytes(32).toString("base64url"),
          kind: "other",
        });
        return inserted[0];
      }
    }
    return null;
  }

  async function release(who: Who, bytes: number) {
    if (bytes > 0) await deps.record(who.orgId, -bytes);
  }

  async function start(
    who: Who,
  ): Promise<
    | { ok: true; state: CodeWorkspaceState }
    | { ok: false; reason: "quota_exceeded" | "unavailable" }
  > {
    return deps.db().transaction(async (tx) => {
      const d = tx as unknown as Database;
      await d.execute(lockOf(who));
      const now = deps.now();
      let row = await findRow(d, who);
      let reserved = 0;
      let createdKey: { id: string } | null = null;

      try {
        // Déjà en marche : rien à vérifier, rien à refaire.
        if (row) {
          const runtime = await deps.driver.state(row.containerName);
          if (runtime.status === "running" || runtime.status === "restarting")
            return { ok: true as const, state: stateFrom(deps, row, runtime) };
        }

        // Espace : un environnement neuf (ou jamais mesuré) réserve ; un environnement mesuré doit pouvoir grandir.
        const unreserved =
          !row || (row.accountedBytes === 0n && !row.sizeMeasuredAt);
        const space = await deps.record(who.orgId, RESERVE_BYTES);
        if (!space.ok) {
          if (row)
            await d
              .update(codeWorkspaces)
              .set({ quotaBlocked: true, updatedAt: now })
              .where(eq(codeWorkspaces.id, row.id));
          return { ok: false as const, reason: "quota_exceeded" as const };
        }
        if (unreserved) reserved = RESERVE_BYTES;
        else await deps.record(who.orgId, -RESERVE_BYTES); // simple vérification de marge

        if (!row) {
          const inserted = await insertRow(d, who);
          if (!inserted) {
            await release(who, reserved);
            deps.log.error("Nexora Code : plage de ports épuisée", {});
            return { ok: false as const, reason: "unavailable" as const };
          }
          row = inserted;
        }

        let runtime = await deps.driver.state(row.containerName);
        // La clé de l'environnement a été révoquée : le conteneur garde l'ancienne, on le recrée (le volume reste).
        if (runtime.status !== "missing" && !(await keyIsActive(d, row, now))) {
          await deps.driver.remove({
            containerName: row.containerName,
            volumeName: row.volumeName,
            removeVolume: false,
          });
          runtime = { status: "missing", health: "none", exitCode: null };
        }

        if (runtime.status === "missing") {
          if (row.apiKeyId && (await keyIsActive(d, row, now)))
            await revokeApiKey(d, who.orgId, row.apiKeyId, now);
          const created = await createApiKey(d, {
            organizationId: who.orgId,
            name: WORKSPACE_KEY_NAME,
            createdBy: who.userId,
            maxActiveKeys: MAX_ACTIVE_KEYS_PER_ORGANIZATION,
          });
          createdKey = { id: created.record.id };
          // Le mot de passe ne vit que dans l'environnement du conteneur : s'il manque au coffre, on en pose un neuf.
          let password = await readSecret(
            d,
            deps.keyring(),
            passwordRef(row.id),
          ).catch(() => null);
          if (!password) {
            password = randomBytes(32).toString("base64url");
            await putSecret(d, deps.keyring(), {
              ref: passwordRef(row.id),
              value: password,
              kind: "other",
            });
          }
          await deps.driver.create({
            containerName: row.containerName,
            volumeName: row.volumeName,
            hostPort: row.port,
            image: deps.config.image,
            publicEnv: {
              NEXORA_API_URL: deps.config.gatewayUrl,
              ...(deps.config.defaultModel
                ? { NEXORA_CODE_MODEL: deps.config.defaultModel }
                : {}),
            },
            secretEnv: {
              NEXORA_API_KEY: created.key,
              NEXORA_CODE_PASSWORD: password,
            },
            limits: deps.config.limits,
          });
          await d
            .update(codeWorkspaces)
            .set({ apiKeyId: created.record.id, updatedAt: now })
            .where(eq(codeWorkspaces.id, row.id));
        }

        await deps.driver.start(row.containerName);
        const [updated] = await d
          .update(codeWorkspaces)
          .set({
            desiredStatus: "running",
            lastError: null,
            quotaBlocked: false,
            lastStartedAt: now,
            lastActivityAt: now,
            accountedBytes:
              reserved > 0 ? BigInt(reserved) : row.accountedBytes,
            updatedAt: now,
          })
          .where(eq(codeWorkspaces.id, row.id))
          .returning();
        deps.log.info("environnement Nexora Code démarré", {
          organizationId: who.orgId,
          userId: who.userId,
          workspaceId: row.id,
        });
        return {
          ok: true as const,
          state: stateFrom(deps, updated ?? row, {
            status: "running",
            health: "starting",
            exitCode: null,
          }),
        };
      } catch (error) {
        if (
          !(error instanceof WorkspaceDriverError) &&
          !(error instanceof ApiKeyLimitError)
        )
          throw error;
        // Nettoyage : clé créée pour rien, espace réservé pour rien ; la ligne reste (avec le code d'erreur) pour réessayer.
        if (createdKey) await revokeApiKey(d, who.orgId, createdKey.id, now);
        await release(who, reserved);
        if (row)
          await d
            .update(codeWorkspaces)
            .set({
              desiredStatus: "stopped",
              lastError:
                error instanceof WorkspaceDriverError
                  ? error.code
                  : "key_limit",
              accountedBytes: reserved > 0 ? 0n : row.accountedBytes,
              updatedAt: now,
            })
            .where(eq(codeWorkspaces.id, row.id));
        deps.log.error("environnement Nexora Code : démarrage impossible", {
          organizationId: who.orgId,
          userId: who.userId,
          code:
            error instanceof WorkspaceDriverError ? error.code : "key_limit",
        });
        return { ok: false as const, reason: "unavailable" as const };
      }
    });
  }

  return {
    async getState(who) {
      const row = await findRow(deps.db(), who);
      if (!row) return { status: "stopped", usedBytes: 0, openUrl: null };
      try {
        return stateFrom(deps, row, await deps.driver.state(row.containerName));
      } catch (error) {
        if (!(error instanceof WorkspaceDriverError)) throw error;
        return {
          status: "error",
          usedBytes: Number(row.accountedBytes),
          openUrl: null,
        };
      }
    },

    start,

    cli(): CodeCliInfo {
      return {
        installCommand: deps.installCommand,
        loginCommand: "nexora-code login",
      };
    },

    async stop(who) {
      await deps.db().transaction(async (tx) => {
        const d = tx as unknown as Database;
        await d.execute(lockOf(who));
        const row = await findRow(d, who);
        if (!row) return;
        const now = deps.now();
        const runtime = await deps.driver.state(row.containerName);
        if (runtime.status === "running" || runtime.status === "restarting")
          await deps.driver.stop(row.containerName);
        await d
          .update(codeWorkspaces)
          .set({ desiredStatus: "stopped", lastStoppedAt: now, updatedAt: now })
          .where(eq(codeWorkspaces.id, row.id));
      });
    },

    async remove(who) {
      await deps.db().transaction(async (tx) => {
        const d = tx as unknown as Database;
        await d.execute(lockOf(who));
        const row = await findRow(d, who);
        if (!row) return;
        const now = deps.now();
        await deps.driver.remove({
          containerName: row.containerName,
          volumeName: row.volumeName,
          removeVolume: true,
        });
        if (row.apiKeyId) await revokeApiKey(d, who.orgId, row.apiKeyId, now);
        await revokeSecret(d, passwordRef(row.id));
        await d.delete(codeWorkspaces).where(eq(codeWorkspaces.id, row.id));
        await release(who, Number(row.accountedBytes));
        deps.log.info("environnement Nexora Code supprimé", {
          organizationId: who.orgId,
          userId: who.userId,
          workspaceId: row.id,
        });
      });
    },
  };
}
