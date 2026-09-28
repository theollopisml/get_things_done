CREATE TABLE "checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"target_date" date,
	"position" integer NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "checkpoints_status_check" CHECK ("checkpoints"."status" IN ('open', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vision_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"start_date" date,
	"due_date" date,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_status_check" CHECK ("projects"."status" IN ('planned', 'active', 'paused', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"checkpoint_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo' NOT NULL,
	"scheduled_date" date,
	"scheduled_time" time,
	"due_date" date,
	"due_time" time,
	"recurrence_rule" jsonb,
	"recurrence_anchor_date" date,
	"position" integer,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" IN ('todo', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "tasks_scheduled_time_check" CHECK ("tasks"."scheduled_time" IS NULL OR "tasks"."scheduled_date" IS NOT NULL),
	CONSTRAINT "tasks_due_time_check" CHECK ("tasks"."due_time" IS NULL OR "tasks"."due_date" IS NOT NULL),
	CONSTRAINT "tasks_recurrence_check" CHECK ("tasks"."recurrence_rule" IS NULL OR ("tasks"."scheduled_date" IS NOT NULL AND "tasks"."due_date" IS NULL AND "tasks"."due_time" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "visions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "visions_status_check" CHECK ("visions"."status" IN ('active', 'paused', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_vision_id_visions_id_fk" FOREIGN KEY ("vision_id") REFERENCES "public"."visions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE no action ON UPDATE no action;