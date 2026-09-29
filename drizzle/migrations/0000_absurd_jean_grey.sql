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
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capture_request_id" uuid,
	"raw_content" text NOT NULL,
	"classification_state" text DEFAULT 'pending' NOT NULL,
	"classification_source" text,
	"task_id" uuid,
	"project_id" uuid,
	"classified_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"jev_model" text,
	"type_probability" double precision,
	"relation_probability" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entries_capture_request_id_unique" UNIQUE("capture_request_id"),
	CONSTRAINT "entries_classification_state_check" CHECK ("entries"."classification_state" IN ('pending', 'failed', 'classified')),
	CONSTRAINT "entries_classification_source_check" CHECK ("entries"."classification_source" IS NULL OR "entries"."classification_source" IN ('jev', 'manual')),
	CONSTRAINT "entries_classification_consistency_check" CHECK (("entries"."classification_state" = 'classified' AND "entries"."classification_source" IS NOT NULL AND "entries"."classified_at" IS NOT NULL AND num_nonnulls("entries"."task_id", "entries"."project_id") = 1) OR ("entries"."classification_state" IN ('pending', 'failed') AND "entries"."classification_source" IS NULL AND "entries"."classified_at" IS NULL AND num_nonnulls("entries"."task_id", "entries"."project_id") = 0)),
	CONSTRAINT "entries_reviewed_at_check" CHECK ("entries"."reviewed_at" IS NULL OR ("entries"."classification_state" = 'classified' AND "entries"."classification_source" = 'jev')),
	CONSTRAINT "entries_type_probability_check" CHECK ("entries"."type_probability" IS NULL OR ("entries"."type_probability" >= 0 AND "entries"."type_probability" <= 1)),
	CONSTRAINT "entries_relation_probability_check" CHECK ("entries"."relation_probability" IS NULL OR ("entries"."relation_probability" >= 0 AND "entries"."relation_probability" <= 1))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_checkpoint_id_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");