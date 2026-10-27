CREATE TABLE "os_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"os" text NOT NULL,
	"os_version" text NOT NULL,
	"vmid" integer NOT NULL,
	"ci_user" text DEFAULT 'debian' NOT NULL,
	"image_sha256" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_templates_state_check" CHECK ("os_templates"."state" IN ('draft', 'ready', 'retired')),
	CONSTRAINT "os_templates_vmid_range" CHECK ("os_templates"."vmid" BETWEEN 100 AND 999999999)
);
--> statement-breakpoint
CREATE TABLE "proxmox_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 8006 NOT NULL,
	"node" text NOT NULL,
	"region" text DEFAULT 'quebec' NOT NULL,
	"capacity" jsonb NOT NULL,
	"ip_pool" jsonb NOT NULL,
	"token_ref" text,
	"tls_mode" text DEFAULT 'verify' NOT NULL,
	"tls_fingerprint" text,
	"storage" text DEFAULT 'local-lvm' NOT NULL,
	"pool" text,
	"vmid_min" integer DEFAULT 10000 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_check_ok" boolean,
	"last_check_detail" text,
	"pve_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proxmox_servers_state_check" CHECK ("proxmox_servers"."state" IN ('draft', 'ready', 'maintenance', 'offline')),
	CONSTRAINT "proxmox_servers_tls_check" CHECK ("proxmox_servers"."tls_mode" IN ('verify', 'pinned') AND ("proxmox_servers"."tls_mode" <> 'pinned' OR "proxmox_servers"."tls_fingerprint" IS NOT NULL)),
	CONSTRAINT "proxmox_servers_region_check" CHECK ("proxmox_servers"."region" IN ('quebec', 'canada', 'etats_unis', 'europe', 'autre'))
);
--> statement-breakpoint
CREATE TABLE "vps_apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'installable' NOT NULL,
	"tagline_fr" text DEFAULT '' NOT NULL,
	"tagline_en" text DEFAULT '' NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"version" text NOT NULL,
	"upstream_url" text NOT NULL,
	"license" text NOT NULL,
	"license_url" text NOT NULL,
	"license_warning_fr" text DEFAULT '' NOT NULL,
	"license_warning_en" text DEFAULT '' NOT NULL,
	"guide_fr" text DEFAULT '' NOT NULL,
	"guide_en" text DEFAULT '' NOT NULL,
	"install_script_version" integer DEFAULT 1 NOT NULL,
	"install_script" text,
	"install_script_sha256" text,
	"ports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_ram_mb" integer DEFAULT 1024 NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vps_apps_status_check" CHECK ("vps_apps"."status" IN ('draft', 'approved', 'published', 'retired')),
	CONSTRAINT "vps_apps_kind_check" CHECK ("vps_apps"."kind" IN ('installable', 'guide')),
	CONSTRAINT "vps_apps_script_check" CHECK ((
        ("vps_apps"."kind" = 'installable' AND "vps_apps"."install_script" IS NOT NULL
          AND "vps_apps"."install_script_sha256" = encode(sha256(convert_to("vps_apps"."install_script", 'UTF8')), 'hex'))
        OR ("vps_apps"."kind" = 'guide' AND "vps_apps"."install_script" IS NULL AND "vps_apps"."install_script_sha256" IS NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "vps_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"order_id" uuid,
	"instance_id" uuid,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vps_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"vcpu" integer NOT NULL,
	"ram_mb" integer NOT NULL,
	"disk_gb" integer NOT NULL,
	"plan_code" text NOT NULL,
	"app_code" text NOT NULL,
	"app_version" text NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"server_id" uuid,
	"vmid" integer,
	"ipv4" text,
	"vm_name" text NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"step" text DEFAULT 'placement' NOT NULL,
	"power" text DEFAULT 'unknown' NOT NULL,
	"run_seq" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"pending_action" text,
	"install_script_sha256" text,
	"ssh_host_key_fingerprint" text,
	"last_snapshot_name" text,
	"last_error" text,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"retention_ends_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vps_instances_status_check" CHECK ("vps_instances"."status" IN ('provisioning', 'active', 'suspended', 'reinstalling', 'canceled', 'failed', 'deleted')),
	CONSTRAINT "vps_instances_step_check" CHECK ("vps_instances"."step" IN ('placement', 'snapshot', 'clone', 'configure', 'firewall', 'start', 'await_agent', 'install', 'verify', 'done')),
	CONSTRAINT "vps_instances_power_check" CHECK ("vps_instances"."power" IN ('unknown', 'running', 'stopped'))
);
--> statement-breakpoint
CREATE TABLE "vps_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text,
	"idempotency_key" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_code" text NOT NULL,
	"app_id" uuid NOT NULL,
	"app_code" text NOT NULL,
	"term" text NOT NULL,
	"region" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'cad' NOT NULL,
	"catalog_version_id" uuid NOT NULL,
	"catalog_version" text NOT NULL,
	"ssh_public_key" text NOT NULL,
	"ssh_key_fingerprint" text NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"stripe_checkout_session_id" text,
	"stripe_subscription_id" text,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vps_orders_status_check" CHECK ("vps_orders"."status" IN ('awaiting_payment', 'paid', 'provisioning', 'fulfilled', 'failed', 'canceled', 'expired')),
	CONSTRAINT "vps_orders_term_check" CHECK ("vps_orders"."term" IN ('month', 'year')),
	CONSTRAINT "vps_orders_price_pos" CHECK ("vps_orders"."price_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "vps_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"vcpu" integer NOT NULL,
	"ram_mb" integer NOT NULL,
	"disk_gb" integer NOT NULL,
	"bandwidth_gb" integer NOT NULL,
	"region" text DEFAULT 'quebec' NOT NULL,
	"price_monthly_cents" integer,
	"price_yearly_cents" integer,
	"highlighted" boolean DEFAULT false NOT NULL,
	"stripe_product_id" text,
	"stripe_price_monthly_id" text,
	"stripe_price_yearly_id" text,
	"template_code" text NOT NULL,
	"sort" integer DEFAULT 100 NOT NULL,
	"is_dev_sample" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vps_plans_status_check" CHECK ("vps_plans"."status" IN ('draft', 'approved', 'published', 'retired')),
	CONSTRAINT "vps_plans_region_check" CHECK ("vps_plans"."region" IN ('quebec', 'canada', 'etats_unis', 'europe', 'autre')),
	CONSTRAINT "vps_plans_size_pos" CHECK ("vps_plans"."vcpu" > 0 AND "vps_plans"."ram_mb" > 0 AND "vps_plans"."disk_gb" > 0 AND "vps_plans"."bandwidth_gb" >= 0),
	CONSTRAINT "vps_plans_price_pos" CHECK (("vps_plans"."price_monthly_cents" IS NULL OR "vps_plans"."price_monthly_cents" > 0) AND ("vps_plans"."price_yearly_cents" IS NULL OR "vps_plans"."price_yearly_cents" > 0))
);
--> statement-breakpoint
ALTER TABLE "os_templates" ADD CONSTRAINT "os_templates_server_id_proxmox_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."proxmox_servers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_instances" ADD CONSTRAINT "vps_instances_order_id_vps_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."vps_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_instances" ADD CONSTRAINT "vps_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_instances" ADD CONSTRAINT "vps_instances_server_id_proxmox_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."proxmox_servers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_orders" ADD CONSTRAINT "vps_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_orders" ADD CONSTRAINT "vps_orders_plan_id_vps_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."vps_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vps_orders" ADD CONSTRAINT "vps_orders_app_id_vps_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."vps_apps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "os_templates_server_code_unique" ON "os_templates" USING btree ("server_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "proxmox_servers_code_unique" ON "proxmox_servers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_apps_code_unique" ON "vps_apps" USING btree ("code");--> statement-breakpoint
CREATE INDEX "vps_events_instance_idx" ON "vps_events" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "vps_events_order_idx" ON "vps_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "vps_events_org_idx" ON "vps_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_instances_order_unique" ON "vps_instances" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_instances_server_vmid_unique" ON "vps_instances" USING btree ("server_id","vmid") WHERE "vps_instances"."vmid" IS NOT NULL AND "vps_instances"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "vps_instances_server_ip_unique" ON "vps_instances" USING btree ("server_id","ipv4") WHERE "vps_instances"."ipv4" IS NOT NULL AND "vps_instances"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vps_instances_org_idx" ON "vps_instances" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "vps_instances_status_idx" ON "vps_instances" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_orders_idempotency_unique" ON "vps_orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_orders_subscription_unique" ON "vps_orders" USING btree ("stripe_subscription_id") WHERE "vps_orders"."stripe_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "vps_orders_session_unique" ON "vps_orders" USING btree ("stripe_checkout_session_id") WHERE "vps_orders"."stripe_checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "vps_orders_org_idx" ON "vps_orders" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vps_plans_code_unique" ON "vps_plans" USING btree ("code");
--> statement-breakpoint
-- Journal d'un VPS : ajout seulement (réutilise la fonction de la passerelle, migration 0005).
CREATE TRIGGER vps_events_append_only
  BEFORE UPDATE OR DELETE ON vps_events
  FOR EACH ROW EXECUTE FUNCTION gateway_append_only();
--> statement-breakpoint
CREATE TRIGGER vps_events_no_truncate
  BEFORE TRUNCATE ON vps_events
  FOR EACH STATEMENT EXECUTE FUNCTION gateway_append_only();
