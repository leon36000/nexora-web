ALTER TABLE "usage_events" ADD COLUMN "reported_cost_usd_nano" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "upstream_cost_usd_nano" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "litellm_call_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "litellm_response_cost_nano" bigint;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "upstream_generation_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "upstream_provider" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "fx_usd_to_cad_micro" bigint;--> statement-breakpoint
CREATE INDEX "usage_events_generation_idx" ON "usage_events" USING btree ("upstream_generation_id") WHERE "usage_events"."upstream_generation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_events_litellm_call_idx" ON "usage_events" USING btree ("litellm_call_id") WHERE "usage_events"."litellm_call_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "usage_events_reconcilable_idx" ON "usage_events" USING btree ("created_at") WHERE "usage_events"."status" <> 'error' AND ("usage_events"."litellm_call_id" IS NOT NULL OR "usage_events"."upstream_generation_id" IS NOT NULL);