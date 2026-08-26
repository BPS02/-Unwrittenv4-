import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approveStoryMap, updateStoryMapPrivacy, updateStoryMapText } from "@/lib/story-map-approval";
import { storyMapSchema } from "@/lib/story-map";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")
)[0].story_map;
const draft = storyMapSchema.parse({ ...fixture, status: "draft" });

describe("story-approval.v1", () => {
  it("approves a valid draft and nothing else", () => {
    expect(approveStoryMap(draft).status).toBe("approved");
    expect(() => approveStoryMap({ ...draft, status: "approved" })).toThrow(/draft/i);
  });

  it("blocks approval while a contradiction remains", () => {
    expect(() => approveStoryMap(draft, [
      { type: "contradiction", summary: "Two answers disagree.", answer_ids: ["a1", "a2"] },
    ])).toThrow(/contradictory/i);
  });

  it("turns an emptied field into the explicit none value", () => {
    expect(updateStoryMapText(draft, "central_place", "   ").building_blocks.central_place).toBe("none");
  });

  it("updates privacy gates and deduplicates private details", () => {
    const updated = updateStoryMapPrivacy(draft, {
      names: false, places: true, mustNotUse: ["Private detail", " private detail ", ""],
    });
    expect(updated.permissions).toMatchObject({ names: false, places: true });
    expect(updated.must_not_use).toEqual(["Private detail"]);
  });
});

describe("StoryMapReview component contract", () => {
  const source = readFileSync(new URL("../components/StoryMapReview.tsx", import.meta.url), "utf8");
  it("uses the required human approval language and separates facts from interpretations", () => {
    expect(source).toContain("Here&apos;s what I heard");
    expect(source).toContain("What you told us");
    expect(source).toContain("What we inferred");
    expect(source).toContain("What should stay private?");
  });
  it("enters the live creation flow only behind the grounded feature flag", () => {
    // Checkpoint 37 wired the review into CreateFlow by founder decision; the
    // classic flow stays untouched until NEXT_PUBLIC_GROUNDED_FLOW is set.
    const flow = readFileSync(new URL("../components/CreateFlow.tsx", import.meta.url), "utf8");
    expect(flow).toContain("StoryMapReview");
    expect(flow).toContain('process.env.NEXT_PUBLIC_GROUNDED_FLOW === "1"');
    expect(flow).toContain("groundedFlow && review");
  });
});
