/**
 * Entitlement domain types — pricing model:
 *
 * - Free: 1 song total per account (lifetime). Preview quality only
 *   (PREVIEW_SECONDS-long preview; the full master is stored but never served).
 * - Song Pass: $9.99 one-time for up to three takes and permanent download.
 * - Pro: $19/month, 20 render credits per billing period, full quality.
 *   No rollover; the counter resets on the billing date.
 *
 * Storage (interim, until a database): the "entitlements table" lives in
 * Clerk `privateMetadata` (user_id is the record key), written only from
 * server code via the Clerk backend SDK. Clients only ever see
 * `EntitlementSummary`. The "songs table" is lib/songs-store.ts.
 */

export type Tier = "free" | "pro";

/** Shape persisted in Clerk privateMetadata. */
export interface EntitlementMetadata {
  tier: Tier;
  /** Administrative grant: unlimited full-quality generations with no credit consumption. */
  unlimited: boolean;
  /** Lifetime free song: has it been generated, and which songId claimed it. */
  freeSongUsed: boolean;
  freeSongId: string | null;
  /** Preview takes rendered of the free song (max FREE_SONG_TAKES). */
  freeTakesUsed: number;
  /** Pro: generations left this billing period. Meaningless for free. */
  songsRemaining: number;
  /** One-time purchased render credits; never expire. */
  purchasedCredits: number;
  /** ISO date the Pro period ends (billing date); counter resets then. */
  periodEnd: string;
  /** SongIds permanently unlocked by a Song Pass. */
  unlockedSongIds: string[];
  /** Billing event ids already applied — webhook idempotency (capped). */
  processedEventIds: string[];
}

export const PRO_SONGS_PER_PERIOD = 20;
/** Free users may render this many 15s preview takes of their one song. */
export const FREE_SONG_TAKES = 1;
export const SONG_PASS_PRICE_USD = 9.99;
export const SONG_PASS_EXTRA_RENDERS = 2;
export const CREDIT_PACK_PRICE_USD = 7.99;
export const CREDIT_PACK_RENDERS = 10;
export const PRO_PRICE_USD = 19;
/** Provider cost per generation, logged to Langfuse for margin queries. */
export const GENERATION_COST_USD = 0.27;
export const MAX_TRACKED_UNLOCKS = 200;
export const MAX_TRACKED_EVENTS = 20;

export function defaultMetadata(now: Date = new Date()): EntitlementMetadata {
  return {
    tier: "free",
    unlimited: false,
    freeSongUsed: false,
    freeSongId: null,
    freeTakesUsed: 0,
    songsRemaining: 0,
    purchasedCredits: 0,
    periodEnd: addMonth(now).toISOString(),
    unlockedSongIds: [],
    processedEventIds: [],
  };
}

export function addMonth(from: Date): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** The only entitlement shape a client is ever allowed to see. */
export interface EntitlementSummary {
  tier: Tier;
  unlimited: boolean;
  /** Pro generations left this period (0 for free). */
  songsRemaining: number;
  purchasedCredits: number;
  /** Whether the account can still generate its lifetime free song. */
  freeSongAvailable: boolean;
  /** Preview takes still available on the free song. */
  freeTakesRemaining: number;
  /** ISO period end for Pro. */
  periodEnd: string | null;
}

export type RefusalReason = "signin_required" | "payment_required";

/** Render quality decided server-side for a generation. */
export type RenderQuality = "full" | "preview";

export type GenerationAssessment =
  | {
      allowed: true;
      quality: RenderQuality;
      /** True when this generation consumes one of the Pro period's songs. */
      consumesProSong: boolean;
      /** True when this generation claims the lifetime free song. */
      claimsFreeSong: boolean;
      /** True when this generation spends one of the free song's takes. */
      consumesFreeTake: boolean;
      /** True when this generation spends a non-expiring purchased credit. */
      consumesPurchasedCredit: boolean;
    }
  | { allowed: false; reason: RefusalReason };

/** Vendor-neutral billing events the entitlement service understands. */
export type BillingEventType =
  | "song_pass_purchased"
  | "credit_pack_purchased"
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_canceled";

export interface BillingEvent {
  /** Provider event id — used for idempotency. */
  id: string;
  type: BillingEventType;
  userId: string;
  /** The song covered by a Song Pass purchase. */
  songId?: string;
  /** Period end reported by the billing provider (subscription events). */
  periodEnd?: string;
}
