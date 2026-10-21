CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" text,
	"safe_metadata" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "booking_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"capacity" integer DEFAULT 50 NOT NULL,
	"sub_section" varchar(10) DEFAULT 'ALL' NOT NULL,
	"next_queue_number" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_window_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"queue_number" integer NOT NULL,
	"ticket_number" integer,
	"desk" varchar(10) DEFAULT 'T' NOT NULL,
	"status" varchar(20) DEFAULT 'WAITING' NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"called_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"target_type" varchar(20) DEFAULT 'ALL' NOT NULL,
	"target_student_id" uuid,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"message" text,
	"type" varchar(20) DEFAULT 'SERVICE' NOT NULL,
	"request_campaign_id" uuid,
	"telegram_message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fingerprint_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"booking_id" uuid,
	"activated_by" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVATED' NOT NULL,
	"notes" text,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"recipient_id" uuid,
	"telegram_chat_id" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"idempotency_key" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "section_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sub_section" varchar(10) DEFAULT 'ALL' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sections_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"full_name" varchar(255) NOT NULL,
	"academic_number" varchar(50) NOT NULL,
	"national_id_encrypted" text NOT NULL,
	"national_id_hash" varchar(64) NOT NULL,
	"group_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"sub_section" varchar(10) DEFAULT 'A' NOT NULL,
	"telegram_user_id" bigint,
	"telegram_username" varchar(100),
	"telegram_linked_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"banned_until" timestamp with time zone,
	"ban_reason" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_academic_number_unique" UNIQUE("academic_number"),
	CONSTRAINT "students_national_id_hash_unique" UNIQUE("national_id_hash"),
	CONSTRAINT "students_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_filters" jsonb,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_link_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telegram_updates" (
	"id" bigint PRIMARY KEY NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"password_hash" text,
	"role" varchar(20) DEFAULT 'STUDENT' NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"banned_until" timestamp with time zone,
	"ban_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_windows" ADD CONSTRAINT "booking_windows_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_windows" ADD CONSTRAINT "booking_windows_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "booking_windows" ADD CONSTRAINT "booking_windows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_window_id_booking_windows_id_fk" FOREIGN KEY ("booking_window_id") REFERENCES "public"."booking_windows"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_campaigns" ADD CONSTRAINT "feedback_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_campaigns" ADD CONSTRAINT "feedback_campaigns_target_student_id_students_id_fk" FOREIGN KEY ("target_student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback_ratings" ADD CONSTRAINT "feedback_ratings_request_campaign_id_feedback_campaigns_id_fk" FOREIGN KEY ("request_campaign_id") REFERENCES "public"."feedback_campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fingerprint_activations" ADD CONSTRAINT "fingerprint_activations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fingerprint_activations" ADD CONSTRAINT "fingerprint_activations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fingerprint_activations" ADD CONSTRAINT "fingerprint_activations_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_students_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "section_schedules" ADD CONSTRAINT "section_schedules_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sections" ADD CONSTRAINT "sections_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_campaign_recipients" ADD CONSTRAINT "telegram_campaign_recipients_campaign_id_telegram_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."telegram_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_campaign_recipients" ADD CONSTRAINT "telegram_campaign_recipients_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_campaigns" ADD CONSTRAINT "telegram_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_windows_section_status_idx" ON "booking_windows" USING btree ("section_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "booking_windows_starts_ends_idx" ON "booking_windows" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_window_desk_queue_idx" ON "bookings" USING btree ("booking_window_id","desk","queue_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_student_window_idx" ON "bookings" USING btree ("student_id","booking_window_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_window_status_idx" ON "bookings" USING btree ("booking_window_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_desk_idx" ON "bookings" USING btree ("desk");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_campaigns_created_by_idx" ON "feedback_campaigns" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_ratings_student_idx" ON "feedback_ratings" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_ratings_created_idx" ON "feedback_ratings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feedback_ratings_campaign_idx" ON "feedback_ratings" USING btree ("request_campaign_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fingerprint_activations_student_idx" ON "fingerprint_activations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fingerprint_activations_booking_idx" ON "fingerprint_activations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fingerprint_activations_staff_idx" ON "fingerprint_activations" USING btree ("activated_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_status_attempt_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_outbox_idempotency_idx" ON "notification_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "section_schedules_section_date_idx" ON "section_schedules" USING btree ("section_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sections_group_id_idx" ON "sections" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_academic_number_idx" ON "students" USING btree ("academic_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_national_id_hash_idx" ON "students" USING btree ("national_id_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_group_section_idx" ON "students" USING btree ("group_id","section_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_telegram_user_idx" ON "students" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_recipient_idx" ON "telegram_campaign_recipients" USING btree ("campaign_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_status_idx" ON "telegram_campaign_recipients" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_hash_idx" ON "telegram_link_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_link_tokens_student_idx" ON "telegram_link_tokens" USING btree ("student_id");