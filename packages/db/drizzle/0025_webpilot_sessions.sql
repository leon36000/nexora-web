CREATE TABLE "webpilot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"close_reason" text,
	"max_minutes" integer NOT NULL,
	"idle_timeout_s" integer NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"current_host" text,
	"billed" boolean DEFAULT true NOT NULL,
	"sell_cad_micro" bigint DEFAULT 0 NOT NULL,
	"upstream_usd_micro" bigint DEFAULT 0 NOT NULL,
	"config_version" text NOT NULL,
	"minutes_settled" integer DEFAULT 0 NOT NULL,
	"reservation_id" uuid,
	"reserved_micro" bigint DEFAULT 0 NOT NULL,
	"minute_ends_at" timestamp with time zone NOT NULL,
	"cost_micro" bigint DEFAULT 0 NOT NULL,
	"privacy_decision" text,
	"policy_version" text,
	"browser_closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webpilot_sessions_status_check" CHECK ("webpilot_sessions"."status" IN ('open', 'closed')),
	CONSTRAINT "webpilot_sessions_reason_check" CHECK ("webpilot_sessions"."close_reason" IS NULL OR "webpilot_sessions"."close_reason" IN ('closed_by_client', 'max_minutes', 'idle', 'insufficient_quota', 'privacy_policy', 'browser_error')),
	CONSTRAINT "webpilot_sessions_closed_has_reason" CHECK ("webpilot_sessions"."status" = 'open' OR "webpilot_sessions"."close_reason" IS NOT NULL),
	CONSTRAINT "webpilot_sessions_counts" CHECK ("webpilot_sessions"."max_minutes" > 0 AND "webpilot_sessions"."idle_timeout_s" > 0 AND "webpilot_sessions"."minutes_settled" >= 0 AND "webpilot_sessions"."cost_micro" >= 0)
);
--> statement-breakpoint
ALTER TABLE "webpilot_sessions" ADD CONSTRAINT "webpilot_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webpilot_sessions" ADD CONSTRAINT "webpilot_sessions_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webpilot_sessions_org_idx" ON "webpilot_sessions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "webpilot_sessions_due_idx" ON "webpilot_sessions" USING btree ("status","minute_ends_at");--> statement-breakpoint
CREATE INDEX "webpilot_sessions_cleanup_idx" ON "webpilot_sessions" USING btree ("status","browser_closed_at");