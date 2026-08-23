import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

/**
 * Postgres-only integration checks.
 *
 * The rest of the suite runs against the in-memory backend, which cannot
 * exercise the thing that actually closes the race: `SELECT ... FOR UPDATE`
 * inside a transaction. These tests need a real database and SKIP unless
 * DATABASE_URL is present, so `npm test` stays database-free:
 *
 *   DATABASE_URL="postgres://...-pooler..." npx vitest run tests/db-integration.test.ts
 *
 * They write to whatever database you point them at, using randomised user
 * ids, and delete their own rows afterwards.
 */

const hasDb = Boolean(process.env.DATABASE_URL);
const users: string[] = [];

function testUser(): string {
  const id = `test_${crypto.randomUUID()}`;
  users.push(id);
  return id;
}

afterAll(async () => {
  if (!hasDb || users.length === 0) return;
  const { getDb } = await import("@/lib/db/client");
  const { billingEvents, entitlements, renderReservations, songUnlocks } = await import(
    "@/lib/db/schema"
  );
  const db = getDb();
  if (!db) return;
  await db.delete(renderReservations).where(inArray(renderReservations.userId, users));
  await db.delete(songUnlocks).where(inArray(songUnlocks.userId, users));
  await db.delete(billingEvents).where(inArray(billingEvents.userId, users));
  await db.delete(entitlements).where(inArray(entitlements.userId, users));
});

describe.skipIf(!hasDb)("Neon Postgres", () => {
  it("has every table the schema declares", async () => {
    const { getDb } = await import("@/lib/db/client");
    const db = getDb();
    expect(db).not.toBeNull();
    const { sql } = await import("drizzle-orm");
    const rows = await db!.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );
    const names = (rows.rows as Array<{ table_name: string }>).map((r) => r.table_name);
    for (const t of [
      "billing_events",
      "entitlements",
      "render_reservations",
      "song_unlocks",
      "songs",
      "takes",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("serializes concurrent reserves — four at once, only three takes granted", async () => {
    const service = await import("@/lib/entitlement/service");
    const userId = testUser();

    // Four renders fire simultaneously against a brand-new account. Without
    // the row lock, more than FREE_SONG_TAKES could pass the gate.
    const results = await Promise.all([
      service.reserveMusicGeneration(userId, "song-1"),
      service.reserveMusicGeneration(userId, "song-1"),
      service.reserveMusicGeneration(userId, "song-1"),
      service.reserveMusicGeneration(userId, "song-1"),
    ]);

    const granted = results.filter((r) => r.assessment.allowed);
    expect(granted).toHaveLength(3);
    expect(results.filter((r) => !r.assessment.allowed)).toHaveLength(1);

    // Holds are not spends until committed.
    expect((await service.getEntitlement(userId)).freeTakesUsed).toBe(0);

    for (const r of granted) {
      await service.recordMusicGeneration(userId, "song-1", r.reservationId as string);
    }
    const meta = await service.getEntitlement(userId);
    expect(meta.freeTakesUsed).toBe(3);
    expect(meta.freeSongUsed).toBe(true);
    expect(meta.freeSongId).toBe("song-1");
  });

  it("a released hold returns the take", async () => {
    const service = await import("@/lib/entitlement/service");
    const userId = testUser();

    const first = await service.reserveMusicGeneration(userId, "song-1");
    const second = await service.reserveMusicGeneration(userId, "song-1");
    const third = await service.reserveMusicGeneration(userId, "song-1");
    expect((await service.reserveMusicGeneration(userId, "song-1")).assessment.allowed).toBe(false);

    await service.releaseMusicGeneration(third.reservationId as string);
    expect((await service.reserveMusicGeneration(userId, "song-1")).assessment.allowed).toBe(true);

    // Only the committed ones count.
    await service.recordMusicGeneration(userId, "song-1", first.reservationId as string);
    await service.recordMusicGeneration(userId, "song-1", second.reservationId as string);
    expect((await service.getEntitlement(userId)).freeTakesUsed).toBe(2);
  });

  it("committing one hold twice never spends two takes", async () => {
    const service = await import("@/lib/entitlement/service");
    const userId = testUser();
    const r = await service.reserveMusicGeneration(userId, "song-1");
    const id = r.reservationId as string;
    await service.recordMusicGeneration(userId, "song-1", id);
    await service.recordMusicGeneration(userId, "song-1", id);
    expect((await service.getEntitlement(userId)).freeTakesUsed).toBe(1);
  });

  it("the billing_events primary key makes a replayed webhook a no-op", async () => {
    const service = await import("@/lib/entitlement/service");
    const userId = testUser();
    const event = {
      id: `evt_${crypto.randomUUID()}`,
      type: "song_pass_purchased" as const,
      userId,
      songId: "song-x",
    };

    // Two deliveries of the same event arriving at once.
    const [a, b] = await Promise.all([
      service.applyBillingEventForUser(userId, event),
      service.applyBillingEventForUser(userId, event),
    ]);
    expect([a.applied, b.applied].filter(Boolean)).toHaveLength(1);

    const meta = await service.getEntitlement(userId, new Date(), "song-x");
    expect(meta.unlockedSongIds).toEqual(["song-x"]);
  });

  it("an unlocked song renders at full quality without touching the free take", async () => {
    const service = await import("@/lib/entitlement/service");
    const userId = testUser();
    await service.applyBillingEventForUser(userId, {
      id: `evt_${crypto.randomUUID()}`,
      type: "song_pass_purchased",
      userId,
      songId: "song-y",
    });

    const r = await service.reserveMusicGeneration(userId, "song-y");
    expect(r.assessment.allowed).toBe(true);
    if (!r.assessment.allowed) throw new Error("unreachable");
    expect(r.assessment.quality).toBe("full");

    await service.recordMusicGeneration(userId, "song-y", r.reservationId as string);
    const meta = await service.getEntitlement(userId);
    expect(meta.freeTakesUsed).toBe(0);
    expect(meta.freeSongUsed).toBe(false);
  });
});
