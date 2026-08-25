export function audioFileExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "audio/wav" || normalized === "audio/x-wav" || normalized === "audio/wave") return "wav";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a" || normalized === "audio/aac") return "m4a";
  if (normalized === "audio/ogg" || normalized === "application/ogg") return "ogg";
  if (normalized === "audio/flac" || normalized === "audio/x-flac") return "flac";
  return "mp3";
}

export function audioDisposition(wantsDownload: boolean, mimeType: string): string {
  return wantsDownload
    ? `attachment; filename="unwritten-song.${audioFileExtension(mimeType)}"`
    : "inline";
}
