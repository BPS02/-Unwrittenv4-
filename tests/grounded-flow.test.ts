import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storyMapSchema } from "@/lib/story-map";
import {
  createStoryMapDraft,
  getStoryMapRecord,
  resetStoryMapsForTesting,
} from "@/lib/story-maps-store";

/**
 * The live grounded flow: /api/story-map → review/approve → /api/grounded-lyrics.
 *
 * Two properties matter most:
 * 1. GROUNDED_FLOW off means the routes do not exist (404) — the classic
 *    guide/generator flow is byte-for-byte unaffected until the flag flips.
 * 2. The server, never the browser, enforces the approval gate: draft-status
 *    preconditions, contradiction flags, and the approved-only rule for
 *    generation.
 */

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")
)[0].story_map;

function draftMap(id: string) {
  return storyMapSchema.parse({ ...fixture, story_map_id: id, status: "draft" });
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetStoryMapsForTesting();
});

describe("grounded flow feature flag", () => {
  it("hides every grounded route while GROUNDED_FLOW is off", async () => {
    vi.stubEnv("GROUNDED_FLOW", "");
    const extract = await (await import("@/app/api/story-map/route")).POST(
      jsonRequest("http://test/api/story-map", {})
    );
    const approve = await (await import("@/app/api/story-map/approve/route")).POST(
      jsonRequest("http://test/api/story-map/approve", {})
    );
    const lyrics = await (await import("@/app/api/grounded-lyrics/route")).POST(
      jsonRequest("http://test/api/grounded-lyrics", {})
    );
    expect([extract.status, approve.status, lyrics.status]).toEqual([404, 404, 404]);
  });

  it("refuses extraction honestly when no model is configured", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const { POST } = await import("@/app/api/story-map/route");
    const res = await POST(
      jsonRequest("http://test/api/story-map", {
        input: {
          thought: "I drove past my old high school last night and it looked smaller",
          feelings: [],
          feelingsText: "",
          context: "",
        },
        controls: {
          genre: "Acoustic / Folk",
          mood: "Bittersweet",
          perspective: "First person (I)",
          lyricalStyle: "Plainspoken",
          structure: "Verse – Chorus",
          keepClean: true,
        },
        variation: 0,
      })
    );
    expect(res.status).toBe(503);
    const data = (await res.json()) as { code?: string };
    expect(data.code).toBe("STORY_MAP_UNAVAILABLE");
  });
});

describe("POST /api/story-map/approve", () => {
  it("answers 404 for an unknown story map id", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    const { POST } = await import("@/app/api/story-map/approve/route");
    const id = "sm_unknown_map";
    const res = await POST(
      jsonRequest("http://test/api/story-map/approve", {
        storyMapId: id,
        storyMap: draftMap(id),
      })
    );
    expect(res.status).toBe(404);
  });

  it("blocks approval while a contradiction flag is unresolved, then allows it once resolved", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    const id = "sm_test_contradiction";
    await createStoryMapDraft(draftMap(id), [
      { type: "contradiction", summary: "Two answers disagree about the year.", answer_ids: ["a1", "a2"] },
    ]);
    const { POST } = await import("@/app/api/story-map/approve/route");

    const blocked = await POST(
      jsonRequest("http://test/api/story-map/approve", { storyMapId: id, storyMap: draftMap(id) })
    );
    expect(blocked.status).toBe(409);
    expect((await getStoryMapRecord(id))?.status).toBe("draft");

    const resolved = await POST(
      jsonRequest("http://test/api/story-map/approve", {
        storyMapId: id,
        storyMap: draftMap(id),
        resolvedFlagIndexes: [0],
      })
    );
    expect(resolved.status).toBe(200);
    expect((await getStoryMapRecord(id))?.status).toBe("approved");
  });

  it("refuses to approve twice", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    const id = "sm_test_double_approve";
    await createStoryMapDraft(draftMap(id), []);
    const { POST } = await import("@/app/api/story-map/approve/route");
    const first = await POST(
      jsonRequest("http://test/api/story-map/approve", { storyMapId: id, storyMap: draftMap(id) })
    );
    expect(first.status).toBe(200);
    const second = await POST(
      jsonRequest("http://test/api/story-map/approve", { storyMapId: id, storyMap: draftMap(id) })
    );
    expect(second.status).toBe(409);
  });
});

describe("POST /api/grounded-lyrics", () => {
  it("refuses to write from an unapproved story", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const id = "sm_test_unapproved";
    await createStoryMapDraft(draftMap(id), []);
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(jsonRequest("http://test/api/grounded-lyrics", { storyMapId: id }));
    expect(res.status).toBe(409);
  });

  it("answers 404 for an unknown story map", async () => {
    vi.stubEnv("GROUNDED_FLOW", "1");
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(
      jsonRequest("http://test/api/grounded-lyrics", {
        storyMapId: "sm_never_created",
      })
    );
    expect(res.status).toBe(404);
  });
});

describe("classic flow isolation", () => {
  it("keeps lib/generate.ts free of every grounded import", () => {
    const source = readFileSync(new URL("../lib/generate.ts", import.meta.url), "utf8");
    for (const banned of ["grounded-live", "grounded-song-pipeline", "story-maps-store", "story-map-extraction"]) {
      expect(source).not.toContain(banned);
    }
  });

  it("keeps the grounded UI entirely behind NEXT_PUBLIC_GROUNDED_FLOW", () => {
    const source = readFileSync(new URL("../components/CreateFlow.tsx", import.meta.url), "utf8");
    expect(source).toContain('process.env.NEXT_PUBLIC_GROUNDED_FLOW === "1"');
  });
});
