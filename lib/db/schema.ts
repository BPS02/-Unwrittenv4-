import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Raw binary. Drizzle has no built-in bytea, so declare it once here. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Unwritten persistence — Neon Postgres.
 *
 * V2 kept entitlements in Clerk `privateMetadata` and one JSON blob per song.
 * That was a workable interim but it was read-modify-write (two simultaneous
 * renders by one user could race), size-limited (which is why the unlock and
 * billing-event lists were capped and silently evicted their oldest entries),
 * and impossible to query for revenue.
 *
 * What does NOT change here:
 * - Clerk `auth()` is still the only source of identity. `user_id` below is a
 *   Clerk user id; this database stores what an identity is entitled to, and
 *   never establishes who someone is.
 * - Audio bytes still live in the private Blob store. Only pathnames are
 *   stored here, so the signed-token gate in /api/audio/[token] is unchanged
 *   and remains the single place a master can be served.
 */

/** Committed entitlement state. One row per Clerk user. */
export const entitlements = pgTable("entitlements", {
  /** Clerk user id — the record key, never supplied by a client. */
  userId: text("user_id").primaryKey(),
  tier: text("tier", { enum: ["free", "pro"] })
    .notNull()
    .default("free"),
  /** Lifetime free song: whether it has been claimed, and by which song. */
  freeSongUsed: boolean("free_song_used").notNull().default(false),
  freeSongId: text("free_song_id"),
  /** Committed preview takes of the free song (reservations counted separately). */
  freeTakesUsed: integer("free_takes_used").notNull().default(0),
  /** Pro generations left this period. Meaningless while tier = 'free'. */
  songsRemaining: integer("songs_remaining").notNull().default(0),
  /** Purchased render credits. Never reset by subscription lifecycle. */
  purchasedCredits: integer("purchased_credits").notNull().default(0),
  /** Pro billing period end; the allowance refills when it passes. */
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * In-flight render holds — the fix for V2's documented race.
 *
 * A render reserves what it is about to consume BEFORE the music provider is
 * called, and commits only after the provider returns audio. Effective usage
 * is the committed counters above plus every reservation that is still
 * `reserved` and unexpired, so two concurrent renders cannot both pass the
 * gate on the last remaining take.
 *
 * A crashed render leaves a `reserved` row that simply expires and stops
 * counting, so nothing is permanently lost — this is why the hold is a row
 * with an expiry rather than an incremented counter.
 */
export const renderReservations = pgTable(
  "render_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    songId: text("song_id").notNull(),
    /** What this hold consumes if it commits. */
    kind: text("kind", { enum: ["free_take", "pro_song", "purchased_credit"] }).notNull(),
    status: text("status", { enum: ["reserved", "committed", "released"] })
      .notNull()
      .default("reserved"),
    /** True when this hold also claims the lifetime free song. */
    claimsFreeSong: boolean("claims_free_song").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("render_reservations_user_status_idx").on(t.userId, t.status)]
);

/**
 * Songs. One row per song; audio lives in Blob and is referenced by pathname
 * on `takes`. Replaces liner-notes-songs/{userId}/{songId}.json.
 */
export const songs = pgTable(
  "songs",
  {
    /** App-generated song id (kept as text so existing ids stay valid). */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    lyrics: text("lyrics").notNull(),
    stylePrompt: text("style_prompt").notNull().default(""),
    provider: text("provider").notNull(),
    mimeType: text("mime_type").notNull(),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("songs_user_created_idx").on(t.userId, t.createdAt)]
);

/**
 * Rendered audio, stored in Postgres.
 *
 * Audio used to live in the private Blob store with only pathnames here.
 * It now lives in this table so the whole product is one database — the same
 * connection string, the same backups, one place to look. The paywall is
 * unchanged: bytes are still only ever reachable through /api/audio/[token],
 * which mints an HMAC-signed capability, so this table being readable to the
 * server does not make a master reachable by a client.
 *
 * Rows are fetched with `substring(bytes ...)` for range requests, so seeking
 * in the player does not pull a whole 5 MB master over the wire.
 */
export const audioBlobs = pgTable(
  "audio_blobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Clerk user id that rendered this audio; never client-supplied. */
    userId: text("user_id").notNull(),
    kind: text("kind", { enum: ["master", "preview"] }).notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audio_blobs_user_idx").on(t.userId)]
);

/** One rendered performance of a song. Every take stores a full master. */
export const takes = pgTable(
  "takes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    /** 1-based take number, unique within a song. */
    n: integer("n").notNull(),
    provider: text("provider").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    /**
     * Postgres audio rows — the current home for bytes.
     * Set null on delete so removing audio never orphans the take record.
     */
    masterAudioId: uuid("master_audio_id").references(() => audioBlobs.id, {
      onDelete: "set null",
    }),
    previewAudioId: uuid("preview_audio_id").references(() => audioBlobs.id, {
      onDelete: "set null",
    }),
    /**
     * LEGACY Blob pathnames. Kept so takes rendered before the move still
     * play while BLOB_READ_WRITE_TOKEN is present; new renders leave these
     * null. Once every row has an audio id these columns can be dropped.
     */
    masterPathname: text("master_pathname"),
    previewPathname: text("preview_pathname"),
    /** Quality this take was rendered at, decided server-side. */
    quality: text("quality", { enum: ["full", "preview"] }).notNull().default("preview"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("takes_song_n_unique").on(t.songId, t.n)]
);

/**
 * User-made playlists. The vault's primary surface: songs are browsed through
 * these rather than as one flat list.
 *
 * "Liked songs" and "All songs" are NOT rows here — they are derived at read
 * time from `songs.favorite` and the song list itself. Materialising them
 * would mean keeping them in sync on every favourite toggle and every render,
 * and they can never be renamed or deleted, so they aren't really playlists.
 */
export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playlists_user_updated_idx").on(t.userId, t.updatedAt)]
);

/**
 * Songs in a playlist, ordered by `position`.
 *
 * The (playlist_id, song_id) primary key makes adding the same song twice a
 * no-op rather than a duplicate row, and the cascade means deleting a playlist
 * never orphans membership. Deleting a SONG also clears its memberships, so a
 * playlist can't point at a song that no longer exists.
 */
export const playlistItems = pgTable(
  "playlist_items",
  {
    playlistId: uuid("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    /** Sort order within the playlist; gaps are fine. */
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.playlistId, t.songId] }),
    index("playlist_items_playlist_position_idx").on(t.playlistId, t.position),
  ]
);

/**
 * Purchased unlocks. Replaces the capped `unlockedSongIds` array — a user can
 * now hold unlimited unlocks, and the 201st no longer evicts the first.
 */
export const songUnlocks = pgTable(
  "song_unlocks",
  {
    userId: text("user_id").notNull(),
    songId: text("song_id").notNull(),
    /** The billing event that granted this unlock. */
    billingEventId: text("billing_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.songId] })]
);

/**
 * Applied billing events. The primary key IS the provider event id, so
 * webhook idempotency is enforced by the database rather than by a capped
 * array: an insert that conflicts means the event was already applied, and
 * entitlement is never granted twice.
 */
export const billingEvents = pgTable("billing_events", {
  /** Provider (Stripe) event id. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  songId: text("song_id"),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  /** Raw event kept for reconciliation and revenue reporting. */
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EntitlementRow = typeof entitlements.$inferSelect;
export type SongRow = typeof songs.$inferSelect;
export type TakeRow = typeof takes.$inferSelect;
export type ReservationRow = typeof renderReservations.$inferSelect;
export type PlaylistRow = typeof playlists.$inferSelect;
export type PlaylistItemRow = typeof playlistItems.$inferSelect;
