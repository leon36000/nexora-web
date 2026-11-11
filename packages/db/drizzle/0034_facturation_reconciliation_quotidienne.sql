CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "reconciliation_runs_status_check" CHECK ("reconciliation_runs"."status" IN ('running', 'ok', 'alert', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "usage_reconciliations" (
	"usage_event_id" uuid PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"run_id" uuid,
	"status" text NOT NULL,
	"source" text,
	"upstream_cost_usd_nano" bigint,
	"native_prompt_tokens" integer,
	"native_completion_tokens" integer,
	"native_reasoning_tokens" integer,
	"native_cached_tokens" integer,
	"upstream_provider" text,
	"cancelled" boolean DEFAULT false NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_reconciliations_status_check" CHECK ("usage_reconciliations"."status" IN ('ok', 'mismatch', 'missing_upstream'))
);
--> statement-breakpoint
ALTER TABLE "usage_reconciliations" ADD CONSTRAINT "usage_reconciliations_usage_event_id_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."usage_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_runs_day_idx" ON "reconciliation_runs" USING btree ("day","started_at");--> statement-breakpoint
CREATE INDEX "usage_reconciliations_status_idx" ON "usage_reconciliations" USING btree ("status","reconciled_at");