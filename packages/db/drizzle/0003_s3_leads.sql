CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fingerprint" text NOT NULL,
	"lang" text NOT NULL,
	"need" text NOT NULL,
	"sector" text NOT NULL,
	"deployment" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"message" text,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "leads_lang_check" CHECK ("leads"."lang" IN ('fr', 'en'))
);
--> statement-breakpoint
CREATE INDEX "leads_fingerprint_idx" ON "leads" USING btree ("fingerprint","created_at");--> statement-breakpoint
CREATE INDEX "leads_created_idx" ON "leads" USING btree ("created_at");