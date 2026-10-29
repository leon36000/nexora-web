CREATE TABLE "webpilot_price_items" (
	"sheet_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"sell_cad_micro" bigint NOT NULL,
	"upstream_usd_micro" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "webpilot_price_items_sheet_id_unit_pk" PRIMARY KEY("sheet_id","unit"),
	CONSTRAINT "webpilot_price_items_unit_check" CHECK ("webpilot_price_items"."unit" IN ('page_static', 'page_browser', 'browser_minute')),
	CONSTRAINT "webpilot_price_items_nonneg" CHECK ("webpilot_price_items"."sell_cad_micro" >= 0 AND "webpilot_price_items"."upstream_usd_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webpilot_price_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer GENERATED ALWAYS AS IDENTITY (sequence name "webpilot_price_sheets_version_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"margin_floor_bps" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "webpilot_price_sheets_status_check" CHECK ("webpilot_price_sheets"."status" IN ('draft', 'published')),
	CONSTRAINT "webpilot_price_sheets_floor_nonneg" CHECK ("webpilot_price_sheets"."margin_floor_bps" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webpilot_task_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"url" text NOT NULL,
	"http_status" integer NOT NULL,
	"content" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webpilot_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"params" jsonb NOT NULL,
	"state" jsonb DEFAULT '{"queue":[],"seen":[]}'::jsonb NOT NULL,
	"pages_limit" integer NOT NULL,
	"pages_done" integer DEFAULT 0 NOT NULL,
	"pages_skipped" integer DEFAULT 0 NOT NULL,
	"batches_done" integer DEFAULT 0 NOT NULL,
	"sell_cad_micro" bigint DEFAULT 0 NOT NULL,
	"upstream_usd_micro" bigint DEFAULT 0 NOT NULL,
	"config_version" text NOT NULL,
	"billed" boolean DEFAULT true NOT NULL,
	"reservation_id" uuid,
	"reserved_micro" bigint DEFAULT 0 NOT NULL,
	"cost_micro" bigint DEFAULT 0 NOT NULL,
	"privacy_decision" text,
	"policy_version" text,
	"error_code" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "webpilot_tasks_kind_check" CHECK ("webpilot_tasks"."kind" IN ('crawl')),
	CONSTRAINT "webpilot_tasks_status_check" CHECK ("webpilot_tasks"."status" IN ('queued', 'running', 'completed', 'cancelled', 'failed')),
	CONSTRAINT "webpilot_tasks_counts" CHECK ("webpilot_tasks"."pages_limit" > 0 AND "webpilot_tasks"."pages_done" >= 0 AND "webpilot_tasks"."pages_skipped" >= 0 AND "webpilot_tasks"."cost_micro" >= 0)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "webpilot_operations" jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "units_page_static" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "units_page_browser" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "units_browser_minute" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "destination_host" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "privacy_decision" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "policy_version" text;--> statement-breakpoint
ALTER TABLE "webpilot_price_items" ADD CONSTRAINT "webpilot_price_items_sheet_id_webpilot_price_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."webpilot_price_sheets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webpilot_task_results" ADD CONSTRAINT "webpilot_task_results_task_id_webpilot_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."webpilot_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webpilot_tasks" ADD CONSTRAINT "webpilot_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webpilot_tasks" ADD CONSTRAINT "webpilot_tasks_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webpilot_price_sheets_version_unique" ON "webpilot_price_sheets" USING btree ("version");--> statement-breakpoint
CREATE INDEX "webpilot_price_sheets_effective_idx" ON "webpilot_price_sheets" USING btree ("status","effective_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webpilot_task_results_seq_unique" ON "webpilot_task_results" USING btree ("task_id","seq");--> statement-breakpoint
CREATE INDEX "webpilot_tasks_org_idx" ON "webpilot_tasks" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "webpilot_tasks_status_idx" ON "webpilot_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webpilot_tasks_expiry_idx" ON "webpilot_tasks" USING btree ("expires_at");--> statement-breakpoint

-- Feuille de prix WebPilot : immuable comme `model_prices`. Les lignes d'une feuille ne changent jamais ; la feuille
-- passe de brouillon à publiée une seule fois (la date d'entrée en vigueur peut alors être fixée) et ne se supprime pas.
CREATE TRIGGER webpilot_price_items_append_only
  BEFORE UPDATE OR DELETE ON webpilot_price_items
  FOR EACH ROW EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER webpilot_price_items_no_truncate
  BEFORE TRUNCATE ON webpilot_price_items
  FOR EACH STATEMENT EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION webpilot_price_sheets_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'draft' AND NEW.status = 'published'
     AND NEW.id = OLD.id
     AND NEW.version IS NOT DISTINCT FROM OLD.version
     AND NEW.margin_floor_bps = OLD.margin_floor_bps
     AND NEW.note = OLD.note
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'webpilot_price_sheets : % refusé (seule la publication d''un brouillon est permise)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER webpilot_price_sheets_guard_row
  BEFORE UPDATE OR DELETE ON webpilot_price_sheets
  FOR EACH ROW EXECUTE FUNCTION webpilot_price_sheets_guard();
--> statement-breakpoint
CREATE TRIGGER webpilot_price_sheets_no_truncate
  BEFORE TRUNCATE ON webpilot_price_sheets
  FOR EACH STATEMENT EXECUTE FUNCTION webpilot_price_sheets_guard();
