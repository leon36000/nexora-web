CREATE TABLE "device_oidc_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" text NOT NULL,
	"code_challenge_method" text DEFAULT 'S256' NOT NULL,
	"nonce" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_oidc_codes_method_check" CHECK ("device_oidc_codes"."code_challenge_method" = 'S256')
);
--> statement-breakpoint
CREATE TABLE "device_oidc_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"client_id" text NOT NULL,
	"scope" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gateway_device_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"api_key_id" uuid NOT NULL,
	"previous_api_key_id" uuid,
	"grace_expires_at" timestamp with time zone,
	"device_id" text NOT NULL,
	"device_label" text NOT NULL,
	"product" text NOT NULL,
	"scopes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotate_after" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_device_grants_product_check" CHECK ("gateway_device_grants"."product" IN ('lifecode', 'creative-studio', 'workstudio', 'webpilot')),
	CONSTRAINT "gateway_device_grants_dates_check" CHECK ("gateway_device_grants"."expires_at" > "gateway_device_grants"."issued_at" AND "gateway_device_grants"."rotate_after" >= "gateway_device_grants"."issued_at" AND "gateway_device_grants"."rotate_after" <= "gateway_device_grants"."expires_at"),
	CONSTRAINT "gateway_device_grants_device_nonempty" CHECK (length(trim("gateway_device_grants"."device_id")) > 0 AND length(trim("gateway_device_grants"."device_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "device_oidc_codes" ADD CONSTRAINT "device_oidc_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_oidc_codes" ADD CONSTRAINT "device_oidc_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_oidc_tokens" ADD CONSTRAINT "device_oidc_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_oidc_tokens" ADD CONSTRAINT "device_oidc_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_device_grants" ADD CONSTRAINT "gateway_device_grants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_device_grants" ADD CONSTRAINT "gateway_device_grants_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_device_grants" ADD CONSTRAINT "gateway_device_grants_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_device_grants" ADD CONSTRAINT "gateway_device_grants_previous_api_key_id_api_keys_id_fk" FOREIGN KEY ("previous_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_oidc_codes_hash_unique" ON "device_oidc_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "device_oidc_codes_user_idx" ON "device_oidc_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_oidc_tokens_hash_unique" ON "device_oidc_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_oidc_tokens_org_idx" ON "device_oidc_tokens" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_device_grants_api_key_unique" ON "gateway_device_grants" USING btree ("api_key_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gateway_device_grants_active_device_unique" ON "gateway_device_grants" USING btree ("organization_id","device_id","product") WHERE "gateway_device_grants"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "gateway_device_grants_org_idx" ON "gateway_device_grants" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "gateway_device_grants_prev_key_idx" ON "gateway_device_grants" USING btree ("previous_api_key_id") WHERE "gateway_device_grants"."previous_api_key_id" IS NOT NULL;