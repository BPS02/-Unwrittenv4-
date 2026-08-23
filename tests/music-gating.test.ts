import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTROLS } from "@/lib/types";
import type { MusicProvider, ProviderRender } from "@/lib/music/provider";

/**
 * Route-level gating: /api/music must be authenticated and entitled whenever
 * Clerk is configured — demo mode included; each account gets exactly one
 * free generation. Refusals are structured; a failed render never consumes a
 * credit; nothing entitlement-related is accepted from the body. Only a bare
 * checkout with no Clerk keys keeps demo public.
 */

const authState: { userId: string | null } = { userId: null };

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authState.userId }),
  clerkClient: async () => {
    throw new Error("clerkClient must not be reached in tests (store is overridden)");
  },
}));

const providerHolder: { current: MusicProvider } = {
  current: undefined as unknown as MusicProvider,
};

vi.mock("@/lib/music/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/music/provider")>();
  return {
    ...actual,
    getMusicProvider: () => providerHolder.current,
  };
});

function successfulProvider(): MusicProvider {
  return {
    name: "fake-real",
    isConfigured: () => true,
    async generate(_req, stylePrompt): Promise<ProviderRender> {
      return {
        mode: "audio",
        stylePrompt,
        provider: "fake-real",
        audio: { bytes: Buffer.from("fake-audio-bytes"), mimeType: "audio/mpeg" },
      };
    },
  };
}

function failingProvider(): MusicProvider {
  return {
    name: "fake-real",
    isConfigured: () => true,
    async generate(): Promise<ProviderRender> {
      throw new Error("provider exploded");
    },
  };
}

/** Seeds committed entitlement state for a user (unlocks included). */
async function seed(userId: string, meta: Record<string, unknown>) {
  const service = await import("@/lib/entitlement/service");
  service.seedEntitlementForTesting(userId, meta);
}

/** Reads committed entitlement state back; `songId` scopes the unlock lookup. */
async function readMeta(userId: string, songId: string | null = null) {
  const service = await import("@/lib/entitlement/service");
  return service.getEntitlement(userId, new Date(), songId);
}

async function loadRoute() {
  const rateLimit = await import("@/lib/rate-limit");
  rateLimit.resetDailyRenderCounterForTesting();
  // The songs store is globalThis-pinned (dev bundling), so it survives
  // vi.resetModules — clear it so takes start from 1 in every test.
  const songs = await import("@/lib/songs-store");
  songs.clearSongsStoreForTesting();
  return import("@/app/api/music/route");
}

function musicRequest(body: Record<string, unknown>): Request {
  return new Request("http://test/api/music", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-LinerNotes-Device": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: "Porch Light",
  lyrics: "[Verse 1]\nThe old house hums in the summer heat\nAnd I remember everything",
  controls: DEFAULT_CONTROLS,
  songId: "song-aaaa-1111",
};

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("MUSIC_PROVIDER", "elevenlabs"); // any non-demo value; provider is mocked
  vi.stubEnv("MAX_DAILY_RENDERS", "100");
  // No DATABASE_URL → in-memory entitlement backend; the suite never touches
  // a real database.
  vi.stubEnv("DATABASE_URL", "");
  authState.userId = null;
  providerHolder.current = successfulProvider();
  // Entitlement state is globalThis-pinned (dev bundling), so it survives
  // vi.resetModules — clear it so each test starts from a fresh account.
  (await import("@/lib/entitlement/service")).resetEntitlementsForTesting();
});

describe("anonymous users", () => {
  it("demo music requires sign-in when accounts are configured", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "demo");
    const actual = await vi.importActual<typeof import("@/lib/music/provider")>("@/lib/music/provider");
    providerHolder.current = new actual.DemoMusicProvider();
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { reason: string }).reason).toBe("signin_required");
  });

  it("demo music stays public only on a bare checkout without Clerk keys", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "demo");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const actual = await vi.importActual<typeof import("@/lib/music/provider")>("@/lib/music/provider");
    providerHolder.current = new actual.DemoMusicProvider();
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { mode: string }).mode).toBe("demo");
  });

  it("real generation returns a structured signin_required refusal, not a crash", async () => {
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(401);
    const data = (await res.json()) as { reason: string; error: string };
    expect(data.reason).toBe("signin_required");
    expect(data.error).toContain("first one is on us");
  });
});

describe("lifetime free song", () => {
  it("first authenticated generation succeeds as a locked preview", async () => {
    authState.userId = "user_1";
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      mode: string;
      audio: { streamPath: string };
      quality: string;
      unlocked: boolean;
      downloadable: boolean;
      entitlement: Record<string, unknown>;
    };
    expect(data.mode).toBe("audio");
    expect(data.audio.streamPath).toMatch(/^\/api\/audio\//);
    expect(data.quality).toBe("preview");
    expect(data.unlocked).toBe(false);
    expect(data.downloadable).toBe(false);

    const meta = await readMeta("user_1");
    expect(meta.freeSongUsed).toBe(true);
    expect(meta.freeSongId).toBe(validBody.songId);

    // Response never leaks raw privateMetadata or the master pathname.
    expect(data.entitlement).not.toHaveProperty("unlockedSongIds");
    expect(data.entitlement).not.toHaveProperty("processedEventIds");
    expect(JSON.stringify(data)).not.toContain("freeSongUsed");
    expect(JSON.stringify(data)).not.toContain("masterPathname");
  });

  it("allows one preview render, then returns payment_required", async () => {
    authState.userId = "user_1";
    const { POST } = await loadRoute();
    for (let take = 1; take <= 1; take++) {
      const res = await POST(musicRequest(validBody));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { quality: string; takeNumber: number };
      expect(data.quality).toBe("preview");
      expect(data.takeNumber).toBe(take);
    }
    const second = await POST(musicRequest(validBody));
    expect(second.status).toBe(402);
    const data = (await second.json()) as { reason: string; entitlement: { tier: string } };
    expect(data.reason).toBe("payment_required");
    expect(data.entitlement.tier).toBe("free");
  });

  it("a signed-in demo render consumes the free generation", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "demo");
    const actual = await vi.importActual<typeof import("@/lib/music/provider")>("@/lib/music/provider");
    providerHolder.current = new actual.DemoMusicProvider();
    authState.userId = "user_1";
    const { POST } = await loadRoute();
    const first = await POST(musicRequest(validBody));
    expect(first.status).toBe(200);
    expect(((await first.json()) as { mode: string }).mode).toBe("demo");
    expect((await readMeta("user_1")).freeSongUsed).toBe(true);
    expect((await readMeta("user_1")).freeTakesUsed).toBe(1);
  });

  it("a second song from a free user returns payment_required", async () => {
    authState.userId = "user_1";
    const { POST } = await loadRoute();
    expect((await POST(musicRequest(validBody))).status).toBe(200);
    const second = await POST(musicRequest({ ...validBody, songId: "song-bbbb-2222" }));
    expect(second.status).toBe(402);
    expect(((await second.json()) as { reason: string }).reason).toBe("payment_required");
  });

  it("an unlocked songId renders at full quality with download", async () => {
    authState.userId = "user_1";
    await seed("user_1", {
      freeSongUsed: true,
      freeSongId: "old-free-song",
      unlockedSongIds: [validBody.songId],
      purchasedCredits: 1,
    });
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { quality: string; unlocked: boolean; downloadable: boolean };
    expect(data.quality).toBe("full");
    expect(data.unlocked).toBe(true);
    expect(data.downloadable).toBe(true);
  });

  it("a failed provider render does not consume a credit or take", async () => {
    authState.userId = "user_1";
    providerHolder.current = failingProvider();
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(502);
    // The hold was released, so nothing was consumed — the account still has
    // its untouched lifetime free song.
    const meta = await readMeta("user_1");
    expect(meta.freeSongUsed).toBe(false);
    expect(meta.freeTakesUsed).toBe(0);
  });

  it("entitlement supplied in the request body is ignored", async () => {
    authState.userId = "user_1";
    await seed("user_1", { freeSongUsed: true, freeSongId: "already-used" });
    const { POST } = await loadRoute();
    const res = await POST(
      musicRequest({
        ...validBody,
        plan: "plus",
        packCreditsRemaining: 99,
        entitlement: { plan: "plus" },
        userId: "user_2",
      })
    );
    expect(res.status).toBe(402);
  });
});

describe("entitled users", () => {
  it("a Pro subscriber gets full quality and the counter decrements", async () => {
    authState.userId = "user_2";
    await seed("user_2", {
      freeSongUsed: true,
      freeSongId: "old-free-song",
      tier: "pro",
      songsRemaining: 20,
    });
    const { POST } = await loadRoute();
    const res = await POST(musicRequest(validBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      quality: string;
      downloadable: boolean;
      entitlement: { songsRemaining: number };
    };
    expect(data.quality).toBe("full");
    expect(data.downloadable).toBe(true);
    expect(data.entitlement.songsRemaining).toBe(19);
    expect((await readMeta("user_2")).songsRemaining).toBe(19);
  });
});

describe("daily render ceiling", () => {
  it("caps total real renders across the app with a structured 503", async () => {
    vi.stubEnv("MAX_DAILY_RENDERS", "1");
    authState.userId = "user_1";
    // A Pro subscriber, so the entitlement gate allows the second render and
    // the daily ceiling is what refuses it.
    await seed("user_1", {
      freeSongUsed: true,
      freeSongId: "old-free-song",
      tier: "pro",
      songsRemaining: 30,
    });
    const { POST } = await loadRoute();
    expect((await POST(musicRequest(validBody))).status).toBe(200);
    const second = await POST(musicRequest(validBody));
    expect(second.status).toBe(503);
    expect(((await second.json()) as { code: string }).code).toBe("DAILY_CEILING");
  });
});

describe("audio streaming route", () => {
  it("streams inline for everyone but refuses download for free-tier renders", async () => {
    const { storeAudio, clearAudioStoreForTesting } = await import("@/lib/audio-store");
    clearAudioStoreForTesting();
    const { token } = await storeAudio({
      bytes: Buffer.from("audio"),
      mimeType: "audio/mpeg",
      ownerId: "user_1",
      downloadable: false,
    });
    const { GET } = await import("@/app/api/audio/[token]/route");

    const stream = await GET(new Request(`http://test/api/audio/${token}`), {
      params: Promise.resolve({ token }),
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get("Content-Disposition")).toBe("inline");

    const download = await GET(new Request(`http://test/api/audio/${token}?download=1`), {
      params: Promise.resolve({ token }),
    });
    expect(download.status).toBe(403);
    expect(((await download.json()) as { reason: string }).reason).toBe("payment_required");
  });

  it("allows download for entitled renders by their owner", async () => {
    authState.userId = "user_1";
    const { storeAudio } = await import("@/lib/audio-store");
    const { token } = await storeAudio({
      bytes: Buffer.from("audio"),
      mimeType: "audio/mpeg",
      ownerId: "user_1",
      downloadable: true,
    });
    const { GET } = await import("@/app/api/audio/[token]/route");
    const download = await GET(new Request(`http://test/api/audio/${token}?download=1`), {
      params: Promise.resolve({ token }),
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toContain("attachment");
  });

  it("404s an expired or unknown token", async () => {
    const { GET } = await import("@/app/api/audio/[token]/route");
    const res = await GET(new Request("http://test/api/audio/nope"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});
