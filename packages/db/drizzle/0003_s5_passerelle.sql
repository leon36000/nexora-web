CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"allowed_models" jsonb,
	"spend_cap_micro" bigint,
	"spent_micro" bigint DEFAULT 0 NOT NULL,
	"rpm_limit" integer,
	"tpm_limit" integer,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_spent_nonneg" CHECK ("api_keys"."spent_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usd_to_cad_micro" bigint NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_positive" CHECK ("fx_rates"."usd_to_cad_micro" > 0)
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"upstream_input_usd_micro" bigint NOT NULL,
	"upstream_output_usd_micro" bigint NOT NULL,
	"upstream_cache_usd_micro" bigint,
	"sell_input_cad_micro" bigint NOT NULL,
	"sell_output_cad_micro" bigint NOT NULL,
	"sell_cache_cad_micro" bigint,
	"margin_bps" integer DEFAULT 0 NOT NULL,
	"margin_floor_bps" integer DEFAULT 0 NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_prices_nonneg" CHECK ("model_prices"."upstream_input_usd_micro" >= 0 AND "model_prices"."upstream_output_usd_micro" >= 0 AND "model_prices"."sell_input_cad_micro" >= 0 AND "model_prices"."sell_output_cad_micro" >= 0 AND "model_prices"."margin_floor_bps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "model_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"base_url" text NOT NULL,
	"litellm_base_url" text,
	"secret_ref" text,
	"region" text NOT NULL,
	"data_policy_fr" text DEFAULT '' NOT NULL,
	"data_policy_en" text DEFAULT '' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health_state" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_check_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_providers_type_check" CHECK ("model_providers"."type" IN ('openrouter', 'openai_compatible', 'litellm_upstream', 'vllm', 'ollama')),
	CONSTRAINT "model_providers_region_check" CHECK ("model_providers"."region" IN ('quebec', 'canada', 'etats_unis', 'europe', 'autre')),
	CONSTRAINT "model_providers_health_check" CHECK ("model_providers"."health_state" IN ('unknown', 'ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"name" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"provider_id" uuid NOT NULL,
	"upstream_id" text NOT NULL,
	"context_max" integer NOT NULL,
	"max_output_tokens" integer,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"residency" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sunset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_kind_check" CHECK ("models"."kind" IN ('chat', 'embedding')),
	CONSTRAINT "models_visibility_check" CHECK ("models"."visibility" IN ('public', 'unlisted', 'private')),
	CONSTRAINT "models_status_check" CHECK ("models"."status" IN ('draft', 'approved', 'published', 'retired')),
	CONSTRAINT "models_residency_check" CHECK ("models"."residency" IN ('quebec', 'canada', 'etats_unis', 'europe', 'autre')),
	CONSTRAINT "models_context_pos" CHECK ("models"."context_max" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" uuid NOT NULL,
	"model_public_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"config_version" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer NOT NULL,
	"error_code" text,
	"stream" boolean DEFAULT false NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro" bigint DEFAULT 0 NOT NULL,
	"upstream_cost_usd_micro" bigint DEFAULT 0 NOT NULL,
	"price_input_micro" bigint DEFAULT 0 NOT NULL,
	"price_output_micro" bigint DEFAULT 0 NOT NULL,
	"price_cache_micro" bigint,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"reservation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_status_check" CHECK ("usage_events"."status" IN ('ok', 'error', 'aborted')),
	CONSTRAINT "usage_events_nonneg" CHECK ("usage_events"."cost_micro" >= 0 AND "usage_events"."prompt_tokens" >= 0 AND "usage_events"."completion_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "config_versions" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "applied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "applied_status" text;--> statement-breakpoint
ALTER TABLE "config_versions" ADD COLUMN "applied_detail" jsonb;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_prices" ADD CONSTRAINT "model_prices_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_model_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "fx_rates_effective_idx" ON "fx_rates" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "model_prices_model_idx" ON "model_prices" USING btree ("model_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "model_providers_code_unique" ON "model_providers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "models_public_id_unique" ON "models" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "models_provider_idx" ON "models" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_request_unique" ON "usage_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "usage_events_org_idx" ON "usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_key_idx" ON "usage_events" USING btree ("api_key_id","created_at");--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_status_check" CHECK ("config_versions"."status" IN ('draft', 'approved', 'published', 'superseded'));