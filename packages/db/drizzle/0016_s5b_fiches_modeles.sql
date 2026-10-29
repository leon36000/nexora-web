ALTER TABLE "models" ADD COLUMN "sheet" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "routing" jsonb DEFAULT '{}'::jsonb NOT NULL;