/**
 * Short MP3 preview extraction — no ffmpeg, pure byte math.
 *
 * The free tier serves ONLY this preview; the full master is stored but
 * never leaves the server for unentitled users. The slice is made by
 * parsing the first MPEG frame header for the bitrate and cutting at the
 * byte offset that corresponds to PREVIEW_SECONDS (CBR assumption — true
 * for every provider we use). Slicing at a non-frame boundary costs at most
 * one glitched final frame, which decoders skip silently.
 */

export const PREVIEW_SECONDS = 15;

const BITRATE_TABLE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATE_TABLE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function id3Size(bytes: Buffer): number {
  if (bytes.length < 10 || bytes.toString("latin1", 0, 3) !== "ID3") return 0;
  // Syncsafe 28-bit size, excluding the 10-byte header.
  const size =
    (((bytes[6] ?? 0) & 0x7f) << 21) |
    (((bytes[7] ?? 0) & 0x7f) << 14) |
    (((bytes[8] ?? 0) & 0x7f) << 7) |
    ((bytes[9] ?? 0) & 0x7f);
  return 10 + size;
}

/** Finds the first MPEG audio frame and returns its bitrate in kbps, or null. */
function firstFrameBitrateKbps(bytes: Buffer): number | null {
  let offset = id3Size(bytes);
  const limit = Math.min(bytes.length - 4, offset + 64 * 1024);
  for (; offset < limit; offset++) {
    const b1 = bytes[offset] ?? 0;
    const b2 = bytes[offset + 1] ?? 0;
    if (b1 !== 0xff || (b2 & 0xe0) !== 0xe0) continue;
    const versionBits = (b2 >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2
    const layerBits = (b2 >> 1) & 0x03; // 1 = Layer III
    if (layerBits !== 1) continue;
    const bitrateIndex = ((bytes[offset + 2] ?? 0) >> 4) & 0x0f;
    if (bitrateIndex === 0 || bitrateIndex === 15) continue;
    const table = versionBits === 3 ? BITRATE_TABLE_V1_L3 : BITRATE_TABLE_V2_L3;
    const kbps = table[bitrateIndex];
    if (kbps && kbps > 0) return kbps;
  }
  return null;
}

/** WAV: slice via the byte rate in the fmt chunk (offset 28, LE). */
function makeWavPreview(master: Buffer, seconds: number): Buffer | null {
  if (master.length < 44 || master.toString("latin1", 0, 4) !== "RIFF") return null;
  const byteRate = master.readUInt32LE(28);
  if (!byteRate) return null;
  const end = Math.min(master.length, 44 + byteRate * seconds);
  if (end >= master.length) return master;
  const sliced = Buffer.from(master.subarray(0, end));
  // Patch RIFF + data chunk sizes so the header matches the truncated body.
  sliced.writeUInt32LE(sliced.length - 8, 4);
  sliced.writeUInt32LE(sliced.length - 44, 40);
  return sliced;
}

/** Container-aware preview extraction; null when the format is unknown. */
export function makeAudioPreview(
  master: Buffer,
  mimeType: string,
  seconds = PREVIEW_SECONDS
): Buffer | null {
  if (mimeType.includes("wav")) return makeWavPreview(master, seconds);
  return makeMp3Preview(master, seconds);
}

/**
 * Returns a preview slice of ~PREVIEW_SECONDS from an MP3 master, or null
 * when the container isn't MP3 / can't be parsed (caller falls back to
 * serving nothing rather than the master).
 */
export function makeMp3Preview(master: Buffer, seconds = PREVIEW_SECONDS): Buffer | null {
  const kbps = firstFrameBitrateKbps(master);
  if (!kbps) return null;
  const audioStart = id3Size(master);
  const bytesForClip = Math.floor(((kbps * 1000) / 8) * seconds);
  const end = Math.min(master.length, audioStart + bytesForClip);
  if (end >= master.length) {
    // Master is already shorter than the preview window — the preview IS the
    // master, which is fine (nothing longer exists to protect).
    return master;
  }
  return master.subarray(0, end);
}
