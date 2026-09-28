ALTER TABLE "entries" ADD COLUMN "capture_request_id" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "classification_state" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "classification_source" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "vision_id" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "jev_model" text;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "type_probability" double precision;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "relation_probability" double precision;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_vision_id_visions_id_fk" FOREIGN KEY ("vision_id") REFERENCES "public"."visions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_capture_request_id_unique" UNIQUE("capture_request_id");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_classification_state_check" CHECK ("entries"."classification_state" IN ('pending', 'failed', 'classified'));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_classification_source_check" CHECK ("entries"."classification_source" IS NULL OR "entries"."classification_source" IN ('jev', 'manual'));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_classification_consistency_check" CHECK (("entries"."classification_state" = 'classified' AND "entries"."classification_source" IS NOT NULL AND "entries"."classified_at" IS NOT NULL AND num_nonnulls("entries"."task_id", "entries"."project_id", "entries"."vision_id") = 1) OR ("entries"."classification_state" IN ('pending', 'failed') AND "entries"."classification_source" IS NULL AND "entries"."classified_at" IS NULL AND num_nonnulls("entries"."task_id", "entries"."project_id", "entries"."vision_id") = 0));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_reviewed_at_check" CHECK ("entries"."reviewed_at" IS NULL OR ("entries"."classification_state" = 'classified' AND "entries"."classification_source" = 'jev'));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_type_probability_check" CHECK ("entries"."type_probability" IS NULL OR ("entries"."type_probability" >= 0 AND "entries"."type_probability" <= 1));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_relation_probability_check" CHECK ("entries"."relation_probability" IS NULL OR ("entries"."relation_probability" >= 0 AND "entries"."relation_probability" <= 1));