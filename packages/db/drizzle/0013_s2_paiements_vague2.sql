CREATE TABLE "gift_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"promo_code_id" uuid,
	"kind" text NOT NULL,
	"plan_code" text,
	"subscription_ref" text,
	"vps_order_id" uuid,
	"credits_micro" bigint,
	"status" text DEFAULT 'active' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	CONSTRAINT "gift_grants_kind_check" CHECK ("gift_grants"."kind" IN ('subscription', 'vps', 'credits') AND "gift_grants"."status" IN ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "payment_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"live_mode_allowed" boolean DEFAULT false NOT NULL,
	"trial_requires_card" boolean DEFAULT true NOT NULL,
	"stripe_page_codes" boolean DEFAULT true NOT NULL,
	"staff_monthly_credit_cap_cents" integer DEFAULT 10000 NOT NULL,
	"credits_fee_enabled" boolean DEFAULT false NOT NULL,
	"credits_fee_bps" integer DEFAULT 500 NOT NULL,
	"credits_fee_min_cents" integer DEFAULT 100 NOT NULL,
	"stripe_mode" text,
	"stripe_account_id" text,
	"stripe_account_name" text,
	"stripe_account_country" text,
	"stripe_tax_active" boolean,
	"stripe_verified_at" timestamp with time zone,
	"stripe_last_error" text,
	"webhook_endpoint_id" text,
	"webhook_url" text,
	"webhook_status" text DEFAULT 'missing' NOT NULL,
	"webhook_connected_at" timestamp with time zone,
	"credits_product_fr_id" text,
	"credits_product_en_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_settings_singleton" CHECK ("payment_settings"."id" = 'default'),
	CONSTRAINT "payment_settings_webhook_status_check" CHECK ("payment_settings"."webhook_status" IN ('missing', 'connected', 'error')),
	CONSTRAINT "payment_settings_fee_check" CHECK ("payment_settings"."credits_fee_bps" BETWEEN 0 AND 3000 AND "payment_settings"."credits_fee_min_cents" >= 0),
	CONSTRAINT "payment_settings_cap_nonneg" CHECK ("payment_settings"."staff_monthly_credit_cap_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"percent_off" integer,
	"amount_off_cents" integer,
	"trial_days" integer,
	"scopes" text[] NOT NULL,
	"duration" text DEFAULT 'once' NOT NULL,
	"duration_months" integer,
	"max_redemptions" integer,
	"expires_at" timestamp with time zone,
	"first_order_only" boolean DEFAULT false NOT NULL,
	"one_per_customer" boolean DEFAULT false NOT NULL,
	"min_amount_cents" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"batch_id" uuid,
	"stripe_coupon_id" text,
	"stripe_promotion_code_id" text,
	"stripe_fingerprint" text,
	"stripe_synced_at" timestamp with time zone,
	"stripe_sync_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_kind_check" CHECK ("promo_codes"."kind" IN ('percent', 'amount', 'free', 'trial', 'staff')),
	CONSTRAINT "promo_codes_status_check" CHECK ("promo_codes"."status" IN ('active', 'disabled')),
	CONSTRAINT "promo_codes_duration_check" CHECK ("promo_codes"."duration" IN ('once', 'repeating', 'forever') AND ("promo_codes"."duration" <> 'repeating' OR ("promo_codes"."duration_months" IS NOT NULL AND "promo_codes"."duration_months" BETWEEN 1 AND 36))),
	CONSTRAINT "promo_codes_scopes_check" CHECK (cardinality("promo_codes"."scopes") BETWEEN 1 AND 3 AND "promo_codes"."scopes" <@ ARRAY['subscriptions', 'credits', 'vps']::text[]),
	CONSTRAINT "promo_codes_value_check" CHECK ((
        ("promo_codes"."kind" = 'percent' AND "promo_codes"."percent_off" IS NOT NULL AND "promo_codes"."percent_off" BETWEEN 1 AND 100) OR
        ("promo_codes"."kind" = 'amount' AND "promo_codes"."amount_off_cents" IS NOT NULL AND "promo_codes"."amount_off_cents" > 0) OR
        ("promo_codes"."kind" = 'trial' AND "promo_codes"."trial_days" IS NOT NULL AND "promo_codes"."trial_days" BETWEEN 1 AND 365) OR
        ("promo_codes"."kind" IN ('free', 'staff'))
      )),
	CONSTRAINT "promo_codes_limits_check" CHECK (("promo_codes"."max_redemptions" IS NULL OR "promo_codes"."max_redemptions" > 0) AND ("promo_codes"."min_amount_cents" IS NULL OR "promo_codes"."min_amount_cents" > 0))
);
--> statement-breakpoint
CREATE TABLE "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"scope" text NOT NULL,
	"source" text NOT NULL,
	"stripe_session_id" text,
	"stripe_subscription_id" text,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemptions_scope_check" CHECK ("promo_redemptions"."scope" IN ('subscriptions', 'credits', 'vps') AND "promo_redemptions"."source" IN ('stripe', 'gift'))
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"granted_by" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_status_check";--> statement-breakpoint
ALTER TABLE "vps_plans" ADD COLUMN "price_suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_grants" ADD CONSTRAINT "gift_grants_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_grants_idempotency_unique" ON "gift_grants" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "gift_grants_org_idx" ON "gift_grants" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_grants_user_month_idx" ON "gift_grants" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "payment_audit_created_idx" ON "payment_audit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "promo_codes_batch_idx" ON "promo_codes" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_redemptions_session_unique" ON "promo_redemptions" USING btree ("promo_code_id","stripe_session_id") WHERE "promo_redemptions"."stripe_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "promo_redemptions_code_idx" ON "promo_redemptions" USING btree ("promo_code_id","created_at");--> statement-breakpoint
CREATE INDEX "promo_redemptions_org_idx" ON "promo_redemptions" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('incomplete','incomplete_expired','trialing','active','past_due','unpaid','paused','canceled','gifted'));
--> statement-breakpoint
-- Journal des paiements : ajout seulement (même fonction que le journal des VPS).
CREATE TRIGGER payment_audit_append_only
  BEFORE UPDATE OR DELETE ON payment_audit
  FOR EACH ROW EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER payment_audit_no_truncate
  BEFORE TRUNCATE ON payment_audit
  FOR EACH STATEMENT EXECUTE FUNCTION gateway_append_only();
