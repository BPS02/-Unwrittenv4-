import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { generateLyrics, type LyricsOutcome } from "@/lib/generate";
import { promptStoryMemories, saveSongInputMemories } from "@/lib/story-memory";
import type { LyricsRequestParsed } from "@/lib/validation";

/**
 * Adds private account memory when a verified Clerk session is present.
 * Signing in is never required: the anonymous path calls the same free lyric
 * generator with no memory and no entitlement or billing check.
 */
export async function generatePersonalizedLyrics(req: LyricsRequestParsed): Promise<LyricsOutcome> {
  if (!clerkEnabled) return generateLyrics(req);
  const { userId } = await auth();
  if (!userId) return generateLyrics(req);
  try {
    await saveSongInputMemories(userId, req.input);
    return generateLyrics(req, await promptStoryMemories(userId));
  } catch (error) {
    // A profile-storage outage must never take away the free lyric-writing
    // path. Generate from the current song and report the memory failure.
    console.error("[personalized-lyrics] memory unavailable", error);
    return generateLyrics(req);
  }
}
