import {
  buildGroundedDraftUserPrompt,
  buildGroundedRepairUserPrompt,
  GROUNDED_DRAFT_SYSTEM_PROMPT,
  GROUNDED_DRAFT_VERSION,
  GROUNDED_REPAIR_SYSTEM_PROMPT,
  GROUNDED_REPAIR_VERSION,
  GroundedCitationError,
  normalizeGroundedDraftMechanically,
  parseGroundedDraft,
  renderGroundedDraft,
  type GroundedSongDraft,
} from "./grounded-song-draft";
import { buildSourcePacket, SOURCE_PACKET_VERSION, type SourcePacketV1 } from "./source-packet";
import {
  buildClaimsAuditUserPrompt,
  CLAIMS_RECONCILIATION_VERSION,
  parseClaimsAudit,
  reconcileClaimsAudit,
  SONG_CLAIMS_AUDIT_SYSTEM_PROMPT,
  SONG_CLAIMS_AUDIT_VERSION,
  SONG_VALIDATOR_VERSION,
  validateSongOutput,
  type ClaimsAuditReport,
  type ClaimsReconciliationReport,
  type SongValidationInput,
  type SongValidationReport,
} from "./song-validator";
import { ZodError } from "zod";
import type { StoryMapV1 } from "./story-map";

export const GROUNDED_PIPELINE_VERSION = "grounded-pipeline.v13" as const;

export type GroundedPipelinePurpose = "grounded_draft" | "claims_audit" | "grounded_repair";
export type GroundedPipelineModel = (request: {
  purpose: GroundedPipelinePurpose;
  system: string;
  user: string;
}) => Promise<{ text: string; model?: string }>;

export interface GroundedPipelineRequest {
  storyMap: StoryMapV1;
  productionModules: string;
  complete: GroundedPipelineModel;
  validationContext?: Pick<SongValidationInput, "privateNames" | "privatePlaces" | "prohibitedArtists">;
}

export interface GroundedPipelineAttempt {
  number: 1 | 2;
  /** Null when the model's completion was not a valid draft JSON object —
   *  recorded as a failed `draft.parse` mechanical check, never a crash. */
  draft: GroundedSongDraft | null;
  /** The provider-facing render, or the raw completion when unparseable. */
  rendered: string;
  mechanical: SongValidationReport;
  /** The model auditor's raw report — preserved as evidence, never edited. */
  claimsAudit: ClaimsAuditReport | null;
  /** Deterministic reconciliation of the audit's invention flags against
   *  exact-policy line citations. This, not the raw audit, decides passage. */
  reconciliation: ClaimsReconciliationReport | null;
  passed: boolean;
}

export interface GroundedPipelineReport {
  version: typeof GROUNDED_PIPELINE_VERSION;
  promptVersions: {
    sourcePacket: typeof SOURCE_PACKET_VERSION;
    draft: typeof GROUNDED_DRAFT_VERSION;
    validator: typeof SONG_VALIDATOR_VERSION;
    claimsAudit: typeof SONG_CLAIMS_AUDIT_VERSION;
    reconciliation: typeof CLAIMS_RECONCILIATION_VERSION;
    repair: typeof GROUNDED_REPAIR_VERSION;
  };
  storyMapId: string;
  sourcePacket: SourcePacketV1;
  passed: boolean;
  repaired: boolean;
  finalSong: string | null;
  attempts: GroundedPipelineAttempt[];
  models: Partial<Record<GroundedPipelinePurpose, string>>;
}

/** Staging-only. Runs at most one repair and never calls the live generation route. */
export async function runGroundedSongPipeline(req: GroundedPipelineRequest): Promise<GroundedPipelineReport> {
  const sourcePacket = buildSourcePacket(req.storyMap);
  const models: GroundedPipelineReport["models"] = {};
  const draftCompletion = await req.complete({
    purpose: "grounded_draft",
    system: GROUNDED_DRAFT_SYSTEM_PROMPT,
    user: buildGroundedDraftUserPrompt(sourcePacket, req.productionModules),
  });
  if (draftCompletion.model) models.grounded_draft = draftCompletion.model;
  const firstParsed = normalizeForPipeline(parseForPipeline(draftCompletion.text, sourcePacket), sourcePacket);
  const first = await inspectAttempt(1, firstParsed, sourcePacket, req, models);
  if (first.passed) return buildReport(req, sourcePacket, models, [first], false);

  const repairCompletion = await req.complete({
    purpose: "grounded_repair",
    system: GROUNDED_REPAIR_SYSTEM_PROMPT,
    user: buildGroundedRepairUserPrompt({
      // An unparseable draft is handed to the one repair as raw text so it
      // can rebuild a valid object; anything else repairs the parsed draft.
      packet: sourcePacket,
      draft: firstParsed.draft ?? { malformedText: firstParsed.raw },
      // Repair only what reconciliation left blocking — a cleared false
      // positive must not be "fixed" back out of the song.
      inventionFlags: first.reconciliation?.inventionFlags ?? [],
      failedChecks: first.mechanical.checks.filter((check) => !check.passed),
    }),
  });
  if (repairCompletion.model) models.grounded_repair = repairCompletion.model;
  const repairedParsed = normalizeForPipeline(parseForPipeline(repairCompletion.text, sourcePacket), sourcePacket);
  const second = await inspectAttempt(2, repairedParsed, sourcePacket, req, models);
  return buildReport(req, sourcePacket, models, [first, second], true);
}

interface ParsedPipelineDraft {
  draft: GroundedSongDraft | null;
  /** The completion text the draft came from (normalized JSON after repair). */
  raw: string;
  citationFailure?: string;
  parseFailure?: string;
}

async function inspectAttempt(
  number: 1 | 2,
  parsed: ParsedPipelineDraft,
  sourcePacket: SourcePacketV1,
  req: GroundedPipelineRequest,
  models: GroundedPipelineReport["models"]
): Promise<GroundedPipelineAttempt> {
  const { draft } = parsed;
  const rendered = draft ? renderGroundedDraft(draft) : parsed.raw;
  let mechanical = validateSongOutput({ raw: rendered, storyMap: req.storyMap, ...req.validationContext });
  const deterministicFailures: Array<{ id: string; message: string }> = [];
  if (parsed.parseFailure) deterministicFailures.push({ id: "draft.parse", message: parsed.parseFailure });
  if (parsed.citationFailure) deterministicFailures.push({ id: "grounding.citation", message: parsed.citationFailure });
  if (deterministicFailures.length > 0) {
    mechanical = {
      ...mechanical,
      passed: false,
      checks: [
        ...mechanical.checks,
        ...deterministicFailures.map((failure) => ({ id: failure.id, passed: false, message: failure.message, path: "lyrics" as const })),
      ],
    };
  }
  if (!mechanical.passed || !draft) {
    return { number, draft, rendered, mechanical, claimsAudit: null, reconciliation: null, passed: false };
  }
  const auditCompletion = await req.complete({
    purpose: "claims_audit",
    system: SONG_CLAIMS_AUDIT_SYSTEM_PROMPT,
    user: buildClaimsAuditUserPrompt(sourcePacket, draft),
  });
  if (auditCompletion.model) models.claims_audit = auditCompletion.model;
  const claimsAudit = parseClaimsAudit(auditCompletion.text);
  const reconciliation = reconcileClaimsAudit(claimsAudit, draft, sourcePacket);
  return { number, draft, rendered, mechanical, claimsAudit, reconciliation, passed: reconciliation.passed };
}

function parseForPipeline(text: string, packet: SourcePacketV1): ParsedPipelineDraft {
  try {
    return { draft: parseGroundedDraft(text, packet), raw: text };
  } catch (error) {
    if (error instanceof GroundedCitationError) return { draft: error.draft, raw: text, citationFailure: error.message };
    // A malformed completion is a failed attempt, never a crashed run: it
    // becomes a draft.parse mechanical failure the one repair may fix.
    if (error instanceof SyntaxError || error instanceof ZodError) {
      const reason = error.message.split("\n")[0]?.slice(0, 200) ?? "invalid JSON";
      return { draft: null, raw: text, parseFailure: `The draft completion is not a valid grounded-draft JSON object: ${reason}` };
    }
    throw error;
  }
}

function normalizeForPipeline(parsed: ParsedPipelineDraft, packet: SourcePacketV1): ParsedPipelineDraft {
  if (!parsed.draft) return parsed;
  return parseForPipeline(JSON.stringify(normalizeGroundedDraftMechanically(parsed.draft, packet)), packet);
}

function buildReport(
  req: GroundedPipelineRequest,
  sourcePacket: SourcePacketV1,
  models: GroundedPipelineReport["models"],
  attempts: GroundedPipelineAttempt[],
  repaired: boolean
): GroundedPipelineReport {
  const final = attempts.at(-1)!;
  return {
    version: GROUNDED_PIPELINE_VERSION,
    promptVersions: {
      sourcePacket: SOURCE_PACKET_VERSION,
      draft: GROUNDED_DRAFT_VERSION,
      validator: SONG_VALIDATOR_VERSION,
      claimsAudit: SONG_CLAIMS_AUDIT_VERSION,
      reconciliation: CLAIMS_RECONCILIATION_VERSION,
      repair: GROUNDED_REPAIR_VERSION,
    },
    storyMapId: req.storyMap.story_map_id,
    sourcePacket,
    passed: final.passed,
    repaired,
    finalSong: final.passed ? final.rendered : null,
    attempts,
    models,
  };
}
