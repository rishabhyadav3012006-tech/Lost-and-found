CREATE TABLE "matches" (
	"id" serial PRIMARY KEY,
	"missing_report_id" integer NOT NULL,
	"found_report_id" integer NOT NULL,
	"score" double precision NOT NULL,
	"match_details" jsonb,
	"status" text DEFAULT 'suggested' NOT NULL,
	"reviewed_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY,
	"report_id" integer NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY,
	"report_type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"person_name" text,
	"approximate_age_min" integer,
	"approximate_age_max" integer,
	"gender" text DEFAULT 'unknown' NOT NULL,
	"height_cm_min" integer,
	"height_cm_max" integer,
	"build" text,
	"hair_color" text,
	"eye_color" text,
	"skin_tone" text,
	"distinguishing_features" text,
	"clothing_description" text,
	"location_description" text,
	"location_lat" double precision,
	"location_lng" double precision,
	"incident_date" timestamp with time zone,
	"additional_info" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"submitter_id" integer,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"full_name" text NOT NULL,
	"hashed_password" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "matches_missing_idx" ON "matches" ("missing_report_id");--> statement-breakpoint
CREATE INDEX "matches_found_idx" ON "matches" ("found_report_id");--> statement-breakpoint
CREATE INDEX "photos_report_idx" ON "photos" ("report_id");--> statement-breakpoint
CREATE INDEX "reports_type_status_idx" ON "reports" ("report_type","status");--> statement-breakpoint
CREATE INDEX "reports_submitter_idx" ON "reports" ("submitter_id");--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_missing_report_id_reports_id_fkey" FOREIGN KEY ("missing_report_id") REFERENCES "reports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_found_report_id_reports_id_fkey" FOREIGN KEY ("found_report_id") REFERENCES "reports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_reviewed_by_id_users_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_report_id_reports_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_submitter_id_users_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE SET NULL;