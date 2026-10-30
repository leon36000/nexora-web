-- RAG géré (chantier B) : extension pgvector (image pgvector/pgvector:pg17), bases, documents, extraits, permission RAG des clés, type de modèle « rerank ».
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "rag_bases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"embedding_model" text NOT NULL,
	"rerank_model" text,
	"chunk_chars" integer DEFAULT 3200 NOT NULL,
	"chunk_overlap" integer DEFAULT 400 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rag_bases_chunk_check" CHECK ("rag_bases"."chunk_chars" BETWEEN 200 AND 8000 AND "rag_bases"."chunk_overlap" BETWEEN 0 AND "rag_bases"."chunk_chars" / 2)
);
--> statement-breakpoint
CREATE TABLE "rag_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"base_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"ord" integer NOT NULL,
	"content" text NOT NULL,
	"heading" text,
	"start_char" integer NOT NULL,
	"end_char" integer NOT NULL,
	"page" smallint,
	"embedding" halfvec(1024) NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', coalesce("content", ''))) STORED
);
--> statement-breakpoint
CREATE TABLE "rag_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"source" text,
	"content_type" text,
	"status" text NOT NULL,
	"error_code" text,
	"text_chars" integer DEFAULT 0 NOT NULL,
	"chunks_total" integer DEFAULT 0 NOT NULL,
	"chunks_done" integer DEFAULT 0 NOT NULL,
	"pending_text" text,
	"pending_pages" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"claimed_until" timestamp with time zone,
	"stored_bytes" bigint DEFAULT 0 NOT NULL,
	"created_by_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rag_documents_status_check" CHECK ("rag_documents"."status" IN ('queued', 'indexing', 'ready', 'failed')),
	CONSTRAINT "rag_documents_stored_nonneg" CHECK ("rag_documents"."stored_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "models" DROP CONSTRAINT "models_kind_check";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "rag_access" jsonb;--> statement-breakpoint
ALTER TABLE "rag_bases" ADD CONSTRAINT "rag_bases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_document_id_rag_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."rag_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_chunks" ADD CONSTRAINT "rag_chunks_base_id_rag_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."rag_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_base_id_rag_bases_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."rag_bases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_documents" ADD CONSTRAINT "rag_documents_created_by_key_api_keys_id_fk" FOREIGN KEY ("created_by_key") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rag_bases_org_name_unique" ON "rag_bases" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "rag_bases_org_idx" ON "rag_bases" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rag_chunks_doc_ord_unique" ON "rag_chunks" USING btree ("document_id","ord");--> statement-breakpoint
CREATE INDEX "rag_chunks_base_idx" ON "rag_chunks" USING btree ("base_id");--> statement-breakpoint
CREATE INDEX "rag_chunks_org_idx" ON "rag_chunks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_chunks_embedding_idx" ON "rag_chunks" USING hnsw ("embedding" halfvec_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "rag_chunks_tsv_idx" ON "rag_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "rag_documents_hash_unique" ON "rag_documents" USING btree ("base_id","content_hash");--> statement-breakpoint
CREATE INDEX "rag_documents_base_idx" ON "rag_documents" USING btree ("base_id","created_at","id");--> statement-breakpoint
CREATE INDEX "rag_documents_org_idx" ON "rag_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "rag_documents_status_idx" ON "rag_documents" USING btree ("status");--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_kind_check" CHECK ("models"."kind" IN ('chat', 'embedding', 'rerank'));