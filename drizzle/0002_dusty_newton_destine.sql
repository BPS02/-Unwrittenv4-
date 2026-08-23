CREATE TABLE "audio_blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "master_audio_id" uuid;--> statement-breakpoint
ALTER TABLE "takes" ADD COLUMN "preview_audio_id" uuid;--> statement-breakpoint
CREATE INDEX "audio_blobs_user_idx" ON "audio_blobs" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_master_audio_id_audio_blobs_id_fk" FOREIGN KEY ("master_audio_id") REFERENCES "public"."audio_blobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_preview_audio_id_audio_blobs_id_fk" FOREIGN KEY ("preview_audio_id") REFERENCES "public"."audio_blobs"("id") ON DELETE set null ON UPDATE no action;