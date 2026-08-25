import { describe, expect, it } from "vitest";
import {
  applyBillingEvent,
  assessGeneration,
  freeTakesRemaining,
  isUnlocked,
  masterAccessAllowed,
  normalizeMetadata,
  recordGeneration,
  summarize,
} from "@/lib/entitlement/logic";
import {
  defaultMetadata,
  FREE_SONG_TAKES,
  PRO_SONGS_PER_PERIOD,
  type EntitlementMetadata,
} from "@/lib/entitlement/types";

const NOW = new Date("2026-08-13T12:00:00Z");

function fresh(): EntitlementMetadata {
  return defaultMetadata(NOW);
}

describe("unlimited administrative grant", () => {
  it("allows full-quality generations and master access without consuming credits", () => {
    const meta = { ...fresh(), unlimited: true };
    const assessment = assessGeneration(meta, "song-any");

    expect(assessment).toEqual({
      allowed: true,
      quality: "full",
      consumesProSong: false,
      claimsFreeSong: false,
      consumesFreeTake: false,
      consumesPurchasedCredit: false,
    });
    expect(recordGeneration(meta, "song-any", NOW)).toEqual(meta);
    expect(masterAccessAllowed(meta, "song-any")).toBe(true);
  });
});

describe("lifetime free song", () => {
  it("a fresh account may generate exactly one song, preview quality", () => {
    expect(assessGeneration(fresh(), "song-a")).toEqual({
      allowed: true,
      quality: "preview",
      consumesProSong: false,
      claimsFreeSong: true,
      consumesFreeTake: true,
      consumesPurchasedCredit: false,
    });
  });

  it("recording the free song marks it used forever", () => {
    const meta = recordGeneration(fresh(), "song-a", NOW);
    expect(meta.freeSongUsed).toBe(true);
    expect(meta.freeSongId).toBe("song-a");
    expect(meta.freeTakesUsed).toBe(1);
    // A different song is never free.
    expect(assessGeneration(meta, "song-b")).toEqual({ allowed: false, reason: "payment_required" });
  });

  it("allows FREE_SONG_TAKES preview takes of that one song, then paywalls", () => {
    let meta = fresh();
    for (let i = 0; i < FREE_SONG_TAKES; i++) {
      const assessment = assessGeneration(meta, "song-a");
      expect(assessment.allowed).toBe(true);
      if (assessment.allowed) expect(assessment.quality).toBe("preview");
      meta = recordGeneration(meta, "song-a", NOW);
    }
    expect(meta.freeTakesUsed).toBe(FREE_SONG_TAKES);
    expect(freeTakesRemaining(meta)).toBe(0);
    expect(assessGeneration(meta, "song-a")).toEqual({ allowed: false, reason: "payment_required" });
  });

  it("takes remaining counts down as the listener compares performances", () => {
    let meta = fresh();
    expect(freeTakesRemaining(meta)).toBe(1);
    meta = recordGeneration(meta, "song-a", NOW);
    expect(freeTakesRemaining(meta)).toBe(0);
  });

  it("migrates pre-takes records so old free users are not given extra takes", () => {
    const legacy = normalizeMetadata(
      { tier: "free", freeSongUsed: true, freeSongId: "song-a" },
      NOW
    );
    expect(legacy.freeTakesUsed).toBe(1);
    expect(freeTakesRemaining(legacy)).toBe(0);
  });

  it("free renders never grant master access", () => {
    const meta = recordGeneration(fresh(), "song-a", NOW);
    expect(masterAccessAllowed(meta, "song-a")).toBe(false);
  });
});

describe("$9.99 Song Pass", () => {
  it("an unlock event entitles that song at full quality, idempotently", () => {
    let meta = { ...recordGeneration(fresh(), "song-a", NOW), freeTakesUsed: FREE_SONG_TAKES };
    const first = applyBillingEvent(meta, { id: "evt_1", type: "song_pass_purchased", userId: "u", songId: "song-a" }, NOW);
    expect(first.applied).toBe(true);
    meta = first.meta;
    expect(isUnlocked(meta, "song-a")).toBe(true);
    expect(masterAccessAllowed(meta, "song-a")).toBe(true);
    expect(assessGeneration(meta, "song-a")).toEqual({
      allowed: true,
      quality: "full",
      consumesProSong: false,
      claimsFreeSong: false,
      consumesFreeTake: false,
      consumesPurchasedCredit: true,
    });
    // Other songs stay locked.
    expect(masterAccessAllowed(meta, "song-b")).toBe(false);

    const replay = applyBillingEvent(meta, { id: "evt_1", type: "song_pass_purchased", userId: "u", songId: "song-a" }, NOW);
    expect(replay.applied).toBe(false);
  });

  it("an unlock without a songId is not applied", () => {
    const result = applyBillingEvent(fresh(), { id: "evt_x", type: "song_pass_purchased", userId: "u" }, NOW);
    expect(result.applied).toBe(false);
  });
});

describe("Pro subscription", () => {
  function proUser(): EntitlementMetadata {
    return applyBillingEvent(
      { ...fresh(), freeSongUsed: true, freeSongId: "song-free" },
      { id: "evt_sub", type: "subscription_started", userId: "u" },
      NOW
    ).meta;
  }

  it("grants 20 full-quality renders per period", () => {
    const meta = proUser();
    expect(meta.tier).toBe("pro");
    expect(meta.songsRemaining).toBe(PRO_SONGS_PER_PERIOD);
    expect(assessGeneration(meta, "song-b")).toEqual({
      allowed: true,
      quality: "full",
      consumesProSong: true,
      claimsFreeSong: false,
      consumesFreeTake: false,
      consumesPurchasedCredit: false,
    });
  });

  it("each generation decrements; at 0 the paywall returns", () => {
    let meta = { ...proUser(), songsRemaining: 1 };
    meta = recordGeneration(meta, "song-b", NOW);
    expect(meta.songsRemaining).toBe(0);
    expect(assessGeneration(meta, "song-c")).toEqual({ allowed: false, reason: "payment_required" });
  });

  it("Pro does not unlock unrelated previews", () => {
    expect(masterAccessAllowed(proUser(), "any-song")).toBe(false);
  });

  it("the allowance resets when the period lapses — no rollover, no stacking", () => {
    const stale = {
      ...proUser(),
      songsRemaining: 3,
      periodEnd: new Date("2026-08-01T00:00:00Z").toISOString(),
    };
    const meta = normalizeMetadata(stale, NOW);
    expect(meta.songsRemaining).toBe(PRO_SONGS_PER_PERIOD);
    expect(Date.parse(meta.periodEnd)).toBeGreaterThan(NOW.getTime());
  });

  it("renewal refreshes the allowance and period end from the provider", () => {
    const renewed = applyBillingEvent(
      { ...proUser(), songsRemaining: 0 },
      {
        id: "evt_renew",
        type: "subscription_renewed",
        userId: "u",
        periodEnd: "2026-09-13T12:00:00.000Z",
      },
      NOW
    ).meta;
    expect(renewed.songsRemaining).toBe(PRO_SONGS_PER_PERIOD);
    expect(renewed.periodEnd).toBe("2026-09-13T12:00:00.000Z");
  });

  it("cancellation returns to free with no allowance but keeps unlocks", () => {
    let meta = applyBillingEvent(
      proUser(),
      { id: "evt_u", type: "song_pass_purchased", userId: "u", songId: "song-x" },
      NOW
    ).meta;
    meta = applyBillingEvent(meta, { id: "evt_c", type: "subscription_canceled", userId: "u" }, NOW).meta;
    expect(meta.tier).toBe("free");
    expect(meta.songsRemaining).toBe(0);
    expect(masterAccessAllowed(meta, "song-x")).toBe(true);
    expect(masterAccessAllowed(meta, "song-free")).toBe(false);
  });
});

describe("non-expiring credit packs", () => {
  it("adds ten credits and spends one per full-quality render", () => {
    let meta = applyBillingEvent(
      { ...fresh(), freeSongUsed: true, freeSongId: "old" },
      { id: "evt_pack", type: "credit_pack_purchased", userId: "u" },
      NOW
    ).meta;
    expect(meta.purchasedCredits).toBe(10);
    const assessment = assessGeneration(meta, "new-song");
    expect(assessment.allowed && assessment.consumesPurchasedCredit).toBe(true);
    meta = recordGeneration(meta, "new-song", NOW);
    expect(meta.purchasedCredits).toBe(9);
  });

  it("survives subscription renewal and cancellation", () => {
    let meta = { ...fresh(), purchasedCredits: 7 };
    meta = applyBillingEvent(meta, { id: "sub", type: "subscription_started", userId: "u" }, NOW).meta;
    meta = applyBillingEvent(meta, { id: "cancel", type: "subscription_canceled", userId: "u" }, NOW).meta;
    expect(meta.purchasedCredits).toBe(7);
  });
});

describe("client-safe summary", () => {
  it("exposes only the derived shape — never raw metadata fields", () => {
    const summary = summarize(fresh());
    expect(Object.keys(summary).sort()).toEqual([
      "freeSongAvailable",
      "freeTakesRemaining",
      "periodEnd",
      "purchasedCredits",
      "songsRemaining",
      "tier",
      "unlimited",
    ]);
    expect(summary.tier).toBe("free");
    expect(summary.songsRemaining).toBe(0);
    expect(summary.purchasedCredits).toBe(0);
    expect(summary.freeSongAvailable).toBe(true);
    expect(summary.periodEnd).toBeNull();
  });
});

describe("recording", () => {
  it("throws if asked to record a generation that was not allowed", () => {
    const meta = recordGeneration(fresh(), "song-a", NOW);
    // A different song is never free, even with takes left on the free song.
    expect(() => recordGeneration(meta, "song-b", NOW)).toThrow();
  });
});

describe("normalizeMetadata", () => {
  it("turns garbage into safe defaults", () => {
    const meta = normalizeMetadata({ tier: "vip", songsRemaining: -3, unlockedSongIds: "x" }, NOW);
    expect(meta.tier).toBe("free");
    expect(meta.songsRemaining).toBe(0);
    expect(meta.unlockedSongIds).toEqual([]);
    expect(meta.freeSongUsed).toBe(false);
  });
});
