CREATE TABLE "stripe_invoice_payments" (
	"stripe_invoice_id" text PRIMARY KEY NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_credit_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"stripe_subscription_id" text,
	"amount_paid_cents" integer NOT NULL,
	"credits_micro" bigint NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_credit_grants_credits_pos" CHECK ("subscription_credit_grants"."credits_micro" > 0),
	CONSTRAINT "subscription_credit_grants_paid_pos" CHECK ("subscription_credit_grants"."amount_paid_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "subscription_credit_grants" ADD CONSTRAINT "subscription_credit_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_invoice_payments_pi_idx" ON "stripe_invoice_payments" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "stripe_invoice_payments_charge_idx" ON "stripe_invoice_payments" USING btree ("stripe_charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_credit_grants_invoice_unique" ON "subscription_credit_grants" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "subscription_credit_grants_org_idx" ON "subscription_credit_grants" USING btree ("organization_id");