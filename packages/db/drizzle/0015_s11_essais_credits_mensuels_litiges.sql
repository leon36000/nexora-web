CREATE TABLE "payment_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "payment_disputes_status_check" CHECK ("payment_disputes"."status" IN ('open','won','lost'))
);
--> statement-breakpoint
CREATE TABLE "subscription_credit_tranches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grant_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_subscription_id" text,
	"seq" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"original_micro" bigint NOT NULL,
	"amount_micro" bigint NOT NULL,
	"reduced_micro" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"hold_ref" text,
	"granted_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_credit_tranches_amounts" CHECK ("subscription_credit_tranches"."original_micro" > 0 AND "subscription_credit_tranches"."amount_micro" >= 0 AND "subscription_credit_tranches"."reduced_micro" >= 0 AND "subscription_credit_tranches"."amount_micro" + "subscription_credit_tranches"."reduced_micro" <= "subscription_credit_tranches"."original_micro"),
	CONSTRAINT "subscription_credit_tranches_status_check" CHECK ("subscription_credit_tranches"."status" IN ('pending','held','granted','canceled')),
	CONSTRAINT "subscription_credit_tranches_seq" CHECK ("subscription_credit_tranches"."seq" BETWEEN 0 AND 11)
);
--> statement-breakpoint
CREATE TABLE "trial_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"key_hash" text NOT NULL,
	"family" text NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_claims_kind_check" CHECK ("trial_claims"."kind" IN ('card','email'))
);
--> statement-breakpoint
CREATE TABLE "trial_denials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"family" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trial_denials_reason_check" CHECK ("trial_denials"."reason" IN ('card','email'))
);
--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credit_tranches" ADD CONSTRAINT "subscription_credit_tranches_grant_id_subscription_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."subscription_credit_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_credit_tranches" ADD CONSTRAINT "subscription_credit_tranches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_claims" ADD CONSTRAINT "trial_claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_denials" ADD CONSTRAINT "trial_denials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_disputes_org_idx" ON "payment_disputes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credit_tranches_grant_seq_unique" ON "subscription_credit_tranches" USING btree ("grant_id","seq");--> statement-breakpoint
CREATE INDEX "subscription_credit_tranches_due_idx" ON "subscription_credit_tranches" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "subscription_credit_tranches_sub_idx" ON "subscription_credit_tranches" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_claims_key_unique" ON "trial_claims" USING btree ("kind","key_hash","family");--> statement-breakpoint
CREATE INDEX "trial_claims_sub_idx" ON "trial_claims" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trial_denials_sub_unique" ON "trial_denials" USING btree ("stripe_subscription_id");