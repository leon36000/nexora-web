-- Nexora Code (chantier F) : codes d'appareil (connexion de l'agent de code par le compte Nexora) et environnements hébergés (un conteneur par personne).
CREATE TABLE "code_device_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code_hash" text NOT NULL,
	"device_name" text NOT NULL,
	"client" text NOT NULL,
	"client_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"approved_user_id" text,
	"approved_organization_id" text,
	"approved_at" timestamp with time zone,
	"api_key_id" uuid,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_device_codes_status_check" CHECK ("code_device_codes"."status" IN ('pending', 'approved', 'denied', 'delivered'))
);
--> statement-breakpoint
CREATE TABLE "code_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"proxy_id" text NOT NULL,
	"container_name" text NOT NULL,
	"volume_name" text NOT NULL,
	"port" integer NOT NULL,
	"api_key_id" uuid,
	"desired_status" text DEFAULT 'stopped' NOT NULL,
	"last_error" text,
	"last_activity_at" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_stopped_at" timestamp with time zone,
	"accounted_bytes" bigint DEFAULT 0 NOT NULL,
	"size_measured_at" timestamp with time zone,
	"quota_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "code_workspaces_status_check" CHECK ("code_workspaces"."desired_status" IN ('stopped', 'running')),
	CONSTRAINT "code_workspaces_bytes_check" CHECK ("code_workspaces"."accounted_bytes" >= 0),
	CONSTRAINT "code_workspaces_port_check" CHECK ("code_workspaces"."port" BETWEEN 1024 AND 65535)
);
--> statement-breakpoint
ALTER TABLE "code_device_codes" ADD CONSTRAINT "code_device_codes_approved_user_id_users_id_fk" FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_device_codes" ADD CONSTRAINT "code_device_codes_approved_organization_id_organizations_id_fk" FOREIGN KEY ("approved_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_device_codes" ADD CONSTRAINT "code_device_codes_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_workspaces" ADD CONSTRAINT "code_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_workspaces" ADD CONSTRAINT "code_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_workspaces" ADD CONSTRAINT "code_workspaces_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_device_codes_device_hash_unique" ON "code_device_codes" USING btree ("device_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "code_device_codes_user_hash_unique" ON "code_device_codes" USING btree ("user_code_hash");--> statement-breakpoint
CREATE INDEX "code_device_codes_expires_idx" ON "code_device_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "code_workspaces_person_unique" ON "code_workspaces" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_workspaces_proxy_unique" ON "code_workspaces" USING btree ("proxy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_workspaces_container_unique" ON "code_workspaces" USING btree ("container_name");--> statement-breakpoint
CREATE UNIQUE INDEX "code_workspaces_volume_unique" ON "code_workspaces" USING btree ("volume_name");--> statement-breakpoint
CREATE UNIQUE INDEX "code_workspaces_port_unique" ON "code_workspaces" USING btree ("port");--> statement-breakpoint
CREATE INDEX "code_workspaces_running_idx" ON "code_workspaces" USING btree ("desired_status");