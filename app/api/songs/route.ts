import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { listSongs, getMemoryTakeAudio } from "@/lib/songs-store";
import { mintAudioToken, mintBlobAudioToken, storeAudio } from "@/lib/audio-store";
import { getEntitlement } from "@/lib/entitlement/service";
import { masterAccessAllowed, summarize } from "@/lib/entitlement/logic";

export const runtime = "nodejs";

/** Playback/share tokens for saved songs last longer than fresh renders. */
const SAVED_SONG_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lists the signed-in user's saved songs, each with a freshly minted
 * streaming path (also usable as a share link for about a week).
 */
export async function GET(): Promise<NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ reason: "signin_required", error: "Sign in to see your songs." }, { status: 401 });
  }

  const [songs, entitlement] = await Promise.all([listSongs(userId), getEntitlement(userId)]);
  const wire = await Promise.all(
    songs.map(async (song) => {
      // Master access: the song was rendered full-quality or has a Song Pass;
      // unlock covers it, or the owner is an active Pro. Everyone else gets
      // ONLY the preview — the master pathname never leaves the server.
      const serveMaster = song.unlocked === true || masterAccessAllowed(entitlement, song.id);

      // One stream path per take: masters for entitled owners, previews
      // otherwise. Master pathnames never leave the server either way.
      const takes = await Promise.all(
        (song.takes ?? []).map(async (take) => {
          // Postgres audio is the current home; legacy Blob takes still
          // resolve by pathname until they are migrated or re-rendered.
          const audioId = serveMaster ? take.masterAudioId : take.previewAudioId;
          const pathname = serveMaster ? take.masterPathname : take.previewPathname;
          let streamPath: string | null = null;
          if (audioId) {
            const token = mintAudioToken(
              { audioId, ownerId: userId, downloadable: serveMaster },
              SAVED_SONG_TOKEN_TTL_MS
            );
            streamPath = `/api/audio/${token}`;
          } else if (pathname) {
            const token = mintBlobAudioToken(
              { pathname, ownerId: userId, downloadable: serveMaster },
              SAVED_SONG_TOKEN_TTL_MS
            );
            streamPath = `/api/audio/${token}`;
          } else {
            // Memory backend (local dev): re-store the bytes for a token.
            const audio = getMemoryTakeAudio(
              userId,
              song.id,
              take.n,
              serveMaster ? "master" : "preview"
            );
            if (audio) {
              const ref = await storeAudio({
                bytes: audio.bytes,
                mimeType: audio.mimeType,
                ownerId: userId,
                downloadable: serveMaster,
              });
              streamPath = `/api/audio/${ref.token}`;
            }
          }
          return { n: take.n, createdAt: take.createdAt, sizeBytes: take.sizeBytes ?? null, streamPath };
        })
      );

      return {
        id: song.id,
        title: song.title,
        lyrics: song.lyrics,
        stylePrompt: song.stylePrompt,
        provider: song.provider,
        createdAt: song.createdAt,
        unlocked: serveMaster,
        downloadable: serveMaster,
        favorite: song.favorite === true,
        sizeBytes: song.sizeBytes ?? null,
        mimeType: song.mimeType,
        takes,
        streamPath: takes[takes.length - 1]?.streamPath ?? null,
      };
    })
  );

  return NextResponse.json({ songs: wire, entitlement: summarize(entitlement) });
}
