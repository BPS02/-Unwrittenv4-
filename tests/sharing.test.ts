import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("song sharing", () => {
  it("shares a recipient-friendly page through the native share sheet", () => {
    const view = source("components/PlaylistsView.tsx");
    expect(view).toContain('new URL("/share", window.location.origin)');
    expect(view).toContain("navigator.share");
    expect(view).toContain("navigator.clipboard.writeText(url)");
  });

  it("only accepts signed app audio paths on the public listening page", () => {
    const page = source("app/share/page.tsx");
    expect(page).toContain('audio.startsWith("/api/audio/")');
    expect(page).toContain("<AudioPlayer src={playable}");
  });

  it("puts a visible share control on every playable track", () => {
    const list = source("components/TrackList.tsx");
    expect(list).toContain('className="track-share"');
    expect(list).toContain("Share how I feel");
  });
});
