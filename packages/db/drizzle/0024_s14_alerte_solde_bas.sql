CREATE TABLE "balance_alerts" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"threshold_micro" bigint NOT NULL,
	"last_alerted_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "balance_alerts_threshold_check" CHECK ("balance_alerts"."threshold_micro" > 0)
);
--> statement-breakpoint
ALTER TABLE "balance_alerts" ADD CONSTRAINT "balance_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;