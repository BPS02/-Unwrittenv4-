import { describe, expect, it } from "vitest";
import {
  CLAIMS_RECONCILIATION_VERSION,
  parseClaimsAudit,
  reconcileClaimsAudit,
  type SongClaim,
} from "@/lib/song-validator";
import type { GroundedSongDraft } from "@/lib/grounded-song-draft";
import type { SourcePacketV1 } from "@/lib/source-packet";

/**
 * claims-reconciliation.v1 — deterministic reconciliation of the model
 * auditor's invention flags against exact-policy line citations.
 *
 * The auditor sometimes rejects a lyric excerpt that is demonstrably
 * authorized: the line cites an exact-policy atom AND contains its verbatim
 * text AND the flagged excerpt lies inside that verbatim. Only that provable
 * case may be cleared. Everything ambiguous stays blocking, and semantic
 * invention checks are never weakened.
 */

const packet = {
  version: "source-packet.v2",
  storyMapId: "sm_test_reconciliation",
  atoms: [
    {
      id: "src_01",
      path: "building_blocks.central_memory",
      text: "learning to drive together in the old truck",
      kind: "confirmed",
      citationPolicy: "direct_paraphrase",
    },
    {
      id: "src_02",
      path: "building_blocks.exact_phrases[0]",
      text: "you still tell me when to brake",
      kind: "exact_phrase",
      citationPolicy: "exact",
      verbatim: "you still tell me when to brake",
    },
    {
      id: "src_03",
      path: "current_state.feeling",
      text: "grateful the roles reversed gently",
      kind: "confirmed",
      citationPolicy: "direct_paraphrase",
    },
  ],
} as unknown as SourcePacketV1;

function draftWith(sections: GroundedSongDraft["sections"]): GroundedSongDraft {
  return {
    version: "grounded-draft.v5",
    title: "Reconciliation Test",
    style: "Acoustic folk; 82 BPM, G major; end on one guitar chord.",
    sections,
  } as GroundedSongDraft;
}

function auditWith(flags: Array<Pick<SongClaim, "claim" | "lyric_excerpt">>) {
  return parseClaimsAudit(
    JSON.stringify({
      claims: flags.map((flag) => ({ ...flag, story_map_path: null })),
    })
  );
}

describe("claims-reconciliation.v1", () => {
  it("clears a false-positive flag when the line cites the exact atom and contains its verbatim text", () => {
    const draft = draftWith([
      {
        label: "Chorus",
        lines: [{ text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "exact" }],
      },
    ]);
    const audit = auditWith([
      { claim: "The other person still gives braking advice", lyric_excerpt: "you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.version).toBe(CLAIMS_RECONCILIATION_VERSION);
    expect(result.passed).toBe(true);
    expect(result.inventionFlags).toHaveLength(0);
    expect(result.clearedFlags).toHaveLength(1);
    expect(result.clearedFlags[0]?.atomId).toBe("src_02");
  });

  it("does not clear a flag because the exact atom is cited on a different line", () => {
    const draft = draftWith([
      {
        label: "Verse 1",
        // This line contains the text but does NOT cite the exact atom.
        lines: [{ text: "You still tell me when to brake", source_ids: ["src_01"], treatment: "paraphrase" }],
      },
      {
        label: "Chorus",
        // The exact atom is cited here, on an entirely different line.
        lines: [{ text: "The old truck taught us both", source_ids: ["src_02"], treatment: "paraphrase" }],
      },
    ]);
    const audit = auditWith([
      { claim: "The other person still gives braking advice", lyric_excerpt: "you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(false);
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.clearedFlags).toHaveLength(0);
  });

  it("keeps blocking an unrelated invented claim on a line that also contains the exact text", () => {
    const draft = draftWith([
      {
        label: "Chorus",
        lines: [
          {
            text: "You still tell me when to brake, and you fixed the fence",
            source_ids: ["src_02", "src_01"],
            treatment: "exact",
          },
        ],
      },
    ]);
    const audit = auditWith([
      { claim: "The other person fixed the fence", lyric_excerpt: "you fixed the fence" },
      { claim: "The other person still gives braking advice", lyric_excerpt: "you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    // The exact phrase clears; the invented fence claim on the same line stays.
    expect(result.passed).toBe(false);
    expect(result.clearedFlags).toHaveLength(1);
    expect(result.clearedFlags[0]?.flag.lyric_excerpt).toBe("you still tell me when to brake");
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.inventionFlags[0]?.lyric_excerpt).toBe("you fixed the fence");
  });

  it("does not count approximate text as verbatim", () => {
    const draft = draftWith([
      {
        label: "Chorus",
        // "still" is missing: the line cites the exact atom but does not
        // contain its verbatim text, so nothing here is provably authorized.
        lines: [{ text: "You tell me when to brake", source_ids: ["src_02"], treatment: "exact" }],
      },
    ]);
    const audit = auditWith([
      { claim: "The other person gives braking advice", lyric_excerpt: "you tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(false);
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.clearedFlags).toHaveLength(0);
  });

  it("keeps blocking an excerpt that matches no grounded line", () => {
    const draft = draftWith([
      {
        label: "Chorus",
        lines: [{ text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "exact" }],
      },
    ]);
    const audit = auditWith([{ claim: "There is a river out back", lyric_excerpt: "the river out back" }]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(false);
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.clearedFlags).toHaveLength(0);
  });

  it("keeps blocking an excerpt when any matching line lacks its own exact-citation proof", () => {
    const draft = draftWith([
      {
        label: "Verse 1",
        lines: [{ text: "I remember when to brake alone", source_ids: ["src_01"], treatment: "paraphrase" }],
      },
      {
        label: "Chorus",
        lines: [{ text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "exact" }],
      },
    ]);
    // "when to brake" also appears in an unproven verse line — the flag may
    // refer to that one, so it must remain blocking even though the chorus
    // line would clear.
    const audit = auditWith([{ claim: "Braking advice continues", lyric_excerpt: "when to brake" }]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(false);
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.clearedFlags).toHaveLength(0);
  });

  it("clears an excerpt matching several textual variants when every variant is independently proven", () => {
    // The live full-Sonnet run rendered the authorized hook two ways — with
    // and without a leading "But" — both citing the exact atom. v1 read that
    // as ambiguity and blocked a provably authorized phrase; v2 requires
    // every candidate to carry its own proof and then clears.
    const draft = draftWith([
      {
        label: "Chorus",
        lines: [
          { text: "But you still tell me when to brake", source_ids: ["src_02"], treatment: "exact" },
          { text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "refrain" },
        ],
      },
    ]);
    const audit = auditWith([
      { claim: "The other person still gives braking advice", lyric_excerpt: "you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(true);
    expect(result.clearedFlags).toHaveLength(1);
    expect(result.clearedFlags[0]?.atomId).toBe("src_02");
  });

  it("does not clear an excerpt that extends beyond the verbatim, even on a proven line", () => {
    // The live sm_01 shape: the excerpt covers the verbatim PLUS an extra
    // word from the line. The extra word sits outside the authorized text,
    // so this stays blocking — conservatism over recall.
    const draft = draftWith([
      {
        label: "Chorus",
        lines: [{ text: "Now you still tell me when to brake", source_ids: ["src_02"], treatment: "exact" }],
      },
    ]);
    const audit = auditWith([
      { claim: "The braking advice happens now", lyric_excerpt: "now you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(false);
    expect(result.inventionFlags).toHaveLength(1);
    expect(result.clearedFlags).toHaveLength(0);
  });

  it("treats an identically repeated refrain line as one line, not an ambiguity", () => {
    const refrain = { text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "exact" as const };
    const draft = draftWith([
      { label: "Chorus", lines: [{ ...refrain }] },
      { label: "Final Chorus", lines: [{ ...refrain }] },
    ]);
    const audit = auditWith([
      { claim: "The other person still gives braking advice", lyric_excerpt: "you still tell me when to brake" },
    ]);
    const result = reconcileClaimsAudit(audit, draft, packet);
    expect(result.passed).toBe(true);
    expect(result.clearedFlags).toHaveLength(1);
  });

  it("passes trivially when the audit raised no flags", () => {
    const draft = draftWith([
      { label: "Chorus", lines: [{ text: "You still tell me when to brake", source_ids: ["src_02"], treatment: "exact" }] },
    ]);
    const result = reconcileClaimsAudit(parseClaimsAudit(JSON.stringify({ claims: [] })), draft, packet);
    expect(result.passed).toBe(true);
    expect(result.inventionFlags).toHaveLength(0);
    expect(result.clearedFlags).toHaveLength(0);
  });
});
