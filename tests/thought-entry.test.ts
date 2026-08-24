import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SENTENCE_STARTERS } from "@/components/HomeEntry";
import { DRAFT_KEY, packExpiring, unpackExpiring } from "@/lib/draft-storage";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("thought entry state model", () => {
  it("uses the chosen twilight artwork as the opening background", () => {
    expect(source("app/globals.css")).toContain('url("/images/home-twilight.png")');
  });

  it("uses three tactile note-card starters on the journal home", () => {
    expect(SENTENCE_STARTERS).toHaveLength(3);
    expect(SENTENCE_STARTERS.every((starter) => starter.endsWith("…"))).toBe(true);
    expect(source("components/HomeEntry.tsx")).toContain('className="home-notes"');
  });

  it("uses a single expiring creation draft and no temporary thought record", () => {
    expect(DRAFT_KEY).toBe("liner-notes:draft:v2");
    expect(source("lib/draft-storage.ts")).not.toContain("PENDING_THOUGHT");
    const packed = packExpiring({ step: "shape", input: { thought: "private words stay private" } }, 100);
    expect(unpackExpiring(packed, 101)).toMatchObject({ step: "shape" });
  });

  it("routes templates through a dedicated screen without sensitive query parameters", () => {
    expect(source("components/HomeEntry.tsx")).toContain('router.push("/create/start")');
    expect(source("components/HomeEntry.tsx")).not.toMatch(/router\.push\([^)]*(?:thought|feelings|lyrics)/i);
    expect(source("app/create/start/page.tsx")).toContain("StartingPointsScreen");
  });

  it("requires both a thought and details to weave in before shaping", () => {
    const flow = source("components/CreateFlow.tsx");
    expect(flow).toContain("function validateContext()");
    // Both blockers are evaluated on the same click, so the user sees every
    // missing field at once rather than being stopped twice.
    expect(flow).toMatch(/const thoughtOk = validateThought\(\)[\s\S]{0,120}const contextOk = validateContext\(\)/);
    expect(flow).toMatch(/if \(!thoughtOk \|\| !contextOk\) return;/);
    // Typing in either field clears its own error.
    expect(flow).toContain("if (patch.context !== undefined) setContextError(null);");

    const step = source("components/WriteStep.tsx");
    expect(step).toContain("Details to weave in<span className=\"write-required\">Required</span>");
    // The button must never be a silent dead end.
    expect(step).not.toMatch(/btn-continue[^>]*disabled/);
  });

  it("keeps feelings optional — they are never a gate", () => {
    const flow = source("components/CreateFlow.tsx");
    expect(flow).not.toMatch(/validate(Feelings|Feeling)\s*\(/);
    expect(source("components/WriteStep.tsx")).toContain('How does it feel?<span className="write-optional">Optional</span>');
  });

  it("keeps template clear and full reset as distinct actions", () => {
    const flow = source("components/CreateFlow.tsx");
    expect(flow).toContain("const clearedInput");
    expect(flow).toContain("sessionStorage.removeItem(DRAFT_KEY)");
    expect(flow).toContain('router.push("/")');
  });
});
