import { assembleCountryFolkPrompt, type CountryFolkPromptRequest } from "./songwriting-prompt";
import {
  buildClaimsAuditUserPrompt,
  parseClaimsAudit,
  SONG_CLAIMS_AUDIT_SYSTEM_PROMPT,
  validateSongOutput,
  type ClaimsAuditReport,
  type SongValidationInput,
  type SongValidationReport,
} from "./song-validator";

export const SONG_EVALUATION_VERSION = "song-evaluation.v1" as const;

export interface EvaluationCompletion {
  text: string;
  model?: string;
}

export type EvaluationModel = (request: {
  system: string;
  user: string;
  purpose: "songwriter" | "claims_audit";
}) => Promise<EvaluationCompletion>;

export interface CountryFolkEvaluationRequest extends CountryFolkPromptRequest {
  complete: EvaluationModel;
  validationContext?: Pick<SongValidationInput, "privateNames" | "privatePlaces" | "prohibitedArtists">;
}

export interface SongEvaluationReport {
  version: typeof SONG_EVALUATION_VERSION;
  storyMapId: string;
  passed: boolean;
  candidate: string;
  models: { songwriter?: string; claimsAudit?: string };
  mechanical: SongValidationReport;
  claimsAudit: ClaimsAuditReport | null;
  stoppedAfter: "mechanical" | "claims_audit" | "passed";
}

/** Staging-only evaluation. Production routes intentionally do not call this. */
export async function evaluateCountryFolkSong(req: CountryFolkEvaluationRequest): Promise<SongEvaluationReport> {
  const prompt = assembleCountryFolkPrompt(req);
  const candidate = await req.complete({ system: prompt.system, user: prompt.user, purpose: "songwriter" });
  const mechanical = validateSongOutput({
    raw: candidate.text,
    storyMap: req.storyMap,
    ...req.validationContext,
  });
  if (!mechanical.passed) {
    return {
      version: SONG_EVALUATION_VERSION,
      storyMapId: req.storyMap.story_map_id,
      passed: false,
      candidate: candidate.text,
      models: { songwriter: candidate.model },
      mechanical,
      claimsAudit: null,
      stoppedAfter: "mechanical",
    };
  }

  const auditCompletion = await req.complete({
    system: SONG_CLAIMS_AUDIT_SYSTEM_PROMPT,
    user: buildClaimsAuditUserPrompt(req.storyMap, extractLyrics(candidate.text)),
    purpose: "claims_audit",
  });
  const claimsAudit = parseClaimsAudit(auditCompletion.text);
  return {
    version: SONG_EVALUATION_VERSION,
    storyMapId: req.storyMap.story_map_id,
    passed: claimsAudit.passed,
    candidate: candidate.text,
    models: { songwriter: candidate.model, claimsAudit: auditCompletion.model },
    mechanical,
    claimsAudit,
    stoppedAfter: claimsAudit.passed ? "passed" : "claims_audit",
  };
}

export interface EvaluationBatchSummary {
  version: typeof SONG_EVALUATION_VERSION;
  total: number;
  passed: number;
  failedMechanical: number;
  failedClaimsAudit: number;
  readyForHumanReview: boolean;
  failedStoryMapIds: string[];
}

export function summarizeSongEvaluations(reports: SongEvaluationReport[]): EvaluationBatchSummary {
  const failed = reports.filter((report) => !report.passed);
  return {
    version: SONG_EVALUATION_VERSION,
    total: reports.length,
    passed: reports.filter((report) => report.passed).length,
    failedMechanical: reports.filter((report) => report.stoppedAfter === "mechanical").length,
    failedClaimsAudit: reports.filter((report) => report.stoppedAfter === "claims_audit").length,
    readyForHumanReview: reports.length > 0 && failed.length === 0,
    failedStoryMapIds: failed.map((report) => report.storyMapId),
  };
}

function extractLyrics(candidate: string): string {
  const match = candidate.replace(/\r\n/g, "\n").match(/(?:^|\n)LYRICS:[ \t]*\n[ \t\n]*([\s\S]+)$/);
  if (!match) throw new Error("A mechanically valid candidate must contain LYRICS.");
  return match[1]!.trim();
}
