import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  audioBlobs,
  billingEvents,
  entitlements,
  playlists,
  renderReservations,
  songs,
  songUnlocks,
  storyMemories,
  storyProfiles,
} from "@/lib/db/schema";

/**
 * Permanently removes one deleted Clerk user's data from Neon.
 *
 * The operation is idempotent because every predicate is a delete-by-userId.
 * Foreign-key cascades remove takes and playlist memberships; audio_blobs has
 * no ownership FK, so it is deleted explicitly inside the same transaction.
 */
export async function deleteAccountData(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  await db.transaction(async (tx) => {
    await tx.delete(playlists).where(eq(playlists.userId, userId));
    await tx.delete(songUnlocks).where(eq(songUnlocks.userId, userId));
    await tx.delete(renderReservations).where(eq(renderReservations.userId, userId));
    await tx.delete(storyMemories).where(eq(storyMemories.userId, userId));
    await tx.delete(storyProfiles).where(eq(storyProfiles.userId, userId));
    await tx.delete(songs).where(eq(songs.userId, userId));
    await tx.delete(audioBlobs).where(eq(audioBlobs.userId, userId));
    await tx.delete(entitlements).where(eq(entitlements.userId, userId));
    await tx.delete(billingEvents).where(eq(billingEvents.userId, userId));
  });
}
