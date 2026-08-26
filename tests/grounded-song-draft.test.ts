import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGroundedRepairUserPrompt, normalizeGroundedDraftMechanically, parseGroundedDraft, renderGroundedDraft } from "@/lib/grounded-song-draft";
import { buildSourcePacket } from "@/lib/source-packet";
import { storyMapSchema } from "@/lib/story-map";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8"))[0].story_map;
const packet = buildSourcePacket(storyMapSchema.parse(fixture));
const raw = {
  version: "grounded-draft.v5",
  title: "Take Your Time",
  style: "Acoustic folk, female solo; guitar, bass, brushes; 82 BPM, G major; close dry mix; end on guitar.",
  sections: [
    { label: "Verse 1", lines: [{ text: "We laugh while fixing dinner", source_ids: ["src_04"], treatment: "paraphrase" }] },
    { label: "Chorus", lines: [{ text: "Take your time", source_ids: [packet.atoms.find((atom) => atom.kind === "exact_phrase")!.id], treatment: "refrain" }] },
    { label: "Verse 2", lines: [{ text: "Gratitude has become easier to say", source_ids: ["src_07"], treatment: "paraphrase" }] },
  ],
};

describe("grounded-draft.v5", () => {
  it("parses source references and renders the provider-facing song", () => {
    const draft = parseGroundedDraft(JSON.stringify(raw), packet);
    const rendered = renderGroundedDraft(draft);
    expect(rendered).toContain("TITLE: Take Your Time");
    expect(rendered).toContain("[Verse 1]");
    expect(rendered).not.toContain("source_ids");
  });

  it("rejects an unknown source atom before rendering", () => {
    const invalid = structuredClone(raw);
    invalid.sections[0]!.lines[0]!.source_ids = ["src_99"];
    expect(() => parseGroundedDraft(JSON.stringify(invalid), packet)).toThrow(/unknown source atom/i);
  });

  it("rejects exact citations that omit their authorized words", () => {
    const invalid = structuredClone(raw);
    invalid.sections[1]!.lines[0]!.text = "Please wait";
    expect(() => parseGroundedDraft(JSON.stringify(invalid), packet)).toThrow(/verbatim/i);
  });

  it("accepts exact as a line treatment when the source text is verbatim", () => {
    const exact = structuredClone(raw);
    exact.sections[1]!.lines[0]!.treatment = "exact";
    expect(parseGroundedDraft(JSON.stringify(exact), packet).sections[1]!.lines[0]!.treatment).toBe("exact");
  });

  it("accepts faithful grammatical changes without trusting the treatment label", () => {
    const changed = structuredClone(raw);
    changed.sections[0]!.lines[0] = {
      text: "Dinner gets fixed while we laugh",
      source_ids: ["src_04"],
      treatment: "literal",
    };
    expect(parseGroundedDraft(JSON.stringify(changed), packet).sections[0]!.lines[0]!.text).toBe("Dinner gets fixed while we laugh");
  });

  it("omits empty optional intro and outro sections instead of crashing", () => {
    const withEmptyBookends = structuredClone(raw);
    withEmptyBookends.sections.unshift({ label: "Intro", lines: [] } as never);
    withEmptyBookends.sections.push({ label: "Outro", lines: [] } as never);
    const parsed = parseGroundedDraft(JSON.stringify(withEmptyBookends), packet);
    expect(parsed.sections.map((section) => section.label)).toEqual(["Verse 1", "Chorus", "Verse 2"]);
  });

  it("rejects temporal scope that is broader than the cited source", () => {
    const broadened = structuredClone(raw);
    broadened.sections[0]!.lines[0]!.text = "We always laugh while fixing dinner";
    expect(() => parseGroundedDraft(JSON.stringify(broadened), packet)).toThrow(/broadens temporal scope/i);
  });

  it("allows present-transition wording when change over time authorizes it", () => {
    const transitioned = structuredClone(raw);
    transitioned.sections[2]!.lines[0]!.text = "Now gratitude has become easier to say";
    expect(parseGroundedDraft(JSON.stringify(transitioned), packet).sections[2]!.lines[0]!.text).toContain("Now");
  });

  it("requires Verse 2 to advance the approved present or change", () => {
    const stalled = structuredClone(raw);
    stalled.sections[2]!.lines[0] = { text: "We laugh while fixing dinner", source_ids: ["src_05"], treatment: "paraphrase" };
    expect(() => parseGroundedDraft(JSON.stringify(stalled), packet)).toThrow(/Verse 2 must cite/i);
  });

  it("requires every chorus to anchor to the message or exact hook", () => {
    const generic = structuredClone(raw);
    generic.sections[1]!.lines[0] = { text: "We laugh while fixing dinner", source_ids: ["src_05"], treatment: "paraphrase" };
    expect(() => parseGroundedDraft(JSON.stringify(generic), packet)).toThrow(/Chorus must cite/i);
  });

  it("deterministically removes unauthorized frequency words", () => {
    const broadened = structuredClone(raw);
    broadened.sections[0]!.lines[0]!.text = "We always laugh while fixing dinner";
    const normalized = normalizeGroundedDraftMechanically(broadened as never, packet);
    expect(normalized.sections[0]!.lines[0]!.text).toBe("We laugh while fixing dinner");
  });

  it("deterministically restores a missing exact citation", () => {
    const missing = structuredClone(raw);
    missing.sections[1]!.lines[0]!.text = "Please wait";
    const normalized = normalizeGroundedDraftMechanically(missing as never, packet);
    expect(normalized.sections[1]!.lines[0]!.text).toBe("take your time");
    expect(normalized.sections[1]!.lines[0]!.treatment).toBe("exact");
  });

  it("deterministically appends an explicit final sound when STYLE omits one", () => {
    const missingEnding = structuredClone(raw);
    missingEnding.style = "Acoustic folk, female solo; guitar, bass, brushes; 82 BPM, G major; close dry mix";
    const normalized = normalizeGroundedDraftMechanically(missingEnding as never, packet);
    expect(normalized.style).toMatch(/\bend on a single held chord\b/i);
    expect(normalized.style).toContain("82 BPM, G major");
  });

  it("deterministically removes an affirmative fade direction from STYLE", () => {
    const fading = structuredClone(raw);
    fading.style =
      "Acoustic folk; guitar, bass; 82 BPM, G major; end on one soft strum. The track fades out slowly.";
    const normalized = normalizeGroundedDraftMechanically(fading as never, packet);
    expect(normalized.style).not.toMatch(/fades?\s+out/i);
    // The existing compliant ending survives; nothing new is appended.
    expect(normalized.style).toContain("end on one soft strum");
    expect(normalized.style).not.toMatch(/single held chord/i);
  });

  it("removes the fade and appends an ending when STYLE has both defects", () => {
    const doubleDefect = structuredClone(raw);
    doubleDefect.style = "Acoustic folk; guitar, bass; 82 BPM, G major. The outro fades to silence.";
    const normalized = normalizeGroundedDraftMechanically(doubleDefect as never, packet);
    expect(normalized.style).not.toMatch(/fades?/i);
    expect(normalized.style).toMatch(/\bend on a single held chord\b/i);
  });

  it("deterministically appends a default key when STYLE omits one", () => {
    const missingKey = structuredClone(raw);
    missingKey.style = "Acoustic folk; guitar, bass; 82 BPM; close dry mix; end on guitar.";
    const normalized = normalizeGroundedDraftMechanically(missingKey as never, packet);
    expect(normalized.style).toMatch(/\bG major\b/);
    expect(normalized.style).toContain("82 BPM");
  });

  it("deterministically appends a default BPM when STYLE omits one", () => {
    const missingBpm = structuredClone(raw);
    missingBpm.style = "Acoustic folk; guitar, bass; G major; close dry mix; end on guitar.";
    const normalized = normalizeGroundedDraftMechanically(missingBpm as never, packet);
    expect(normalized.style).toMatch(/\b82\s*BPM\b/i);
    // The existing key is kept; only the missing piece is added.
    expect(normalized.style.match(/\bG major\b/g)).toHaveLength(1);
  });

  it("appends both defaults when STYLE names neither tempo nor key", () => {
    const bare = structuredClone(raw);
    bare.style = "Acoustic folk; guitar, bass; close dry mix; end on guitar.";
    const normalized = normalizeGroundedDraftMechanically(bare as never, packet);
    expect(normalized.style).toMatch(/\b82 BPM, G major\b/);
  });

  it("treats an out-of-range BPM as missing and appends a valid one", () => {
    const invalidBpm = structuredClone(raw);
    invalidBpm.style = "Acoustic folk; guitar, bass; 32 BPM, G major; end on guitar.";
    const normalized = normalizeGroundedDraftMechanically(invalidBpm as never, packet);
    expect(normalized.style).toMatch(/\b82 BPM\b/);
  });

  it("leaves a fully compliant STYLE untouched", () => {
    const normalized = normalizeGroundedDraftMechanically(structuredClone(raw) as never, packet);
    expect(normalized.style).toBe(raw.style);
  });

  it("constrains long STYLE while retaining tempo, key, ending, and exclusions", () => {
    const long = structuredClone(raw);
    long.style = `${"Warm acoustic detail. ".repeat(50)}82 BPM, G major. Song ends on one guitar chord. Exclude fade-out and auto-tune.`;
    const normalized = normalizeGroundedDraftMechanically(long as never, packet);
    expect(normalized.style.split(/\s+/).length).toBeLessThanOrEqual(110);
    expect(normalized.style).toContain("82 BPM, G major");
    expect(normalized.style).toContain("ends on one guitar chord");
    expect(normalized.style).toContain("Exclude fade-out and auto-tune");
  });

  it("builds one bounded repair request from flags and failed checks", () => {
    const draft = parseGroundedDraft(JSON.stringify(raw), packet);
    const prompt = buildGroundedRepairUserPrompt({
      packet,
      draft,
      inventionFlags: [{ claim: "Invented dog", lyric_excerpt: "neighbor's dog", story_map_path: null }],
      failedChecks: [{ id: "lyrics.line_length", passed: false, message: "Too long", path: "lyrics" }],
    });
    expect(prompt).toContain("FLAGGED EXCERPTS ONLY");
    expect(prompt).toContain("neighbor's dog");
    expect(prompt).toContain("lyrics.line_length");
  });

  it("gives the single repair an exact, scope, invention, and style checklist", () => {
    const source = readFileSync(new URL("../lib/grounded-song-draft.ts", import.meta.url), "utf8");
    expect(source).toContain("MANDATORY FINAL CHECKLIST");
    expect(source).toContain("copy atom.verbatim exactly");
    expect(source).toContain("Delete every flagged unsupported claim");
    expect(source).toContain("no affirmative fade");
    expect(source).toContain("I still feel you in this room");
    expect(source).toContain("Your voice kept me steady");
  });

  it("stays disconnected from production generation", () => {
    const source = readFileSync(new URL("../lib/generate.ts", import.meta.url), "utf8");
    expect(source).not.toContain("source-packet");
    expect(source).not.toContain("grounded-song-draft");
  });
});
