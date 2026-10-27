CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"locale" text DEFAULT 'fr' NOT NULL,
	"company" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"balance_micro" bigint DEFAULT 0 NOT NULL,
	"held_micro" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_held_nonneg" CHECK ("credit_accounts"."held_micro" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"balance_delta_micro" bigint NOT NULL,
	"held_delta_micro" bigint NOT NULL,
	"balance_after_micro" bigint NOT NULL,
	"held_after_micro" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"config_version" text NOT NULL,
	"source" text NOT NULL,
	"reservation_id" uuid,
	"lot_entry_id" uuid,
	"purchase_id" uuid,
	"expires_at" timestamp with time zone,
	"external_ref" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_entries_kind_check" CHECK ("credit_entries"."kind" IN ('credit','reserve','settle','release','refund','dispute','expire')),
	CONSTRAINT "credit_entries_no_overdraft_check" CHECK (("credit_entries"."kind" NOT IN ('reserve','expire') OR "credit_entries"."balance_after_micro" - "credit_entries"."held_after_micro" >= 0)),
	CONSTRAINT "credit_entries_signs_check" CHECK ((
        ("credit_entries"."kind" = 'credit'  AND "credit_entries"."balance_delta_micro" > 0 AND "credit_entries"."held_delta_micro" = 0) OR
        ("credit_entries"."kind" = 'reserve' AND "credit_entries"."balance_delta_micro" = 0 AND "credit_entries"."held_delta_micro" > 0) OR
        ("credit_entries"."kind" = 'settle'  AND "credit_entries"."balance_delta_micro" <= 0 AND "credit_entries"."held_delta_micro" < 0 AND "credit_entries"."balance_delta_micro" >= "credit_entries"."held_delta_micro") OR
        ("credit_entries"."kind" = 'release' AND "credit_entries"."balance_delta_micro" = 0 AND "credit_entries"."held_delta_micro" < 0) OR
        ("credit_entries"."kind" IN ('refund','dispute','expire') AND "credit_entries"."balance_delta_micro" < 0 AND "credit_entries"."held_delta_micro" = 0)
      ))
);
--> statement-breakpoint
CREATE TABLE "credit_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"currency" text DEFAULT 'cad' NOT NULL,
	"amount_subtotal_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"amount_total_cents" integer NOT NULL,
	"credits_micro" bigint NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_purchases_credits_pos" CHECK ("credit_purchases"."credits_micro" > 0),
	CONSTRAINT "credit_purchases_status_check" CHECK ("credit_purchases"."status" IN ('paid','partially_refunded','refunded','disputed'))
);
--> statement-breakpoint
CREATE TABLE "credit_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"amount_micro" bigint NOT NULL,
	"settled_micro" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"idempotency_key" text NOT NULL,
	"config_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "credit_reservations_amount_pos" CHECK ("credit_reservations"."amount_micro" > 0),
	CONSTRAINT "credit_reservations_status_check" CHECK ("credit_reservations"."status" IN ('open','settled','released'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"plan_code" text,
	"stripe_price_id" text,
	"status" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"last_event_created" bigint DEFAULT 0 NOT NULL,
	"config_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" IN ('incomplete','incomplete_expired','trialing','active','past_due','unpaid','paused','canceled'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limits_key_unique" ON "auth_rate_limits" USING btree ("key");--> statement-breakpoint
CREATE INDEX "invitations_org_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_org_user_unique" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_stripe_unique" ON "billing_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_entries_idempotency_unique" ON "credit_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_entries_org_idx" ON "credit_entries" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_entries_lot_idx" ON "credit_entries" USING btree ("lot_entry_id");--> statement-breakpoint
CREATE INDEX "credit_entries_purchase_idx" ON "credit_entries" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_session_unique" ON "credit_purchases" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_purchases_pi_unique" ON "credit_purchases" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "credit_purchases_org_idx" ON "credit_purchases" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_reservations_idempotency_unique" ON "credit_reservations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_reservations_open_idx" ON "credit_reservations" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_unique" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id");