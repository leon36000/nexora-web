import type { Database } from "@nexora/db";
import type { Logger } from "@nexora/log";
import type { ApiKeyRow } from "../gateway/keys";

/**
 * Compteur d'espace du RAG. Contrat du chantier « crédits » (`billing/entitlements.ts`) : en production, `record`
 * appelle `recordStorageUsage(orgId, "rag", delta)` et `used` lit `getOrgEntitlements(orgId).storage.byProduct.rag`.
 * Injecté pour que le RAG se teste sans lui.
 */
export interface RagStoragePort {
  /** Ajoute (ou retire, si négatif) des octets. Refuse sans rien changer si le quota serait dépassé. */
  record(
    organizationId: string,
    deltaBytes: number,
  ): Promise<{ ok: true } | { ok: false; reason: "quota_exceeded" }>;
  /** Octets actuellement comptés pour le RAG de l'organisation. */
  used(organizationId: string): Promise<number>;
}

/** Appels internes à la passerelle : facturation en crédits, Privacy Router et ligne d'Activité sont ceux de `/v1`. */
export interface RagGateway {
  embeddings(request: Request, key: ApiKeyRow): Promise<Response>;
  rerank(request: Request, key: ApiKeyRow): Promise<Response>;
}

export interface RagConfig {
  maxFileBytes: number;
  maxTextChars: number;
  maxPdfPages: number;
  /** Corps JSON accepté (texte d'un document, requête). */
  maxBodyBytes: number;
  maxBasesPerOrg: number;
  maxDocsPerBase: number;
  maxChunksPerBase: number;
  maxChunksPerDoc: number;
  /** Au plus ce nombre d'extraits est indexé pendant la requête ; au-delà, tâche du worker. */
  inlineMaxChunks: number;
  embedBatch: number;
  /** Budget de temps d'une tranche d'indexation. */
  sliceMs: number;
  defaultRpm: number;
  keyRpm: number;
  keyTpm: number;
  topKMax: number;
  rerankCandidates: number;
  rerankCandidatesMax: number;
  maxMetadataBytes: number;
  defaultEmbeddingModel: string;
  defaultRerankModel: string | null;
}

export interface RagDeps {
  db: () => Database;
  log: Logger;
  now: () => Date;
  requestId: () => string;
  config: RagConfig;
  gateway: RagGateway;
  storage: RagStoragePort;
  enqueue: (job: {
    type: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    availableAt?: Date;
  }) => Promise<void>;
}
