CREATE TABLE "render_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"kind" text DEFAULT 'video' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"scene_prompt" text NOT NULL,
	"provider" text NOT NULL,
	"duration_seconds" integer NOT NULL,
	"ratio" text NOT NULL,
	"media_id" uuid,
	"cost_usd" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_media_id_audio_blobs_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."audio_blobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_jobs_user_created_idx" ON "render_jobs" USING btree ("user_id","created_at");