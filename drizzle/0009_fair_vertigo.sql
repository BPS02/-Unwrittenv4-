CREATE TABLE "story_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"detail" text NOT NULL,
	"fingerprint" text NOT NULL,
	"source" text DEFAULT 'profile' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_memories_user_fingerprint_unique" UNIQUE("user_id","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "story_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "story_memories_user_updated_idx" ON "story_memories" USING btree ("user_id","updated_at");