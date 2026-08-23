import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPendingAction,
  packExpiring,
  unpackExpiring,
  PENDING_ACTION_KEY,
  type PendingAction,
} from "@/lib/draft-storage";
import { musicRequestSchema } from "@/lib/validation";
import { DEFAULT_CONTROLS } from "@/lib/types";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("pending generate_music action across the sign-in redirect", () => {
  it("round-trips through storage and validates its shape", () => {
    const pending: PendingAction = { action: "generate_music", returnTo: "/create" };
    const packed = packExpiring(pending, 1_000);
    const restored = unpackExpiring<PendingAction>(packed, 2_000);
    expect(isPendingAction(restored)).toBe(true);
    expect(restored).toEqual(pending);
    expect(isPendingAction({ action: "delete_account", returnTo: "/create" })).toBe(false);
    expect(isPendingAction(null)).toBe(false);
  });

  it("is stored before the redirect and restored + surfaced on return", () => {
    const flow = source("components/CreateFlow.tsx");
    // Stored (with the draft already in sessionStorage) before router.push("/sign-in").
    expect(flow).toContain("PENDING_ACTION_KEY");
    expect(flow).toMatch(/PENDING_ACTION_KEY[\s\S]{0,400}router\.push\("\/sign-in"\)/);
    // Restored on hydration: jump to the music step and re-fire generation.
    expect(flow).toMatch(/isPendingAction\(pending\)[\s\S]{0,300}setStep\("music"\)/);
    expect(flow).toContain("pendingFireRef");
    // Never any draft content in redirect parameters.
    expect(flow).not.toMatch(/sign-in\?[^"]*(thought|lyrics|feelings)/);
  });

  it("uses a distinct storage key from the draft", () => {
    expect(PENDING_ACTION_KEY).not.toBe("liner-notes:draft:v2");
  });
});

describe("entitlement is never client-computed, client-readable, or client-writable", () => {
  const clientComponents = [
    "components/CreateFlow.tsx",
    "components/MusicStep.tsx",
    "components/LyricsStep.tsx",
    "components/WriteStep.tsx",
    "components/HomeEntry.tsx",
    "components/AccountControls.tsx",
  ];

  it("no client component imports the entitlement service or reads privateMetadata", () => {
    for (const path of clientComponents) {
      const text = source(path);
      expect(text, path).not.toContain("lib/entitlement");
      expect(text, path).not.toContain("privateMetadata");
    }
  });

  it("the music schema strips entitlement-shaped fields from the body", () => {
    const parsed = musicRequestSchema.parse({
      title: "Porch Light",
      lyrics: "[Verse 1]\nLong enough lyrics to pass validation",
      controls: DEFAULT_CONTROLS,
      songId: "song-123456",
      plan: "plus",
      packCreditsRemaining: 99,
      userId: "someone-else",
      entitlement: { downloadsAllowed: true },
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("plan");
    expect(parsed).not.toHaveProperty("packCreditsRemaining");
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("entitlement");
  });

  it("the music route resolves identity from auth() and metadata via the service only", () => {
    const route = source("app/api/music/route.ts");
    expect(route).toContain("await auth()");
    expect(route).toContain("reserveMusicGeneration");
    expect(route).toContain("recordMusicGeneration");
    expect(route).not.toContain("privateMetadata");
    // Reserve-then-commit ordering: the hold is placed before any provider
    // call, and only committed once the render lands.
    expect(route.indexOf("reserveMusicGeneration(userId")).toBeLessThan(
      route.indexOf("provider.generate")
    );
    expect(route.indexOf("provider.generate")).toBeLessThan(
      route.indexOf("recordMusicGeneration(userId")
    );
    // Audio and the vault record must exist before the hold becomes a charge.
    const realRenderCommit = route.lastIndexOf("recordMusicGeneration(userId");
    expect(route.indexOf("await storeAudio(")).toBeLessThan(realRenderCommit);
    expect(route.indexOf("await saveSongTake(")).toBeLessThan(realRenderCommit);
    expect(route).toContain("rollbackSongTake");
    expect(route).toContain("deleteAudio(storedAudioIds)");
    // A failed render must hand the hold back rather than consume it.
    expect(route).toContain("releaseMusicGeneration");
  });

  it("entitlement is granted only by the webhook, never from the redirect page", () => {
    expect(source("app/api/billing/webhook/route.ts")).toContain("applyBillingEventForUser");
    const flow = source("components/CreateFlow.tsx");
    expect(flow).not.toContain("applyBillingEvent");
    // The success redirect only shows copy — it never writes entitlement.
    expect(flow).toMatch(/billing === "success"[\s\S]{0,300}showToast/);
  });
});

describe("lyrics stay free and anonymous", () => {
  it("the lyrics route has no auth, entitlement, or payment involvement", () => {
    const route = source("app/api/lyrics/route.ts");
    expect(route).not.toContain("@clerk");
    expect(route).not.toContain("entitlement");
    expect(route).not.toContain("auth()");
    expect(route).toContain("checkGenerationRateLimit");
  });

  it("the UI never gates lyrics behind a wall", () => {
    const lyricsStep = source("components/LyricsStep.tsx");
    expect(lyricsStep).not.toContain("signin");
    expect(lyricsStep).not.toContain("paywall");
  });
});

describe("free-song restrictions in the UI", () => {
  it("hides the download button for non-downloadable provider audio", () => {
    const musicStep = source("components/MusicStep.tsx");
    expect(musicStep).toContain("props.music.isDemoAudio || props.music.downloadable");
  });

  it("presents both paywall options side by side with a no-loss dismiss", () => {
    const musicStep = source("components/MusicStep.tsx");
    expect(musicStep).toContain("Song Pass for “{props.songTitle}”");
    expect(musicStep).toContain("Unwritten Pro");
    expect(musicStep).toContain("20 render credits every month");
    expect(musicStep).toContain("Not now — back to my song");
    expect(musicStep).toContain("lyrics are never paywalled");
  });

  it("the unlock CTA appears only after the first playback and names the song", () => {
    const musicStep = source("components/MusicStep.tsx");
    expect(musicStep).toContain("previewPlayed");
    expect(musicStep).toContain("onEnded");
    expect(musicStep).toContain("Song Pass — $9.99");
  });

  it("keeps sign-in and payment as separate moments", () => {
    const musicStep = source("components/MusicStep.tsx");
    const signinWall = musicStep.slice(
      musicStep.indexOf('props.status === "signin"'),
      musicStep.indexOf('props.status === "paywall"')
    );
    expect(signinWall).toContain("your first one is on us");
    expect(signinWall).not.toMatch(/\$\d/);
  });
});
