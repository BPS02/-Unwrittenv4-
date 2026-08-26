import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { evaluateCountryFolkSong, summarizeSongEvaluations, type EvaluationModel } from "@/lib/song-evaluation";
import { storyMapSchema, type StoryMapV1 } from "@/lib/story-map";

interface Fixture { tags: string[]; story_map: unknown }
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")) as Fixture[];
const countryMaps = fixtures.filter((fixture) => fixture.tags.includes("country_folk")).map((fixture) => storyMapSchema.parse(fixture.story_map));

function candidateFor(map: StoryMapV1): string {
  const phrase = map.exact_phrases_to_keep[0] ?? "I remember";
  return `TITLE: Ordinary Light
STYLE: Acoustic folk, female solo, reflective; acoustic guitar, piano, upright bass, brushed drums; 82 BPM, G major; V1 guitar, C1 drums enter, V2 piano enters, bridge bass drops, final chorus full band; close dry mic, restrained ceiling, conversational phrasing; dry, close, 1970s room; end on one muted guitar chord; exclude synth pads, choir, auto-tune, fade-out.
LYRICS:
[Verse 1]
${phrase}
[Chorus]
I carry the ordinary light
[Verse 2]
The room looks different to me now
[Bridge]
I let the quiet answer stay
[Final Chorus]
I carry the ordinary light`;
}

describe("song-evaluation.v1", () => {
  it("runs mechanical validation before the claims audit", async () => {
    const map = countryMaps[0]!;
    const complete = vi.fn<EvaluationModel>(async ({ purpose }) => purpose === "songwriter"
      ? { text: candidateFor(map), model: "writer-test" }
      : { text: JSON.stringify({ claims: [] }), model: "audit-test" });
    const report = await evaluateCountryFolkSong({ storyMap: map, lead: "female", complete });
    expect(report.passed).toBe(true);
    expect(report.stoppedAfter).toBe("passed");
    expect(report.models).toEqual({ songwriter: "writer-test", claimsAudit: "audit-test" });
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["songwriter", "claims_audit"]);
  });

  it("does not spend an audit call on a mechanically invalid song", async () => {
    const map = countryMaps[0]!;
    const complete = vi.fn<EvaluationModel>(async () => ({ text: "not a song", model: "writer-test" }));
    const report = await evaluateCountryFolkSong({ storyMap: map, lead: "female", complete });
    expect(report.passed).toBe(false);
    expect(report.stoppedAfter).toBe("mechanical");
    expect(report.claimsAudit).toBeNull();
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("fails a mechanically valid song when the audit finds an invention", async () => {
    const map = countryMaps[0]!;
    const complete: EvaluationModel = async ({ purpose }) => purpose === "songwriter"
      ? { text: candidateFor(map) }
      : { text: JSON.stringify({ claims: [{ claim: "They moved overseas", lyric_excerpt: "moved overseas", story_map_path: null }] }) };
    const report = await evaluateCountryFolkSong({ storyMap: map, lead: "female", complete });
    expect(report.passed).toBe(false);
    expect(report.stoppedAfter).toBe("claims_audit");
    expect(report.claimsAudit?.inventionFlags).toHaveLength(1);
  });

  it("evaluates every approved country/folk fixture through the complete gate", async () => {
    expect(countryMaps.length).toBeGreaterThanOrEqual(4);
    const reports = await Promise.all(countryMaps.map((map) => evaluateCountryFolkSong({
      storyMap: map,
      lead: "female",
      complete: async ({ purpose }) => purpose === "songwriter"
        ? { text: candidateFor(map), model: "fixture-writer" }
        : { text: JSON.stringify({ claims: [] }), model: "fixture-auditor" },
    })));
    expect(summarizeSongEvaluations(reports)).toMatchObject({
      total: countryMaps.length,
      passed: countryMaps.length,
      failedMechanical: 0,
      failedClaimsAudit: 0,
      readyForHumanReview: true,
    });
  });

  it("never calls the staging evaluator from the live generation route", () => {
    const source = readFileSync(new URL("../lib/generate.ts", import.meta.url), "utf8");
    expect(source).not.toContain("song-evaluation");
    expect(source).not.toContain("evaluateCountryFolkSong");
  });
});
