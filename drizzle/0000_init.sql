CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"song_id" text,
	"period_end" timestamp with time zone,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"user_id" text PRIMARY KEY NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"free_song_used" boolean DEFAULT false NOT NULL,
	"free_song_id" text,
	"free_takes_used" integer DEFAULT 0 NOT NULL,
	"songs_remaining" integer DEFAULT 0 NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"claims_free_song" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_unlocks" (
	"user_id" text NOT NULL,
	"song_id" text NOT NULL,
	"billing_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_unlocks_user_id_song_id_pk" PRIMARY KEY("user_id","song_id")
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"lyrics" text NOT NULL,
	"style_prompt" text DEFAULT '' NOT NULL,
	"provider" text NOT NULL,
	"mime_type" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" text NOT NULL,
	"n" integer NOT NULL,
	"provider" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"master_pathname" text,
	"preview_pathname" text,
	"quality" text DEFAULT 'preview' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "takes_song_n_unique" UNIQUE("song_id","n")
);
--> statement-breakpoint
ALTER TABLE "takes" ADD CONSTRAINT "takes_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_reservations_user_status_idx" ON "render_reservations" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "songs_user_created_idx" ON "songs" USING btree ("user_id","created_at");