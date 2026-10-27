CREATE TABLE "hosted_agent_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"secret_ref" text,
	"region" text DEFAULT 'quebec' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"health_state" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_check_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_agent_instances_region_check" CHECK ("hosted_agent_instances"."region" IN ('quebec', 'canada', 'etats_unis', 'europe', 'autre')),
	CONSTRAINT "hosted_agent_instances_health_check" CHECK ("hosted_agent_instances"."health_state" IN ('unknown', 'ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "hosted_agent_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"input_cad_micro" bigint DEFAULT 0 NOT NULL,
	"output_cad_micro" bigint DEFAULT 0 NOT NULL,
	"per_run_cad_micro" bigint DEFAULT 0 NOT NULL,
	"is_trial" boolean DEFAULT true NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_agent_prices_nonneg" CHECK ("hosted_agent_prices"."input_cad_micro" >= 0 AND "hosted_agent_prices"."output_cad_micro" >= 0 AND "hosted_agent_prices"."per_run_cad_micro" >= 0),
	CONSTRAINT "hosted_agent_prices_not_free" CHECK ("hosted_agent_prices"."input_cad_micro" > 0 OR "hosted_agent_prices"."output_cad_micro" > 0 OR "hosted_agent_prices"."per_run_cad_micro" > 0)
);
--> statement-breakpoint
CREATE TABLE "hosted_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"upstream_id" text NOT NULL,
	"upstream_name" text,
	"name_fr" text DEFAULT '' NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"run_token_cap" integer DEFAULT 32000 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_agents_slug_check" CHECK ("hosted_agents"."slug" ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
	CONSTRAINT "hosted_agents_upstream_check" CHECK ("hosted_agents"."upstream_id" LIKE 'agent:%'),
	CONSTRAINT "hosted_agents_status_check" CHECK ("hosted_agents"."status" IN ('draft', 'published', 'retired')),
	CONSTRAINT "hosted_agents_visibility_check" CHECK ("hosted_agents"."visibility" IN ('public', 'unlisted', 'private')),
	CONSTRAINT "hosted_agents_category_check" CHECK ("hosted_agents"."category" IN ('general', 'support', 'documents', 'ventes', 'finance', 'ressources_humaines', 'autre')),
	CONSTRAINT "hosted_agents_cap_check" CHECK ("hosted_agents"."run_token_cap" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE TABLE "workstudio_embed_settings" (
	"id" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"origin" text,
	"chat_identifier" text,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" text DEFAULT 'right' NOT NULL,
	"color" text,
	"label_fr" text,
	"label_en" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workstudio_embed_settings_single" CHECK ("workstudio_embed_settings"."id" = 'main'),
	CONSTRAINT "workstudio_embed_settings_position_check" CHECK ("workstudio_embed_settings"."position" IN ('right', 'left'))
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "run_fee_micro" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_agent_prices" ADD CONSTRAINT "hosted_agent_prices_agent_id_hosted_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."hosted_agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_agents" ADD CONSTRAINT "hosted_agents_instance_id_hosted_agent_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."hosted_agent_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_agent_instances_code_unique" ON "hosted_agent_instances" USING btree ("code");--> statement-breakpoint
CREATE INDEX "hosted_agent_prices_agent_idx" ON "hosted_agent_prices" USING btree ("agent_id","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_agents_slug_unique" ON "hosted_agents" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_agents_upstream_unique" ON "hosted_agents" USING btree ("instance_id","upstream_id");--> statement-breakpoint
CREATE INDEX "hosted_agents_instance_idx" ON "hosted_agents" USING btree ("instance_id");--> statement-breakpoint

-- Un prix d'agent ne change jamais : une modification crée une nouvelle ligne avec sa date d'effet (comme model_prices).
CREATE OR REPLACE FUNCTION hosted_agent_prices_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% est en ajout seulement (% refusé)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER hosted_agent_prices_append_only
  BEFORE UPDATE OR DELETE ON hosted_agent_prices
  FOR EACH ROW EXECUTE FUNCTION hosted_agent_prices_append_only();
--> statement-breakpoint
CREATE TRIGGER hosted_agent_prices_no_truncate
  BEFORE TRUNCATE ON hosted_agent_prices
  FOR EACH STATEMENT EXECUTE FUNCTION hosted_agent_prices_append_only();
