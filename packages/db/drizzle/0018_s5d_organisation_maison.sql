CREATE TABLE "organization_billing" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'standard' NOT NULL,
	"set_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_billing_mode_check" CHECK ("organization_billing"."mode" IN ('standard', 'house'))
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "billed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "value_micro" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_billing" ADD CONSTRAINT "organization_billing_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;