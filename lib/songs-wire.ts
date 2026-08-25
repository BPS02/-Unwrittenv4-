import { mintAudioToken, mintBlobAudioToken, storeAudio } from "@/lib/audio-store";
import { masterAccessAllowed, summarize } from "@/lib/entitlement/logic";
import { getEntitlement } from "@/lib/entitlement/service";
import { getMemoryTakeAudio, listSongs } from "@/lib/songs-store";

const SAVED_SONG_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SavedSongWire {
  id: string;
  title: string;
  lyrics: string;
  stylePrompt: string;
  coverArt?: string | null;
  provider: string;
  createdAt: string;
  unlocked: boolean;
  downloadable: boolean;
  favorite: boolean;
  sizeBytes: number | null;
  mimeType: string;
  streamPath: string | null;
}

/** Builds the client-safe vault payload for both SSR and /api/songs. */
export async function listSongsWire(userId: string) {
  const [songs, entitlement] = await Promise.all([listSongs(userId), getEntitlement(userId)]);
  const wire: SavedSongWire[] = await Promise.all(songs.map(async (song) => {
    const serveMaster = song.unlocked === true || masterAccessAllowed(entitlement, song.id);
    const takes = await Promise.all((song.takes ?? []).map(async (take) => {
      const audioId = serveMaster ? take.masterAudioId : take.previewAudioId;
      const pathname = serveMaster ? take.masterPathname : take.previewPathname;
      let streamPath: string | null = null;
      if (audioId) {
        streamPath = `/api/audio/${mintAudioToken({ audioId, ownerId: userId, downloadable: serveMaster }, SAVED_SONG_TOKEN_TTL_MS)}`;
      } else if (pathname) {
        streamPath = `/api/audio/${mintBlobAudioToken({ pathname, ownerId: userId, downloadable: serveMaster }, SAVED_SONG_TOKEN_TTL_MS)}`;
      } else {
        const audio = getMemoryTakeAudio(userId, song.id, take.n, serveMaster ? "master" : "preview");
        if (audio) {
          const ref = await storeAudio({ bytes: audio.bytes, mimeType: audio.mimeType, ownerId: userId, downloadable: serveMaster });
          streamPath = `/api/audio/${ref.token}`;
        }
      }
      return { streamPath };
    }));
    return {
      id: song.id,
      title: song.title,
      lyrics: song.lyrics,
      stylePrompt: song.stylePrompt,
      coverArt: song.coverArt ?? null,
      provider: song.provider,
      createdAt: song.createdAt,
      unlocked: serveMaster,
      downloadable: serveMaster,
      favorite: song.favorite === true,
      sizeBytes: song.sizeBytes ?? null,
      mimeType: song.mimeType,
      streamPath: takes[takes.length - 1]?.streamPath ?? null,
    };
  }));
  return { songs: wire, entitlement: summarize(entitlement) };
}
