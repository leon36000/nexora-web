ALTER TABLE "model_prices" ADD COLUMN "upstream_cache_write_usd_micro" bigint;--> statement-breakpoint
ALTER TABLE "model_prices" ADD COLUMN "sell_cache_write_cad_micro" bigint;--> statement-breakpoint
ALTER TABLE "model_prices" ADD COLUMN "windows" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "cache_write_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "reasoning_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "price_cache_write_micro" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "price_window" text;