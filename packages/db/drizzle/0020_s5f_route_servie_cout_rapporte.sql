ALTER TABLE "usage_events" ADD COLUMN "route_position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "reported_cost_usd_micro" bigint;