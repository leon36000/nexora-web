import { type SQL, sql } from "@nexora/db";
import { RAG_DIMS, toVectorLiteral } from "./vector.ts";

/**
 * Requêtes SQL du RAG (pgvector + plein texte). Règles : (1) toute valeur venue de l'extérieur est un PARAMÈTRE lié,
 * jamais interpolée ; (2) toute lecture ou suppression filtre l'organisation ET la base (isolation en profondeur :
 * une base d'une autre organisation ne ressort jamais, même avec un identifiant deviné) ; (3) seuls les documents
 * « prêts » sont cherchés.
 */

export const MAX_QUERY_LIMIT = 200;

/** Réglages locaux à la transaction : parcours itératif de l'index HNSW, nécessaire quand un filtre élimine des lignes. */
export const ANN_SETTINGS: SQL[] = [
  sql`SET LOCAL hnsw.iterative_scan = relaxed_order`,
  sql`SET LOCAL hnsw.ef_search = 80`,
];

function checkLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT)
    throw new RangeError(`limite invalide (1 à ${MAX_QUERY_LIMIT})`);
}

export interface SearchRow {
  id: number;
  document_id: string;
  ord: number;
  content: string;
  heading: string | null;
  start_char: number;
  end_char: number;
  page: number | null;
  title: string;
  source: string | null;
  /** Distance cosinus (0 = identique), recherche vectorielle seulement. */
  distance?: number;
  /** Score de pertinence plein texte, recherche lexicale seulement. */
  score?: number;
}

const COLUMNS = sql`c."id", c."document_id", c."ord", c."content", c."heading", c."start_char", c."end_char", c."page", d."title", d."source"`;

/**
 * Plus proches voisins par distance cosinus. L'ANN s'applique à l'intérieur (table des extraits seule, filtrée par
 * organisation et base) ; la jointure avec les documents ne sert qu'à l'état et au titre.
 */
export function vectorSearchQuery(input: {
  organizationId: string;
  baseId: string;
  vector: readonly number[];
  limit: number;
}): SQL {
  if (input.vector.length !== RAG_DIMS)
    throw new RangeError(`dimension invalide (attendu ${RAG_DIMS})`);
  checkLimit(input.limit);
  const literal = toVectorLiteral(input.vector);
  return sql`
    SELECT ${COLUMNS}, c."distance"
    FROM (
      SELECT x."id", x."document_id", x."ord", x."content", x."heading", x."start_char", x."end_char", x."page",
             (x."embedding" <=> ${literal}::halfvec(1024)) AS "distance"
      FROM "rag_chunks" x
      WHERE x."organization_id" = ${input.organizationId} AND x."base_id" = ${input.baseId}
      ORDER BY x."embedding" <=> ${literal}::halfvec(1024)
      LIMIT ${input.limit}
    ) c
    JOIN "rag_documents" d ON d."id" = c."document_id"
    WHERE d."status" = 'ready' AND d."organization_id" = ${input.organizationId}
    ORDER BY c."distance", c."id"`;
}

/** Recherche plein texte (`simple`, sans radical ni mots vides). `tsQuery` : termes séparés par ` | `. */
export function lexicalSearchQuery(input: {
  organizationId: string;
  baseId: string;
  tsQuery: string;
  limit: number;
}): SQL {
  checkLimit(input.limit);
  return sql`
    SELECT ${COLUMNS}, c."score"
    FROM (
      SELECT x."id", x."document_id", x."ord", x."content", x."heading", x."start_char", x."end_char", x."page",
             ts_rank_cd(x."tsv", q."query") AS "score"
      FROM "rag_chunks" x, to_tsquery('simple', ${input.tsQuery}) AS q("query")
      WHERE x."organization_id" = ${input.organizationId} AND x."base_id" = ${input.baseId} AND x."tsv" @@ q."query"
      ORDER BY "score" DESC, x."id"
      LIMIT ${input.limit}
    ) c
    JOIN "rag_documents" d ON d."id" = c."document_id"
    WHERE d."status" = 'ready' AND d."organization_id" = ${input.organizationId}
    ORDER BY c."score" DESC, c."id"`;
}

export interface ChunkInsert {
  documentId: string;
  baseId: string;
  organizationId: string;
  ord: number;
  content: string;
  heading: string | null;
  startChar: number;
  endChar: number;
  page: number | null;
  vector: readonly number[];
}

/** Insertion en lot ; chaque vecteur est un paramètre lié converti en demi-précision par PostgreSQL. */
export function insertChunksQuery(rows: readonly ChunkInsert[]): SQL {
  if (rows.length === 0) throw new RangeError("aucun extrait à insérer");
  const values = rows.map((r) => {
    if (r.vector.length !== RAG_DIMS)
      throw new RangeError(`dimension invalide (attendu ${RAG_DIMS})`);
    return sql`(${r.documentId}, ${r.baseId}, ${r.organizationId}, ${r.ord}, ${r.content}, ${r.heading}, ${r.startChar}, ${r.endChar}, ${r.page}, ${toVectorLiteral(r.vector)}::halfvec(1024))`;
  });
  return sql`insert into "rag_chunks" ("document_id", "base_id", "organization_id", "ord", "content", "heading", "start_char", "end_char", "page", "embedding") values ${sql.join(values, sql`, `)}`;
}

export function deleteDocumentChunksQuery(input: {
  organizationId: string;
  documentId: string;
}): SQL {
  return sql`delete from "rag_chunks" where "document_id" = ${input.documentId} and "organization_id" = ${input.organizationId}`;
}
