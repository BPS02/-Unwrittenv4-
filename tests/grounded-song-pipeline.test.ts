import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runGroundedSongPipeline, type GroundedPipelineModel } from "@/lib/grounded-song-pipeline";
import { buildSourcePacket } from "@/lib/source-packet";
import { storyMapSchema } from "@/lib/story-map";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8"))[0].story_map;
const map = storyMapSchema.parse(fixture);
const packet = buildSourcePacket(map);
const exactId = packet.atoms.find((atom) => atom.kind === "exact_phrase")!.id;

function draft(style = "Acoustic folk; guitar, bass, brushes; 82 BPM, G major; close dry vocal; end on one guitar chord; exclude synths, choir, auto-tune, strings.") {
  return JSON.stringify({
    version: "grounded-draft.v5",
    title: "Take Your Time",
    style,
    sections: [
      { label: "Verse 1", lines: [{ text: "We laugh while fixing a meal", source_ids: ["src_05"], treatment: "paraphrase" }] },
      { label: "Chorus", lines: [{ text: "take your time", source_ids: [exactId], treatment: "refrain" }] },
      { label: "Verse 2", lines: [{ text: "Gratitude is easier to say", source_ids: ["src_07"], treatment: "paraphrase" }] },
    ],
  });
}
const cleanAudit = JSON.stringify({ claims: [] });
const failedAudit = JSON.stringify({ claims: [{ claim: "Invented dog", lyric_excerpt: "neighbor's dog", story_map_path: null }] });

describe("grounded-pipeline.v13", () => {
  it("returns a first-pass song without calling repair", async () => {
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => purpose === "grounded_draft"
      ? { text: draft(), model: "writer" }
      : { text: cleanAudit, model: "auditor" });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3 + solo.v1", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(false);
    expect(report.attempts).toHaveLength(1);
    expect(report.finalSong).toContain("LYRICS:");
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "claims_audit"]);
  });

  it("repairs a mechanical failure the normalizer cannot fix before running the audit", async () => {
    // A missing required section is structural, not normalizable — STYLE
    // omissions no longer reach the repair (see the first-pass test below).
    const missingVerseTwo = JSON.parse(draft()) as { sections: Array<{ label: string }> };
    missingVerseTwo.sections[2]!.label = "Bridge";
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => {
      if (purpose === "grounded_draft") return { text: JSON.stringify(missingVerseTwo) };
      if (purpose === "grounded_repair") return { text: draft() };
      return { text: cleanAudit };
    });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(true);
    expect(report.attempts[0]?.claimsAudit).toBeNull();
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "grounded_repair", "claims_audit"]);
  });

  it("normalizes STYLE tempo, key, and ending omissions without spending the model repair", async () => {
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => {
      if (purpose === "grounded_draft") return { text: draft("Acoustic folk without numbers") };
      return { text: cleanAudit };
    });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(false);
    expect(report.finalSong).toContain("82 BPM, G major");
    expect(report.finalSong).toMatch(/End on a single held chord/);
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "claims_audit"]);
  });

  it("normalizes a false exact citation without spending the model repair", async () => {
    const invalid = JSON.parse(draft()) as { sections: Array<{ lines: Array<{ text: string }> }> };
    invalid.sections[1]!.lines[0]!.text = "please wait";
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => {
      if (purpose === "grounded_draft") return { text: JSON.stringify(invalid) };
      return { text: cleanAudit };
    });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(false);
    expect(report.finalSong).toContain("take your time");
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "claims_audit"]);
  });

  it("clears an auditor false positive on a cited exact line without spending the repair", async () => {
    // The chorus line IS the exact atom's verbatim text and cites it, so an
    // invention flag against that excerpt is deterministically disproven.
    const falsePositiveAudit = JSON.stringify({
      claims: [{ claim: "Invented request to take time", lyric_excerpt: "take your time", story_map_path: null }],
    });
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => purpose === "grounded_draft"
      ? { text: draft() }
      : { text: falsePositiveAudit });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(false);
    expect(report.attempts[0]?.claimsAudit?.passed).toBe(false);
    expect(report.attempts[0]?.reconciliation?.passed).toBe(true);
    expect(report.attempts[0]?.reconciliation?.clearedFlags).toHaveLength(1);
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "claims_audit"]);
  });

  it("turns a malformed draft completion into the one repair instead of crashing", async () => {
    const malformed = '{"version":"grounded-draft.v5","title":"Broken","style":"x", <not json>';
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose, user }) => {
      if (purpose === "grounded_draft") return { text: malformed };
      if (purpose === "grounded_repair") {
        // The repair receives the raw text and the parse failure, quoted.
        expect(user).toContain("NOT VALID JSON");
        expect(user).toContain("draft.parse");
        return { text: draft() };
      }
      return { text: cleanAudit };
    });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.repaired).toBe(true);
    expect(report.attempts[0]?.draft).toBeNull();
    expect(report.attempts[0]?.mechanical.checks.some((check) => check.id === "draft.parse" && !check.passed)).toBe(true);
    expect(report.attempts[0]?.claimsAudit).toBeNull();
    expect(complete.mock.calls.map(([request]) => request.purpose)).toEqual(["grounded_draft", "grounded_repair", "claims_audit"]);
  });

  it("fails cleanly, without a song, when both completions are malformed", async () => {
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => purpose === "claims_audit"
      ? { text: cleanAudit }
      : { text: "not json at all" });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(false);
    expect(report.finalSong).toBeNull();
    expect(report.attempts).toHaveLength(2);
    expect(complete.mock.calls.filter(([request]) => request.purpose === "claims_audit")).toHaveLength(0);
    expect(complete.mock.calls.filter(([request]) => request.purpose === "grounded_repair")).toHaveLength(1);
  });

  it("repairs a claims failure and runs both final gates again", async () => {
    let audits = 0;
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => {
      if (purpose === "grounded_draft" || purpose === "grounded_repair") return { text: draft() };
      audits += 1;
      return { text: audits === 1 ? failedAudit : cleanAudit };
    });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(true);
    expect(report.attempts).toHaveLength(2);
    expect(report.attempts[0]?.claimsAudit?.passed).toBe(false);
    expect(report.attempts[1]?.claimsAudit?.passed).toBe(true);
  });

  it("never performs a second repair when the repaired draft still fails", async () => {
    const complete = vi.fn<GroundedPipelineModel>(async ({ purpose }) => purpose === "claims_audit"
      ? { text: failedAudit }
      : { text: draft() });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.passed).toBe(false);
    expect(report.finalSong).toBeNull();
    expect(report.attempts).toHaveLength(2);
    expect(complete.mock.calls.filter(([request]) => request.purpose === "grounded_repair")).toHaveLength(1);
  });

  it("records every contract version in the report itself", async () => {
    const complete: GroundedPipelineModel = async ({ purpose }) => ({ text: purpose === "grounded_draft" ? draft() : cleanAudit });
    const report = await runGroundedSongPipeline({ storyMap: map, productionModules: "country_folk.v3", complete });
    expect(report.promptVersions).toEqual({ sourcePacket: "source-packet.v2", draft: "grounded-draft.v5", validator: "validator.v2", claimsAudit: "claims-audit.v4", reconciliation: "claims-reconciliation.v2", repair: "grounded-repair.v8" });
  });

  it("stays disconnected from the live production generator", () => {
    const source = readFileSync(new URL("../lib/generate.ts", import.meta.url), "utf8");
    expect(source).not.toContain("grounded-song-pipeline");
    expect(source).not.toContain("runGroundedSongPipeline");
  });
});
