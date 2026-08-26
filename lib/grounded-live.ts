import { getManagedPrompt, startGeneration } from "./langfuse";
import { chatComplete, getLyricsModel, getModel, isOpenRouterConfigured, OpenRouterError } from "./openrouter";
import {
  buildStoryExtractionUserPrompt,
  parseStoryMapExtraction,
  STORY_EXTRACTOR_SYSTEM_PROMPT,
  type StoryMapExtractionResult,
} from "./story-map-extraction";
import {
  GROUNDED_DRAFT_SYSTEM_PROMPT,
  GROUNDED_REPAIR_SYSTEM_PROMPT,
} from "./grounded-song-draft";
import { SONG_CLAIMS_AUDIT_SYSTEM_PROMPT } from "./song-validator";
import {
  runGroundedSongPipeline,
  type GroundedPipelineModel,
  type GroundedPipelineReport,
} from "./grounded-song-pipeline";
import { COUNTRY_FOLK_MODULE_PROMPT, soloVocalModulePrompt, type SoloLead } from "./songwriting-modules";
import { newStoryMapId } from "./story-maps-store";
import type { StoryMapV1 } from "./story-map";
import type { LyricsRequestParsed } from "./validation";

/**
 * The grounded flow's live entry points, used only by the /api/story-map and
 * /api/grounded-lyrics routes. Everything is gated behind GROUNDED_FLOW=1 so
 * the existing guide/generator flow stays the product until the flag flips.
 *
 * The three grounded prompts are fetched from Langfuse by their production
 * label, falling back to the in-repo contracts (which are byte-identical to
 * the promoted staging versions). lib/generate.ts remains untouched — the
 * source guards proving the classic flow never calls the grounded pipeline
 * still hold, because this module is imported by the new routes only.
 */

export function groundedFlowEnabled(): boolean {
  return process.env.GROUNDED_FLOW === "1";
}

/**
 * Turns the writer's interview into a draft Story Map. Like the follow-up
 * questions, this has NO deterministic fallback on purpose: a canned map
 * would be presented as "what I heard", which it is not.
 */
export async function extractStoryMapDraft(req: LyricsRequestParsed): Promise<StoryMapExtractionResult> {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }
  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(
    process.env.LANGFUSE_STORY_EXTRACTOR_PROMPT_NAME || "unwritten-story-extractor",
    STORY_EXTRACTOR_SYSTEM_PROMPT
  );
  const userPrompt = buildStoryExtractionUserPrompt(req);
  const model = promptConfig.model ?? getModel();
  const trace = startGeneration({
    name: "unwritten-story-extractor",
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: { promptSource, answeredQuestions: (req.input.answers ?? []).length },
  });
  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      temperature: promptConfig.temperature ?? 0.2,
      maxTokens: promptConfig.maxTokens ?? 1600,
      reasoning: promptConfig.reasoning,
      timeoutMs: 60_000,
    });
    const result = parseStoryMapExtraction(completion.text, newStoryMapId());
    trace.end(completion.text, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    return result;
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "story extraction failed");
    await trace.flush();
    throw err;
  }
}

export interface GroundedSongOutcome {
  passed: boolean;
  title: string | null;
  style: string | null;
  lyrics: string | null;
  model?: string;
  report: GroundedPipelineReport;
}

const GROUNDED_PROMPT_NAMES = {
  grounded_draft: ["unwritten-grounded-draft", GROUNDED_DRAFT_SYSTEM_PROMPT],
  grounded_repair: ["unwritten-grounded-repair", GROUNDED_REPAIR_SYSTEM_PROMPT],
  claims_audit: ["unwritten-claims-audit", SONG_CLAIMS_AUDIT_SYSTEM_PROMPT],
} as const;

/** Runs the bounded grounded pipeline for one approved Story Map. */
export async function generateGroundedSong(
  storyMap: StoryMapV1,
  lead: SoloLead = "female"
): Promise<GroundedSongOutcome> {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }
  const prompts = Object.fromEntries(
    await Promise.all(
      Object.entries(GROUNDED_PROMPT_NAMES).map(async ([purpose, [name, fallback]]) => {
        const managed = await getManagedPrompt(name, fallback);
        return [purpose, managed] as const;
      })
    )
  ) as Record<keyof typeof GROUNDED_PROMPT_NAMES, Awaited<ReturnType<typeof getManagedPrompt>>>;

  const complete: GroundedPipelineModel = async ({ purpose, user }) => {
    const managed = prompts[purpose];
    const result = await chatComplete({
      system: managed.text,
      user,
      model: managed.config.model ?? getLyricsModel(),
      temperature: managed.config.temperature ?? (purpose === "claims_audit" ? 0 : 0.45),
      maxTokens: managed.config.maxTokens ?? (purpose === "claims_audit" ? 2500 : 4000),
      reasoning: managed.config.reasoning,
      timeoutMs: 120_000,
    });
    return { text: result.text, model: result.model };
  };

  const report = await runGroundedSongPipeline({
    storyMap,
    productionModules: `${COUNTRY_FOLK_MODULE_PROMPT}\n\n${soloVocalModulePrompt(lead)}`,
    complete,
  });

  const finalDraft = report.passed ? report.attempts.at(-1)?.draft ?? null : null;
  return {
    passed: report.passed,
    title: finalDraft?.title ?? null,
    style: finalDraft?.style ?? null,
    lyrics: finalDraft
      ? finalDraft.sections
          .map((section) => `[${section.label}]\n${section.lines.map((line) => line.text).join("\n")}`)
          .join("\n\n")
      : null,
    model: report.models.grounded_draft,
    report,
  };
}
