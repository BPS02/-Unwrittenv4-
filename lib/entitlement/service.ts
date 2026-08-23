import { and, eq, gt } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { billingEvents, entitlements, renderReservations, songUnlocks } from "@/lib/db/schema";
import {
  applyBillingEvent,
  assessGeneration,
  masterAccessAllowed,
  normalizeMetadata,
  summarize,
} from "./logic";
import { addMonth, type BillingEvent, type EntitlementMetadata, type EntitlementSummary, type GenerationAssessment } from "./types";

/**
 * Server-side entitlement service — the ONLY place entitlement is decided.
 *
 * Storage is Neon Postgres. Identity still comes from Clerk `auth()` alone;
 * `userId` here is always a Clerk id resolved by the caller, never anything a
 * client supplied.
 *
 * The V2 race is closed by reserve/commit. A render:
 *   1. reserves what it is about to consume (atomic, row-locked)  — BEFORE the provider
 *   2. calls the music provider
 *   3. commits the reservation                                     — AFTER it succeeds
 * A failed render releases instead of committing, so it still costs nothing,
 * and a crashed render leaves a hold that simply expires.
 *
 * Pricing truth stays in ./logic.ts. This file only persists what those pure
 * functions decide.
 */

/** How long a hold survives a crashed render. Longer than the music route's maxDuration (300s). */
const RESERVATION_TTL_MS = 10 * 60 * 1000;

export interface ReserveResult {
  assessment: GenerationAssessment;
  meta: EntitlementMetadata;
  /** Present only when the assessment allowed the render. */
  reservationId: string | null;
}

/* ------------------------------------------------------------------ */
/* In-memory backend — used when DATABASE_URL is absent (dev + tests).  */
/* ------------------------------------------------------------------ */

interface MemoryReservation {
  id: string;
  userId: string;
  songId: string;
  kind: "free_take" | "pro_song" | "purchased_credit";
  status: "reserved" | "committed" | "released";
  claimsFreeSong: boolean;
  expiresAt: number;
}

interface MemoryState {
  rows: Map<string, EntitlementMetadata>;
  unlocks: Set<string>;
  events: Set<string>;
  reservations: Map<string, MemoryReservation>;
  seq: number;
}

// globalThis-pinned: Next dev gives each route its own module instance.
const memory: MemoryState = ((globalThis as Record<string, unknown>).__linerNotesEntitlements ??= {
  rows: new Map(),
  unlocks: new Set(),
  events: new Set(),
  reservations: new Map(),
  seq: 0,
} satisfies MemoryState) as MemoryState;

const unlockKey = (userId: string, songId: string) => `${userId}::${songId}`;

/** Test seam — clears all in-memory entitlement state. */
export function resetEntitlementsForTesting(): void {
  memory.rows.clear();
  memory.unlocks.clear();
  memory.events.clear();
  memory.reservations.clear();
  memory.seq = 0;
}

/** Test seam — seeds a user's committed entitlement state directly. */
export function seedEntitlementForTesting(userId: string, meta: Partial<EntitlementMetadata>): void {
  memory.rows.set(userId, normalizeMetadata({ ...memory.rows.get(userId), ...meta }));
  for (const songId of meta.unlockedSongIds ?? []) memory.unlocks.add(unlockKey(userId, songId));
}

function memoryCommitted(userId: string, songId: string | null, now: Date): EntitlementMetadata {
  const stored = memory.rows.get(userId);
  const base = normalizeMetadata(stored ?? {}, now);
  return {
    ...base,
    unlockedSongIds: songId && memory.unlocks.has(unlockKey(userId, songId)) ? [songId] : [],
    processedEventIds: [],
  };
}

function memoryActive(userId: string, now: Date): MemoryReservation[] {
  return [...memory.reservations.values()].filter(
    (r) => r.userId === userId && r.status === "reserved" && r.expiresAt > now.getTime()
  );
}

/* ------------------------------------------------------------------ */
/* Shared: fold in-flight holds into the committed view.               */
/* ------------------------------------------------------------------ */

/**
 * Effective entitlement = committed counters + every unexpired hold. This is
 * what the gate is evaluated against, so two concurrent renders can never
 * both pass on the last remaining take.
 */
function withHolds(
  committed: EntitlementMetadata,
  holds: Array<{ kind: string; claimsFreeSong: boolean; songId: string }>
): EntitlementMetadata {
  if (holds.length === 0) return committed;
  const claiming = holds.find((h) => h.claimsFreeSong);
  return {
    ...committed,
    freeSongUsed: committed.freeSongUsed || Boolean(claiming),
    freeSongId: committed.freeSongId ?? claiming?.songId ?? null,
    freeTakesUsed: committed.freeTakesUsed + holds.filter((h) => h.kind === "free_take").length,
    songsRemaining: Math.max(0, committed.songsRemaining - holds.filter((h) => h.kind === "pro_song").length),
    purchasedCredits: Math.max(
      0,
      committed.purchasedCredits - holds.filter((h) => h.kind === "purchased_credit").length
    ),
  };
}

function kindOf(assessment: Extract<GenerationAssessment, { allowed: true }>): "free_take" | "pro_song" | "purchased_credit" {
  if (assessment.consumesFreeTake) return "free_take";
  if (assessment.consumesProSong) return "pro_song";
  return "purchased_credit";
}

/* ------------------------------------------------------------------ */
/* Postgres helpers                                                     */
/* ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Loads (creating if absent) the entitlement row, locked FOR UPDATE. */
async function lockRow(tx: Tx, userId: string, now: Date) {
  await tx
    .insert(entitlements)
    .values({ userId, tier: "free", periodEnd: addMonth(now) })
    .onConflictDoNothing();
  const [row] = await tx.select().from(entitlements).where(eq(entitlements.userId, userId)).for("update");
  if (!row) throw new Error(`entitlement row missing for ${userId} after upsert`);
  return row;
}

/** Re-reads the committed row after a write inside the same transaction. */
async function readRow(tx: Tx, userId: string) {
  const [row] = await tx.select().from(entitlements).where(eq(entitlements.userId, userId));
  if (!row) throw new Error(`entitlement row missing for ${userId}`);
  return row;
}

/** Applies the Pro period rollover durably, inside the caller's transaction. */
async function refreshPeriod(tx: Tx, userId: string, meta: EntitlementMetadata, stored: Date): Promise<EntitlementMetadata> {
  // normalizeMetadata already computed the rollover; persist it when it moved.
  if (meta.periodEnd === stored.toISOString()) return meta;
  await tx
    .update(entitlements)
    .set({ songsRemaining: meta.songsRemaining, periodEnd: new Date(meta.periodEnd), updatedAt: new Date() })
    .where(eq(entitlements.userId, userId));
  return meta;
}

function rowToMeta(
  row: typeof entitlements.$inferSelect,
  unlockedSongIds: string[],
  now: Date
): EntitlementMetadata {
  return normalizeMetadata(
    {
      tier: row.tier,
      freeSongUsed: row.freeSongUsed,
      freeSongId: row.freeSongId,
      freeTakesUsed: row.freeTakesUsed,
      songsRemaining: row.songsRemaining,
      purchasedCredits: row.purchasedCredits,
      periodEnd: row.periodEnd.toISOString(),
      unlockedSongIds,
      processedEventIds: [],
    },
    now
  );
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Committed entitlement for a user. `songId` scopes the unlock lookup — V2
 * carried every unlocked id in a capped array; here an unlock is a row, so
 * only the song being asked about is loaded and there is no cap.
 */
export async function getEntitlement(
  userId: string,
  now = new Date(),
  songId: string | null = null
): Promise<EntitlementMetadata> {
  const db = getDb();
  if (!db) return memoryCommitted(userId, songId, now);

  const [row] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
  if (!row) return normalizeMetadata({}, now);
  const unlocked = songId
    ? await db
        .select()
        .from(songUnlocks)
        .where(and(eq(songUnlocks.userId, userId), eq(songUnlocks.songId, songId)))
    : [];
  return rowToMeta(row, unlocked.length > 0 && songId ? [songId] : [], now);
}

/**
 * Read-only gate check — mutates nothing and reserves nothing. Use for UI and
 * summaries. A render must use reserveMusicGeneration instead, or two
 * concurrent renders can both pass this check.
 */
export async function assessMusicGeneration(
  userId: string,
  songId: string,
  now = new Date()
): Promise<{ assessment: GenerationAssessment; meta: EntitlementMetadata }> {
  const meta = await getEntitlement(userId, now, songId);
  return { assessment: assessGeneration(meta, songId), meta };
}

/**
 * Atomically checks the gate and places a hold. Call this BEFORE the music
 * provider. On success pass the reservationId to recordMusicGeneration after
 * the provider returns audio, or to releaseMusicGeneration if it fails.
 */
export async function reserveMusicGeneration(
  userId: string,
  songId: string,
  now = new Date()
): Promise<ReserveResult> {
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);
  const db = getDb();

  if (!db) {
    const committed = memoryCommitted(userId, songId, now);
    const effective = withHolds(committed, memoryActive(userId, now));
    const assessment = assessGeneration(effective, songId);
    if (!assessment.allowed) return { assessment, meta: committed, reservationId: null };
    const id = `mem-${++memory.seq}`;
    memory.reservations.set(id, {
      id,
      userId,
      songId,
      kind: kindOf(assessment),
      status: "reserved",
      claimsFreeSong: assessment.claimsFreeSong,
      expiresAt: expiresAt.getTime(),
    });
    return { assessment, meta: committed, reservationId: id };
  }

  return db.transaction(async (tx) => {
    const row = await lockRow(tx, userId, now);
    const unlocked = await tx
      .select()
      .from(songUnlocks)
      .where(and(eq(songUnlocks.userId, userId), eq(songUnlocks.songId, songId)));
    let committed = rowToMeta(row, unlocked.length > 0 ? [songId] : [], now);
    committed = await refreshPeriod(tx, userId, committed, row.periodEnd);

    const holds = await tx
      .select()
      .from(renderReservations)
      .where(
        and(
          eq(renderReservations.userId, userId),
          eq(renderReservations.status, "reserved"),
          gt(renderReservations.expiresAt, now)
        )
      );

    const assessment = assessGeneration(withHolds(committed, holds), songId);
    if (!assessment.allowed) return { assessment, meta: committed, reservationId: null };

    const [hold] = await tx
      .insert(renderReservations)
      .values({
        userId,
        songId,
        kind: kindOf(assessment),
        claimsFreeSong: assessment.claimsFreeSong,
        expiresAt,
      })
      .returning({ id: renderReservations.id });
    if (!hold) throw new Error("failed to place render reservation");

    return { assessment, meta: committed, reservationId: hold.id };
  });
}

/**
 * Commits a hold after the provider returned audio. Idempotent: committing an
 * already-committed reservation is a no-op, so a retried request cannot spend
 * the same take twice.
 */
export async function recordMusicGeneration(
  userId: string,
  songId: string,
  reservationId: string,
  now = new Date()
): Promise<EntitlementMetadata> {
  const db = getDb();

  if (!db) {
    const hold = memory.reservations.get(reservationId);
    if (hold && hold.status === "reserved") {
      hold.status = "committed";
      const current = normalizeMetadata(memory.rows.get(userId) ?? {}, now);
      const next: EntitlementMetadata = { ...current };
      if (hold.claimsFreeSong) {
        next.freeSongUsed = true;
        next.freeSongId = songId;
      }
      if (hold.kind === "free_take") next.freeTakesUsed = current.freeTakesUsed + 1;
      if (hold.kind === "pro_song") next.songsRemaining = Math.max(0, current.songsRemaining - 1);
      if (hold.kind === "purchased_credit") {
        next.purchasedCredits = Math.max(0, current.purchasedCredits - 1);
      }
      memory.rows.set(userId, next);
    }
    return memoryCommitted(userId, songId, now);
  }

  return db.transaction(async (tx) => {
    const [hold] = await tx
      .select()
      .from(renderReservations)
      .where(eq(renderReservations.id, reservationId))
      .for("update");
    const row = await lockRow(tx, userId, now);

    if (!hold || hold.status !== "reserved" || hold.userId !== userId) {
      return rowToMeta(row, [], now);
    }

    // The pricing decision was made by logic.ts at reserve time and recorded
    // on the hold; committing only applies it.
    const patch: Partial<typeof entitlements.$inferInsert> = { updatedAt: new Date() };
    if (hold.claimsFreeSong) {
      patch.freeSongUsed = true;
      patch.freeSongId = songId;
    }
    if (hold.kind === "free_take") patch.freeTakesUsed = row.freeTakesUsed + 1;
    if (hold.kind === "pro_song") patch.songsRemaining = Math.max(0, row.songsRemaining - 1);
    if (hold.kind === "purchased_credit") {
      patch.purchasedCredits = Math.max(0, row.purchasedCredits - 1);
    }

    await tx.update(entitlements).set(patch).where(eq(entitlements.userId, userId));
    await tx
      .update(renderReservations)
      .set({ status: "committed" })
      .where(eq(renderReservations.id, reservationId));

    return rowToMeta(await readRow(tx, userId), [], now);
  });
}

/** Releases a hold after a failed render, so it costs the user nothing. */
export async function releaseMusicGeneration(reservationId: string): Promise<void> {
  const db = getDb();
  if (!db) {
    const hold = memory.reservations.get(reservationId);
    if (hold && hold.status === "reserved") hold.status = "released";
    return;
  }
  await db
    .update(renderReservations)
    .set({ status: "released" })
    .where(and(eq(renderReservations.id, reservationId), eq(renderReservations.status, "reserved")));
}

/** Whether this song's full master (and download) may be served to its owner. */
export async function masterAccessAllowedFor(
  userId: string,
  songId: string,
  now = new Date()
): Promise<boolean> {
  return masterAccessAllowed(await getEntitlement(userId, now, songId), songId);
}

/**
 * Applies a billing event idempotently. Idempotency is enforced by the
 * billing_events primary key: an insert that conflicts means the event was
 * already applied, so entitlement is never granted twice.
 */
export async function applyBillingEventForUser(
  userId: string,
  event: BillingEvent,
  now = new Date()
): Promise<{ applied: boolean; meta: EntitlementMetadata }> {
  const db = getDb();

  if (!db) {
    if (memory.events.has(event.id)) {
      return { applied: false, meta: memoryCommitted(userId, event.songId ?? null, now) };
    }
    memory.events.add(event.id);
    const current = memoryCommitted(userId, event.songId ?? null, now);
    const result = applyBillingEvent({ ...current, processedEventIds: [] }, event, now);
    if (!result.applied) return { applied: false, meta: current };
    memory.rows.set(userId, result.meta);
    if (event.type === "song_pass_purchased" && event.songId) {
      memory.unlocks.add(unlockKey(userId, event.songId));
    }
    return { applied: true, meta: memoryCommitted(userId, event.songId ?? null, now) };
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(billingEvents)
      .values({
        id: event.id,
        userId,
        type: event.type,
        songId: event.songId ?? null,
        periodEnd: event.periodEnd ? new Date(event.periodEnd) : null,
      })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });

    const row = await lockRow(tx, userId, now);
    const current = rowToMeta(row, [], now);

    // No row returned → this event id was already applied. Never grant twice.
    if (inserted.length === 0) return { applied: false, meta: current };

    const result = applyBillingEvent({ ...current, processedEventIds: [] }, event, now);
    if (!result.applied) return { applied: false, meta: current };

    if (event.type === "song_pass_purchased" && event.songId) {
      await tx
        .insert(songUnlocks)
        .values({ userId, songId: event.songId, billingEventId: event.id })
        .onConflictDoNothing();
    }
    await tx
      .update(entitlements)
      .set({
        tier: result.meta.tier,
        songsRemaining: result.meta.songsRemaining,
        purchasedCredits: result.meta.purchasedCredits,
        periodEnd: new Date(result.meta.periodEnd),
        updatedAt: new Date(),
      })
      .where(eq(entitlements.userId, userId));

    const updated = await readRow(tx, userId);
    return { applied: true, meta: rowToMeta(updated, event.songId ? [event.songId] : [], now) };
  });
}

/** Client-safe summary — the only entitlement shape a response may carry. */
export async function getEntitlementSummary(
  userId: string,
  now = new Date()
): Promise<EntitlementSummary> {
  return summarize(await getEntitlement(userId, now));
}
