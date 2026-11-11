CREATE TABLE "reconciliation_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text,
	"request_id" text,
	"generation_id" text,
	"litellm_call_id" text,
	"provider" text,
	"model" text,
	"day" date,
	"expected_usd_nano" bigint,
	"actual_usd_nano" bigint,
	"delta_usd_nano" bigint,
	"delta_pct" numeric(12, 4),
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"note" text,
	CONSTRAINT "reconciliation_findings_kind_check" CHECK ("reconciliation_findings"."kind" IN ('lost_reservation', 'recovered_in_flight', 'unbilled_upstream', 'billed_no_upstream', 'token_mismatch', 'cost_mismatch', 'negative_margin', 'aggregate_drift', 'ledger_mismatch')),
	CONSTRAINT "reconciliation_findings_status_check" CHECK ("reconciliation_findings"."status" IN ('open', 'reviewed'))
);
--> statement-breakpoint
CREATE TABLE "usage_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" uuid NOT NULL,
	"reservation_id" uuid,
	"model_public_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"config_version" text NOT NULL,
	"stream" boolean DEFAULT false NOT NULL,
	"litellm_call_id" text,
	"prompt_estimate" integer NOT NULL,
	"recovery_cost_micro" bigint NOT NULL,
	"recovery_upstream_cost_usd_nano" bigint DEFAULT 0 NOT NULL,
	"price_input_micro" bigint DEFAULT 0 NOT NULL,
	"price_output_micro" bigint DEFAULT 0 NOT NULL,
	"price_cache_micro" bigint,
	"price_cache_write_micro" bigint,
	"price_window" text,
	"fx_usd_to_cad_micro" bigint,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "usage_intents_status_check" CHECK ("usage_intents"."status" IN ('pending', 'settled', 'recovered', 'anomaly')),
	CONSTRAINT "usage_intents_recovery_nonneg" CHECK ("usage_intents"."recovery_cost_micro" >= 0)
);
--> statement-breakpoint
ALTER TABLE "usage_intents" ADD CONSTRAINT "usage_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_intents" ADD CONSTRAINT "usage_intents_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconciliation_findings_dedupe_unique" ON "reconciliation_findings" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "reconciliation_findings_open_idx" ON "reconciliation_findings" USING btree ("found_at") WHERE "reconciliation_findings"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reconciliation_findings_kind_idx" ON "reconciliation_findings" USING btree ("kind","day");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_intents_request_unique" ON "usage_intents" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "usage_intents_pending_idx" ON "usage_intents" USING btree ("created_at") WHERE "usage_intents"."status" = 'pending';