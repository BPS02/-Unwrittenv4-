import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTROLS } from "@/lib/types";

/**
 * Exercises the route handlers directly (no HTTP server needed) in demo mode:
 * with no OPENROUTER_API_KEY, lyric generation must be deterministic and
 * local, and music must return a style prompt with mode "demo".
 */

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validLyricsBody = {
  input: {
    thought: "I keep thinking about the summer we drove to the coast.",
    feelings: ["nostalgic"],
    feelingsText: "",
    context: "",
  },
  controls: DEFAULT_CONTROLS,
  variation: 0,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "");
  vi.stubEnv("MUSIC_PROVIDER", "demo");
});

describe("POST /api/lyrics (demo mode)", () => {
  it("returns deterministic demo lyrics without any API key", async () => {
    const { POST } = await import("@/app/api/lyrics/route");
    const res = await POST(jsonRequest("http://test/api/lyrics", validLyricsBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { mode: string; title: string; lyrics: string };
    expect(data.mode).toBe("demo");
    expect(data.title.length).toBeGreaterThan(0);
    expect(data.lyrics).toContain("[Verse 1]");

    const res2 = await POST(jsonRequest("http://test/api/lyrics", validLyricsBody));
    const data2 = (await res2.json()) as { lyrics: string };
    expect(data2.lyrics).toBe(data.lyrics);
  });

  it("rejects an invalid body with a friendly 400", async () => {
    const { POST } = await import("@/app/api/lyrics/route");
    const res = await POST(
      jsonRequest("http://test/api/lyrics", {
        input: { ...validLyricsBody.input, thought: "" },
        controls: DEFAULT_CONTROLS,
      })
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("thought");
  });

  it("rejects non-JSON bodies", async () => {
    const { POST } = await import("@/app/api/lyrics/route");
    const res = await POST(
      new Request("http://test/api/lyrics", { method: "POST", body: "not json" })
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/music (demo mode)", () => {
  const validMusicBody = {
    title: "Porch Light",
    lyrics: "[Verse 1]\nThe old house hums in the summer heat\nAnd I remember everything",
    controls: DEFAULT_CONTROLS,
  };

  it("returns a demo result with a style prompt", async () => {
    const { POST } = await import("@/app/api/music/route");
    const res = await POST(jsonRequest("http://test/api/music", validMusicBody));
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      mode: string;
      stylePrompt: string;
      promptMode: string;
    };
    expect(data.mode).toBe("demo");
    expect(data.promptMode).toBe("demo");
    expect(data.stylePrompt).toContain(DEFAULT_CONTROLS.genre);
    expect(data.stylePrompt).toContain("Porch Light");
  });

  it("rejects missing lyrics with 400", async () => {
    const { POST } = await import("@/app/api/music/route");
    const res = await POST(
      jsonRequest("http://test/api/music", { ...validMusicBody, lyrics: "" })
    );
    expect(res.status).toBe(400);
  });

  it("fails clearly when a provider is selected but unconfigured", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "elevenlabs");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { POST } = await import("@/app/api/music/route");
    const res = await POST(jsonRequest("http://test/api/music", validMusicBody));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("elevenlabs");
  });

  it("rejects an unknown provider with a clear error", async () => {
    vi.stubEnv("MUSIC_PROVIDER", "sunopro");
    const { POST } = await import("@/app/api/music/route");
    const res = await POST(jsonRequest("http://test/api/music", validMusicBody));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Unknown MUSIC_PROVIDER");
  });
});
