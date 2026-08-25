import { describe, expect, it } from "vitest";
import { audioDisposition, audioFileExtension } from "@/lib/audio-download";

describe("audio download filenames", () => {
  it.each([
    ["audio/mpeg", "mp3"],
    ["audio/wav", "wav"],
    ["audio/x-wav; codecs=1", "wav"],
    ["audio/mp4", "m4a"],
    ["audio/ogg", "ogg"],
    ["audio/flac", "flac"],
  ])("maps %s to .%s", (mimeType, extension) => {
    expect(audioFileExtension(mimeType)).toBe(extension);
  });

  it("adds a playable extension only to downloads", () => {
    expect(audioDisposition(true, "audio/mpeg")).toBe('attachment; filename="unwritten-song.mp3"');
    expect(audioDisposition(false, "audio/mpeg")).toBe("inline");
  });
});
