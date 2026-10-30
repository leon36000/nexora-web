CREATE TABLE "organization_storage" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"extra_bytes" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_storage_extra_nonneg" CHECK ("organization_storage"."extra_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "storage_usage" (
	"organization_id" text NOT NULL,
	"product" text NOT NULL,
	"used_bytes" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_usage_organization_id_product_pk" PRIMARY KEY("organization_id","product"),
	CONSTRAINT "storage_usage_nonneg" CHECK ("storage_usage"."used_bytes" >= 0),
	CONSTRAINT "storage_usage_product_check" CHECK ("storage_usage"."product" IN ('workstudio','code','rag','creative','bot'))
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "storage_quota_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_storage" ADD CONSTRAINT "organization_storage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_usage" ADD CONSTRAINT "storage_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_interval_check" CHECK ("subscriptions"."billing_interval" IS NULL OR "subscriptions"."billing_interval" IN ('month','year'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_storage_quota_check" CHECK ("subscriptions"."storage_quota_bytes" >= 0);