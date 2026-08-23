import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { audioBlobs } from "@/lib/db/schema";

/**
 * Rendered audio — stored in Neon Postgres.
 *
 * Audio bytes live in the `audio_blobs` table, so the whole product is one
 * database: one connection string, one backup, one place to look. Nothing is
 * ever handed over as a file URL. A token is an HMAC-signed capability
 * carrying the audio row id, owner, downloadability and expiry, which any
 * serverless instance can verify without shared state — the same
 * self-contained design the Blob backend used, and the reason playback
 * survives the instance that rendered it disappearing.
 *
 * Backends, in priority order:
 * - Postgres (whenever DATABASE_URL is set) — where all new audio goes.
 * - Blob (READ ONLY, legacy) — takes rendered before the move still resolve
 *   while BLOB_READ_WRITE_TOKEN is present. Nothing new is written there.
 * - In-memory — local dev and the test suite, with no database at all.
 */

export interface StoredAudio {
  bytes: Buffer;
  mimeType: string;
  /** Clerk userId that rendered this take. */
  ownerId: string;
  /** Whether this render may be downloaded (entitlement at render time). */
  downloadable: boolean;
  expiresAt: number;
}

export type ResolvedAudio =
  | { kind: "bytes"; bytes: Buffer; mimeType: string; ownerId: string; downloadable: boolean }
  | { kind: "pg"; audioId: string; ownerId: string; downloadable: boolean }
  /** Legacy Blob-backed audio, still readable while the token is present. */
  | { kind: "blob"; pathname: string; ownerId: string; downloadable: boolean };

export const AUDIO_TTL_MS = 60 * 60 * 1000;

// Pinned to globalThis: in dev, each route handler compiles as its own
// bundle with its own module instance — a plain module-level Map would leave
// the audio route unable to see what the music route stored.
const entries: Map<string, StoredAudio> = ((globalThis as Record<string, unknown>).__linerNotesAudioStore ??=
  new Map<string, StoredAudio>()) as Map<string, StoredAudio>;

/**
 * Signing key for playback tokens.
 *
 * Was BLOB_READ_WRITE_TOKEN, which no longer exists once audio is in
 * Postgres. DATABASE_URL is present in exactly the cases audio can be stored
 * at all, so it is the natural fallback and needs no new required variable —
 * but AUDIO_SIGNING_SECRET takes precedence for anyone who would rather the
 * two not be coupled. Rotating either invalidates live tokens, which is
 * harmless: they expire within the hour anyway.
 */
function signingSecret(): string {
  return (
    process.env.AUDIO_SIGNING_SECRET ||
    process.env.DATABASE_URL ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    ""
  );
}

function sweep(now: number): void {
  for (const [token, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(token);
  }
}

interface AudioTokenPayload {
  /** Postgres audio_blobs id. */
  a?: string;
  /** Legacy blob pathname. */
  p?: string;
  o: string; // ownerId
  d: boolean; // downloadable
  e: number; // expiresAt (ms epoch)
}

function hmac(data: string): string {
  return createHmac("sha256", signingSecret()).update(data).digest("base64url");
}

function encodeToken(payload: AudioTokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export interface StoredAudioRef {
  /** Token for /api/audio/[token]. */
  token: string;
  /** audio_blobs row id when Postgres stored the bytes; null in memory. */
  audioId: string | null;
}

/** Mints a signed playback token for an already-stored audio row. */
export function mintAudioToken(
  ref: { audioId: string; ownerId: string; downloadable: boolean },
  ttlMs = AUDIO_TTL_MS,
  now = Date.now()
): string {
  return encodeToken({ a: ref.audioId, o: ref.ownerId, d: ref.downloadable, e: now + ttlMs });
}

/** Mints a token for a LEGACY Blob-backed take (pathname, not a row id). */
export function mintBlobAudioToken(
  ref: { pathname: string; ownerId: string; downloadable: boolean },
  ttlMs = AUDIO_TTL_MS,
  now = Date.now()
): string {
  return encodeToken({ p: ref.pathname, o: ref.ownerId, d: ref.downloadable, e: now + ttlMs });
}

export async function storeAudio(
  audio: Omit<StoredAudio, "expiresAt">,
  now = Date.now()
): Promise<StoredAudioRef> {
  const db = getDb();

  if (db) {
    const [row] = await db
      .insert(audioBlobs)
      .values({
        userId: audio.ownerId,
        kind: audio.downloadable ? "master" : "preview",
        mimeType: audio.mimeType,
        sizeBytes: audio.bytes.length,
        bytes: audio.bytes,
      })
      .returning({ id: audioBlobs.id });
    if (!row) throw new Error("failed to store audio");
    return {
      token: mintAudioToken(
        { audioId: row.id, ownerId: audio.ownerId, downloadable: audio.downloadable },
        AUDIO_TTL_MS,
        now
      ),
      audioId: row.id,
    };
  }

  sweep(now);
  const token = `${randomUUID()}${randomUUID().slice(0, 8)}`;
  entries.set(token, { ...audio, expiresAt: now + AUDIO_TTL_MS });
  return { token, audioId: null };
}

/** Resolves a token from any backend; null when invalid or expired. */
export function resolveAudio(token: string, now = Date.now()): ResolvedAudio | null {
  // Signed tokens are "payload.signature"; memory tokens are plain UUIDs.
  const dot = token.indexOf(".");
  if (dot > 0) {
    const encoded = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    const expected = hmac(encoded);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as AudioTokenPayload;
      if (typeof payload.e !== "number" || payload.e <= now) return null;
      const ownerId = typeof payload.o === "string" ? payload.o : "";
      const downloadable = payload.d === true;
      if (typeof payload.a === "string") {
        return { kind: "pg", audioId: payload.a, ownerId, downloadable };
      }
      if (typeof payload.p === "string") {
        return { kind: "blob", pathname: payload.p, ownerId, downloadable };
      }
      return null;
    } catch {
      return null;
    }
  }

  sweep(now);
  const entry = entries.get(token);
  if (!entry) return null;
  return {
    kind: "bytes",
    bytes: entry.bytes,
    mimeType: entry.mimeType,
    ownerId: entry.ownerId,
    downloadable: entry.downloadable,
  };
}

export interface AudioMeta {
  mimeType: string;
  sizeBytes: number;
}

/** Size and type only — enough to answer a range request's headers. */
export async function readAudioMeta(audioId: string): Promise<AudioMeta | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ mimeType: audioBlobs.mimeType, sizeBytes: audioBlobs.sizeBytes })
    .from(audioBlobs)
    .where(eq(audioBlobs.id, audioId));
  return row ?? null;
}

/**
 * Reads audio bytes, optionally a byte range.
 *
 * A range is sliced in the DATABASE with `substring`, so scrubbing a track
 * transfers only the seconds asked for rather than pulling a whole 5 MB
 * master across the wire on every seek.
 */
export async function readAudioBytes(
  audioId: string,
  range?: { start: number; length: number }
): Promise<Buffer | null> {
  const db = getDb();
  if (!db) return null;
  // Postgres substring() is 1-indexed.
  const expr = range
    ? sql<Buffer>`substring(${audioBlobs.bytes} from ${range.start + 1} for ${range.length})`
    : sql<Buffer>`${audioBlobs.bytes}`;
  const [row] = await db.select({ bytes: expr }).from(audioBlobs).where(eq(audioBlobs.id, audioId));
  if (!row?.bytes) return null;
  return Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
}

/** Removes audio rows (song deletion). Missing ids are ignored. */
export async function deleteAudio(audioIds: string[]): Promise<void> {
  const db = getDb();
  if (!db || audioIds.length === 0) return;
  for (const id of audioIds) {
    await db.delete(audioBlobs).where(eq(audioBlobs.id, id));
  }
}

/** Test seam. */
export function clearAudioStoreForTesting(): void {
  entries.clear();
}
