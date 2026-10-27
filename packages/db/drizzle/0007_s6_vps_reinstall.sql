ALTER TABLE "vps_instances" ADD COLUMN "previous_vmid" integer;--> statement-breakpoint
ALTER TABLE "vps_instances" ADD COLUMN "previous_delete_after" timestamp with time zone;