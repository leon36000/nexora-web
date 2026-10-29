CREATE TABLE "privacy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" uuid,
	"product" text NOT NULL,
	"operation" text NOT NULL,
	"decision" text NOT NULL,
	"rule_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"policy_version" integer DEFAULT 0 NOT NULL,
	"destination" text,
	"destination_kind" text,
	"data_kinds" text[] DEFAULT '{}'::text[] NOT NULL,
	"detected" text[] DEFAULT '{}'::text[] NOT NULL,
	"masked_count" integer DEFAULT 0 NOT NULL,
	"deny_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_events_decision_check" CHECK ("privacy_events"."decision" IN ('allow', 'mask', 'deny')),
	CONSTRAINT "privacy_events_counts_check" CHECK ("privacy_events"."masked_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "privacy_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"version" integer NOT NULL,
	"level" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"current" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_policies_version_check" CHECK ("privacy_policies"."version" >= 1),
	CONSTRAINT "privacy_policies_level_check" CHECK ("privacy_policies"."level" IN ('standard', 'renforce', 'souverain'))
);
--> statement-breakpoint
ALTER TABLE "privacy_events" ADD CONSTRAINT "privacy_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_events" ADD CONSTRAINT "privacy_events_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_policies" ADD CONSTRAINT "privacy_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_policies" ADD CONSTRAINT "privacy_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_events_org_idx" ON "privacy_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_policies_org_version_unique" ON "privacy_policies" USING btree ("organization_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_policies_org_current_unique" ON "privacy_policies" USING btree ("organization_id") WHERE "privacy_policies"."current";