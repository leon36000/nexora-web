CREATE TABLE "model_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"upstream_id" text NOT NULL,
	"position" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"upstream_input_usd_micro" bigint,
	"upstream_output_usd_micro" bigint,
	"upstream_cache_usd_micro" bigint,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_routes_position_pos" CHECK ("model_routes"."position" >= 1),
	CONSTRAINT "model_routes_price_pair" CHECK (("model_routes"."upstream_input_usd_micro" IS NULL) = ("model_routes"."upstream_output_usd_micro" IS NULL)),
	CONSTRAINT "model_routes_price_nonneg" CHECK (COALESCE("model_routes"."upstream_input_usd_micro", 0) >= 0 AND COALESCE("model_routes"."upstream_output_usd_micro", 0) >= 0)
);
--> statement-breakpoint
ALTER TABLE "model_routes" ADD CONSTRAINT "model_routes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_routes" ADD CONSTRAINT "model_routes_provider_id_model_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_routes_position_unique" ON "model_routes" USING btree ("model_id","position");--> statement-breakpoint
CREATE INDEX "model_routes_provider_idx" ON "model_routes" USING btree ("provider_id");