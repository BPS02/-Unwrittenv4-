import {
  addMonth,
  defaultMetadata,
  FREE_SONG_TAKES,
  MAX_TRACKED_EVENTS,
  MAX_TRACKED_UNLOCKS,
  PRO_SONGS_PER_PERIOD,
  SONG_PASS_EXTRA_RENDERS,
  CREDIT_PACK_RENDERS,
  type BillingEvent,
  type EntitlementMetadata,
  type EntitlementSummary,
  type GenerationAssessment,
} from "./types";

/**
 * Pure entitlement decisions — the single place pricing rules are computed.
 * Routes call this through lib/entitlement/service.ts; nothing client-side
 * ever computes or supplies entitlement.
 *
 * Model recap:
 * - Free: 1 song ever per Clerk user (lifetime, server-enforced), rendered
 *   up to FREE_SONG_TAKES times so they can compare performances. Every
 *   take stores a full master but only its 15-second preview is served.
 * - Song Pass ($9.99): permanently unlocks a song and adds two more renders,
 *   giving the usual free-first-song journey up to three total takes.
 * - Pro ($19/mo): 20 full-quality render credits per billing period.
 * - Credit pack ($7.99): 10 additional render credits that do not expire.
 */

/** Coerces unknown/partial metadata (fresh users, older shapes) to a full one. */
export function normalizeMetadata(raw: unknown, now: Date = new Date()): EntitlementMetadata {
  const base = defaultMetadata(now);
  if (!raw || typeof raw !== "object") return base;
  const m = raw as Partial<Record<keyof EntitlementMetadata, unknown>>;
  const meta: EntitlementMetadata = {
    tier: m.tier === "pro" ? "pro" : "free",
    freeSongUsed: m.freeSongUsed === true,
    freeSongId: typeof m.freeSongId === "string" ? m.freeSongId : null,
    freeTakesUsed:
      typeof m.freeTakesUsed === "number" && m.freeTakesUsed >= 0
        ? Math.floor(m.freeTakesUsed)
        : m.freeSongUsed === true
          ? 1 // migrate pre-takes records: the song was rendered once.
          : 0,
    songsRemaining:
      typeof m.songsRemaining === "number" && m.songsRemaining >= 0
        ? Math.floor(m.songsRemaining)
        : 0,
    purchasedCredits:
      typeof m.purchasedCredits === "number" && m.purchasedCredits >= 0
        ? Math.floor(m.purchasedCredits)
        : 0,
    periodEnd:
      typeof m.periodEnd === "string" && !Number.isNaN(Date.parse(m.periodEnd))
        ? m.periodEnd
        : base.periodEnd,
    unlockedSongIds: Array.isArray(m.unlockedSongIds)
      ? m.unlockedSongIds.filter((id): id is string => typeof id === "string").slice(-MAX_TRACKED_UNLOCKS)
      : [],
    processedEventIds: Array.isArray(m.processedEventIds)
      ? m.processedEventIds.filter((id): id is string => typeof id === "string").slice(-MAX_TRACKED_EVENTS)
      : [],
  };
  return applyPeriodRollover(meta, now);
}

/** When a Pro period lapses, refill the allowance (no rollover, no stacking). */
function applyPeriodRollover(meta: EntitlementMetadata, now: Date): EntitlementMetadata {
  if (meta.tier !== "pro") return meta;
  if (Date.parse(meta.periodEnd) > now.getTime()) return meta;
  return {
    ...meta,
    songsRemaining: PRO_SONGS_PER_PERIOD,
    periodEnd: addMonth(now).toISOString(),
  };
}

export function isUnlocked(meta: EntitlementMetadata, songId: string): boolean {
  return meta.unlockedSongIds.includes(songId);
}

/**
 * The core generation gate. Does not mutate — call recordGeneration after
 * the provider confirms a successful render.
 */
export function assessGeneration(meta: EntitlementMetadata, songId: string): GenerationAssessment {
  // Monthly and purchased render credits use the same durable counter. An
  // unlocked song owns its existing masters; it does not grant free rerenders.
  if (meta.tier === "pro" && meta.songsRemaining > 0) {
    return {
      allowed: true,
      quality: "full",
      consumesProSong: true,
      claimsFreeSong: false,
      consumesFreeTake: false,
      consumesPurchasedCredit: false,
    };
  }
  if (meta.purchasedCredits > 0) {
    return {
      allowed: true,
      quality: "full",
      consumesProSong: false,
      claimsFreeSong: false,
      consumesFreeTake: false,
      consumesPurchasedCredit: true,
    };
  }
  // Lifetime free song — preview quality, up to FREE_SONG_TAKES performances
  // of that ONE song so the listener can pick a favourite.
  if (!meta.freeSongUsed) {
    return {
      allowed: true,
      quality: "preview",
      consumesProSong: false,
      claimsFreeSong: true,
      consumesFreeTake: true,
      consumesPurchasedCredit: false,
    };
  }
  if (meta.freeSongId === songId && meta.freeTakesUsed < FREE_SONG_TAKES) {
    return {
      allowed: true,
      quality: "preview",
      consumesProSong: false,
      claimsFreeSong: false,
      consumesFreeTake: true,
      consumesPurchasedCredit: false,
    };
  }
  // Free render and paid credits exhausted → offer a Song Pass, pack, or Pro.
  return { allowed: false, reason: "payment_required" };
}

/** Preview takes still available on the free song. */
export function freeTakesRemaining(meta: EntitlementMetadata): number {
  if (meta.tier === "pro") return 0;
  return Math.max(0, FREE_SONG_TAKES - meta.freeTakesUsed);
}

/** Whether this song's full master (and download) may be served to the owner. */
export function masterAccessAllowed(meta: EntitlementMetadata, songId: string): boolean {
  return isUnlocked(meta, songId);
}

/**
 * Records a confirmed successful render. Only call after the music provider
 * returned audio — a failed render must never consume anything.
 */
export function recordGeneration(
  meta: EntitlementMetadata,
  songId: string,
  now: Date = new Date()
): EntitlementMetadata {
  const assessment = assessGeneration(meta, songId);
  if (!assessment.allowed) {
    throw new Error("recordGeneration called for a generation that was not allowed");
  }
  const next: EntitlementMetadata = { ...meta };
  if (assessment.claimsFreeSong) {
    next.freeSongUsed = true;
    next.freeSongId = songId;
  }
  if (assessment.consumesFreeTake) {
    next.freeTakesUsed = meta.freeTakesUsed + 1;
  }
  if (assessment.consumesProSong) {
    next.songsRemaining = Math.max(0, meta.songsRemaining - 1);
  }
  if (assessment.consumesPurchasedCredit) {
    next.purchasedCredits = Math.max(0, meta.purchasedCredits - 1);
  }
  return applyPeriodRollover(next, now);
}

/** The only shape that may cross to the client. */
export function summarize(meta: EntitlementMetadata): EntitlementSummary {
  return {
    tier: meta.tier,
    songsRemaining: meta.tier === "pro" ? meta.songsRemaining : 0,
    purchasedCredits: meta.purchasedCredits,
    freeSongAvailable: !meta.freeSongUsed,
    freeTakesRemaining: freeTakesRemaining(meta),
    periodEnd: meta.tier === "pro" ? meta.periodEnd : null,
  };
}

/**
 * Applies a billing event idempotently. Returns the (possibly unchanged)
 * metadata and whether the event was newly applied. A duplicate event id is
 * a no-op — entitlement is never granted twice.
 */
export function applyBillingEvent(
  meta: EntitlementMetadata,
  event: BillingEvent,
  now: Date = new Date()
): { meta: EntitlementMetadata; applied: boolean } {
  if (meta.processedEventIds.includes(event.id)) {
    return { meta, applied: false };
  }
  const next: EntitlementMetadata = {
    ...meta,
    processedEventIds: [...meta.processedEventIds, event.id].slice(-MAX_TRACKED_EVENTS),
  };
  switch (event.type) {
    case "song_pass_purchased": {
      if (!event.songId) return { meta, applied: false };
      if (!next.unlockedSongIds.includes(event.songId)) {
        next.unlockedSongIds = [...next.unlockedSongIds, event.songId].slice(-MAX_TRACKED_UNLOCKS);
      }
      next.purchasedCredits += SONG_PASS_EXTRA_RENDERS;
      break;
    }
    case "credit_pack_purchased": {
      next.purchasedCredits += CREDIT_PACK_RENDERS;
      break;
    }
    case "subscription_started":
    case "subscription_renewed":
      next.tier = "pro";
      next.songsRemaining = PRO_SONGS_PER_PERIOD;
      next.periodEnd =
        event.periodEnd && !Number.isNaN(Date.parse(event.periodEnd))
          ? event.periodEnd
          : addMonth(now).toISOString();
      break;
    case "subscription_canceled":
      next.tier = "free";
      next.songsRemaining = 0;
      break;
  }
  return { meta: next, applied: true };
}
