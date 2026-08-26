import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storyMapSchema } from "@/lib/story-map";
import { approveStoryMap } from "@/lib/story-map-approval";
import {
  createStoryMapDraft,
  resetStoryMapsForTesting,
  saveApprovedStoryMap,
} from "@/lib/story-maps-store";
import type { GroundedSongOutcome } from "@/lib/grounded-live";

/**
 * /api/grounded-lyrics races two fresh pipeline runs and serves the first
 * that passes the gate, so a single refusal costs the writer nothing and no
 * extra latency. Both runs are mocked here — the race logic is what's under
 * test, not the models.
 */

vi.mock("@/lib/grounded-live", () => ({
  groundedFlowEnabled: () => true,
  generateGroundedSong: vi.fn(),
}));

const { generateGroundedSong } = await import("@/lib/grounded-live");
const mocked = vi.mocked(generateGroundedSong);

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")
)[0].story_map;

function outcome(passed: boolean, title = "Raced Song"): GroundedSongOutcome {
  return {
    passed,
    title: passed ? title : null,
    style: passed ? "Acoustic folk; 82 BPM, G major; end on one chord." : null,
    lyrics: passed ? "[Verse 1]\nA raced line" : null,
    model: "mock-model",
    report: { repaired: false, version: "grounded-pipeline.v13", attempts: [] } as unknown as GroundedSongOutcome["report"],
  };
}

async function approvedId(id: string): Promise<string> {
  const draft = storyMapSchema.parse({ ...fixture, story_map_id: id, status: "draft" });
  await createStoryMapDraft(draft, []);
  await saveApprovedStoryMap(id, approveStoryMap(draft, []));
  return id;
}

function request(storyMapId: string): Request {
  return new Request("http://test/api/grounded-lyrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyMapId }),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  resetStoryMapsForTesting();
  mocked.mockReset();
});

describe("grounded lyrics race", () => {
  it("serves the passing run even when the other runs refuse", async () => {
    mocked
      .mockResolvedValueOnce(outcome(false))
      .mockResolvedValueOnce(outcome(false))
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(outcome(true)), 25))
      );
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(request(await approvedId("sm_race_pass")));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { title: string; grounded: { passed: boolean } };
    expect(data.title).toBe("Raced Song");
    expect(data.grounded.passed).toBe(true);
    expect(mocked).toHaveBeenCalledTimes(3);
  });

  it("does not wait for the slower runs once one has passed", async () => {
    let slowSettled = false;
    const slow = () =>
      new Promise<GroundedSongOutcome>((resolve) =>
        setTimeout(() => {
          slowSettled = true;
          resolve(outcome(false));
        }, 5_000)
      );
    mocked.mockResolvedValueOnce(outcome(true)).mockImplementationOnce(slow).mockImplementationOnce(slow);
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(request(await approvedId("sm_race_fast")));
    expect(res.status).toBe(200);
    expect(slowSettled).toBe(false);
  });

  it("surfaces the honest refusal only when every run refuses", async () => {
    mocked
      .mockResolvedValueOnce(outcome(false))
      .mockResolvedValueOnce(outcome(false))
      .mockResolvedValueOnce(outcome(false));
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(request(await approvedId("sm_race_fail")));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { code: string; grounded: { runs: number } };
    expect(data.code).toBe("GROUNDING_FAILED");
    expect(data.grounded.runs).toBe(3);
  });

  it("still serves a refusal verdict when another run threw", async () => {
    mocked
      .mockRejectedValueOnce(new Error("provider hiccup"))
      .mockRejectedValueOnce(new Error("provider hiccup"))
      .mockResolvedValueOnce(outcome(false));
    const { POST } = await import("@/app/api/grounded-lyrics/route");
    const res = await POST(request(await approvedId("sm_race_error")));
    expect(res.status).toBe(502);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe("GROUNDING_FAILED");
  });
});
