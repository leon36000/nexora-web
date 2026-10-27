CREATE TABLE "indexing_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine" text NOT NULL,
	"trigger" text NOT NULL,
	"url_count" integer DEFAULT 0 NOT NULL,
	"urls_sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indexing_submissions_status_check" CHECK ("indexing_submissions"."status" IN ('dry_run', 'submitted', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "seo_adapters" (
	"key" text PRIMARY KEY NOT NULL,
	"write_enabled" boolean DEFAULT false NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_status" text DEFAULT 'never' NOT NULL,
	"last_check_detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"base_url" text,
	"pages_checked" integer DEFAULT 0 NOT NULL,
	"issues_found" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "seo_audits_kind_check" CHECK ("seo_audits"."kind" IN ('structure', 'links', 'a11y', 'perf', 'all')),
	CONSTRAINT "seo_audits_status_check" CHECK ("seo_audits"."status" IN ('queued', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "seo_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"rule" text NOT NULL,
	"url" text NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "seo_issues_severity_check" CHECK ("seo_issues"."severity" IN ('error', 'warning', 'info')),
	CONSTRAINT "seo_issues_status_check" CHECK ("seo_issues"."status" IN ('open', 'resolved', 'ignored'))
);
--> statement-breakpoint
CREATE TABLE "seo_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_key" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"job_id" uuid,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "site_agent_runs_status_check" CHECK ("site_agent_runs"."status" IN ('queued', 'running', 'succeeded', 'failed', 'stopped', 'budget_exceeded')),
	CONSTRAINT "site_agent_runs_cost_nonneg" CHECK ("site_agent_runs"."cost_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "site_agents" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mission" text NOT NULL,
	"model" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"budget_micro" bigint DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'disabled' NOT NULL,
	"last_run_at" timestamp with time zone,
	"prompt_tokens_total" bigint DEFAULT 0 NOT NULL,
	"completion_tokens_total" bigint DEFAULT 0 NOT NULL,
	"cost_total_micro" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"gateway_key_id" uuid,
	"gateway_key_ref" text,
	"directus_token_ref" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_agents_state_check" CHECK ("site_agents"."state" IN ('idle', 'running', 'error', 'budget_exceeded', 'disabled')),
	CONSTRAINT "site_agents_budget_nonneg" CHECK ("site_agents"."budget_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sitemap_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"urls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"url_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_issues" ADD CONSTRAINT "seo_issues_audit_id_seo_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."seo_audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_agent_runs" ADD CONSTRAINT "site_agent_runs_agent_key_site_agents_key_fk" FOREIGN KEY ("agent_key") REFERENCES "public"."site_agents"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "indexing_submissions_created_idx" ON "indexing_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "seo_audits_created_idx" ON "seo_audits" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "seo_issues_fingerprint_unique" ON "seo_issues" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "seo_issues_status_idx" ON "seo_issues" USING btree ("status","severity","last_seen_at");--> statement-breakpoint
CREATE INDEX "seo_issues_audit_idx" ON "seo_issues" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "site_agent_runs_agent_idx" ON "site_agent_runs" USING btree ("agent_key","created_at");--> statement-breakpoint
CREATE INDEX "site_agent_runs_status_idx" ON "site_agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sitemap_snapshots_taken_idx" ON "sitemap_snapshots" USING btree ("taken_at");