import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reserve/commit — the fix for V2's documented race.
 *
 * V2 computed entitlement, called the provider, then wrote the result back
 * with a read-modify-write. Two simultaneous renders by one user could both
 * read "1 take left" and both spend it. Here a render places a hold before the
 * provider is called, so the gate sees in-flight work as already spent.
 *
 * These run against the in-memory backend (no DATABASE_URL). The Postgres path
 * enforces the same thing with SELECT ... FOR UPDATE inside a transaction.
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
  clerkClient: async () => {
    throw new Error("clerkClient must not be reached — entitlement lives in Postgres");
  },
}));

let service: typeof import("@/lib/entitlement/service");

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "");
  service = await import("@/lib/entitlement/service");
  service.resetEntitlementsForTesting();
});

describe("in-flight holds count against the gate", () => {
  it("refuses a second concurrent free render before the first commits", async () => {
    const held: string[] = [];
    for (let i = 0; i < 1; i++) {
      const r = await service.reserveMusicGeneration("user_1", "song-1");
      expect(r.assessment.allowed).toBe(true);
      expect(r.reservationId).not.toBeNull();
      held.push(r.reservationId as string);
    }

    const second = await service.reserveMusicGeneration("user_1", "song-1");
    expect(second.assessment.allowed).toBe(false);
    expect(second.reservationId).toBeNull();

    // Committed state is still untouched — holds are not spends.
    const meta = await service.getEntitlement("user_1");
    expect(meta.freeTakesUsed).toBe(0);

    // Committing the one free render lands it.
    for (const id of held) await service.recordMusicGeneration("user_1", "song-1", id);
    expect((await service.getEntitlement("user_1")).freeTakesUsed).toBe(1);
  });

  it("a released hold returns the take to the account", async () => {
    const first = await service.reserveMusicGeneration("user_1", "song-1");
    expect((await service.reserveMusicGeneration("user_1", "song-1")).assessment.allowed).toBe(false);

    // The third render failed — hand its hold back.
    await service.releaseMusicGeneration(first.reservationId as string);

    const retry = await service.reserveMusicGeneration("user_1", "song-1");
    expect(retry.assessment.allowed).toBe(true);

    await service.recordMusicGeneration("user_1", "song-1", retry.reservationId as string);
    expect((await service.getEntitlement("user_1")).freeTakesUsed).toBe(1);
  });

  it("a Pro subscriber's last song cannot be spent twice concurrently", async () => {
    service.seedEntitlementForTesting("user_2", {
      tier: "pro",
      songsRemaining: 1,
      freeSongUsed: true,
      freeSongId: "old",
    });

    const first = await service.reserveMusicGeneration("user_2", "song-a");
    expect(first.assessment.allowed).toBe(true);

    // Second render starts while the first is still with the provider.
    const second = await service.reserveMusicGeneration("user_2", "song-b");
    expect(second.assessment.allowed).toBe(false);

    await service.recordMusicGeneration("user_2", "song-a", first.reservationId as string);
    expect((await service.getEntitlement("user_2")).songsRemaining).toBe(0);
  });

  it("committing the same hold twice never spends two takes", async () => {
    const r = await service.reserveMusicGeneration("user_1", "song-1");
    const id = r.reservationId as string;
    await service.recordMusicGeneration("user_1", "song-1", id);
    await service.recordMusicGeneration("user_1", "song-1", id);
    const meta = await service.getEntitlement("user_1");
    expect(meta.freeTakesUsed).toBe(1);
    expect(meta.freeSongUsed).toBe(true);
  });

  it("an expired hold stops counting, so a crashed render strands nothing", async () => {
    const start = new Date("2026-01-01T00:00:00Z");
    // One free render starts and then crashes — no commit, no release.
    for (let i = 0; i < 1; i++) {
      const r = await service.reserveMusicGeneration("user_1", "song-1", start);
      expect(r.assessment.allowed).toBe(true);
    }
    expect((await service.reserveMusicGeneration("user_1", "song-1", start)).assessment.allowed).toBe(
      false
    );

    // Eleven minutes later the holds have expired (TTL is 10 minutes).
    const later = new Date(start.getTime() + 11 * 60 * 1000);
    const retry = await service.reserveMusicGeneration("user_1", "song-1", later);
    expect(retry.assessment.allowed).toBe(true);
  });
});

describe("billing stays idempotent", () => {
  it("a replayed unlock event grants exactly one unlock", async () => {
    const event = {
      id: "evt_1",
      type: "song_pass_purchased" as const,
      userId: "user_3",
      songId: "song-x",
    };
    const first = await service.applyBillingEventForUser("user_3", event);
    expect(first.applied).toBe(true);

    const replay = await service.applyBillingEventForUser("user_3", event);
    expect(replay.applied).toBe(false);

    const meta = await service.getEntitlement("user_3", new Date(), "song-x");
    expect(meta.unlockedSongIds).toEqual(["song-x"]);
  });

  it("an unlocked song renders at full quality without consuming a free take", async () => {
    await service.applyBillingEventForUser("user_4", {
      id: "evt_2",
      type: "song_pass_purchased",
      userId: "user_4",
      songId: "song-y",
    });
    const r = await service.reserveMusicGeneration("user_4", "song-y");
    expect(r.assessment.allowed).toBe(true);
    if (!r.assessment.allowed) throw new Error("unreachable");
    expect(r.assessment.quality).toBe("full");
    expect(r.assessment.consumesFreeTake).toBe(false);

    await service.recordMusicGeneration("user_4", "song-y", r.reservationId as string);
    const meta = await service.getEntitlement("user_4");
    expect(meta.freeTakesUsed).toBe(0);
    expect(meta.freeSongUsed).toBe(false);
  });
});
