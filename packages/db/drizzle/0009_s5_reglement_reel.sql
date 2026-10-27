ALTER TABLE "credit_entries" DROP CONSTRAINT "credit_entries_kind_check";--> statement-breakpoint
ALTER TABLE "credit_entries" DROP CONSTRAINT "credit_entries_signs_check";--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "api_key_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_reservations" ADD COLUMN "key_spend_held" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_kind_check" CHECK ("credit_entries"."kind" IN ('credit','reserve','settle','release','refund','dispute','expire','overage'));--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_signs_check" CHECK ((
        ("credit_entries"."kind" = 'credit'  AND "credit_entries"."balance_delta_micro" > 0 AND "credit_entries"."held_delta_micro" = 0) OR
        ("credit_entries"."kind" = 'reserve' AND "credit_entries"."balance_delta_micro" = 0 AND "credit_entries"."held_delta_micro" > 0) OR
        ("credit_entries"."kind" = 'settle'  AND "credit_entries"."balance_delta_micro" <= 0 AND "credit_entries"."held_delta_micro" < 0 AND "credit_entries"."balance_delta_micro" >= "credit_entries"."held_delta_micro") OR
        ("credit_entries"."kind" = 'release' AND "credit_entries"."balance_delta_micro" = 0 AND "credit_entries"."held_delta_micro" < 0) OR
        ("credit_entries"."kind" IN ('refund','dispute','expire','overage') AND "credit_entries"."balance_delta_micro" < 0 AND "credit_entries"."held_delta_micro" = 0)
      ));