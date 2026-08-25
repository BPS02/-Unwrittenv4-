import { generateMockLyrics } from "./mock";
import { buildMockStylePrompt } from "./mock";
import {
  OpenRouterError,
  chatComplete,
  getLyricsModel,
  getModel,
  isOpenRouterConfigured,
} from "./openrouter";
import {
  GUIDE_SYSTEM_PROMPT,
  buildGeneratorUserPrompt,
  buildGuideBriefUserPrompt,
  buildGuideQuestionsUserPrompt,
  parseBriefCompletion,
  parseGeneratorCompletion,
  parseQuestionsCompletion,
} from "./prompts";
import { getManagedPrompt, startGeneration } from "./langfuse";
import { genreGeneratorFallback, genreGeneratorPromptName } from "./genre-prompts";
import { MIN_QUESTIONS, type SongQuestion } from "./types";
import type { LyricsRequestParsed, QuestionsRequestParsed } from "./validation";

/**
 * Shared generation core.
 *
 * The web API routes and the MCP server both call these, so a song made
 * through Claude is produced exactly like one made on the site — same
 * managed prompts, same models, same tracing.
 *
 * The GUIDE asks follow-up questions and assembles the song brief. The chosen
 * genre then selects one specialized GENERATOR prompt, which writes title,
 * production STYLE brief, and lyrics in one completion.
 */

/** Managed prompt names, overridable per deployment. */
function guidePromptName(): string {
  return process.env.LANGFUSE_GUIDE_PROMPT_NAME || "unwritten-guide";
}

export interface LyricsOutcome {
  mode: "demo" | "live";
  title: string;
  lyrics: string;
  /** The production brief the generator wrote for the music provider. */
  style: string;
  model?: string;
}

/**
 * The guide's second task: put the thought, feelings, details, and answers
 * together into one song brief for the generator. Best-effort by design —
 * on any failure the caller hands the generator the raw sections instead,
 * so lyrics are never blocked on the assembly step.
 */
async function assembleSongBrief(req: LyricsRequestParsed, personalMemory: string[]): Promise<string | null> {
  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(guidePromptName(), GUIDE_SYSTEM_PROMPT);
  const userPrompt = buildGuideBriefUserPrompt(req, personalMemory);
  const model = promptConfig.model ?? getModel();
  const trace = startGeneration({
    name: "unwritten-guide-brief",
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: {
      templateId: req.input.templateId ?? null,
      promptSource,
      answeredQuestions: (req.input.answers ?? []).filter((a) => a.answer.trim().length > 0).length,
    },
  });

  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      // Assembly, not invention — keep it close to the writer's words.
      temperature: promptConfig.temperature ?? 0.4,
      maxTokens: promptConfig.maxTokens ?? 500,
      reasoning: promptConfig.reasoning,
      // The generator call still has to fit in the same request window.
      timeoutMs: 15_000,
    });
    const brief = parseBriefCompletion(completion.text);
    trace.end(completion.text, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    return brief;
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "brief failed");
    await trace.flush();
    console.error("[generate] song brief fallback (raw sections):", err);
    return null;
  }
}

/**
 * Writes the song (LLM when configured, deterministic demo otherwise):
 * guide assembles the brief, then the generator writes title, STYLE
 * production brief, and lyrics in one completion.
 */
export async function generateLyrics(req: LyricsRequestParsed, personalMemory: string[] = []): Promise<LyricsOutcome> {
  if (!isOpenRouterConfigured()) {
    const { title, lyrics } = generateMockLyrics(req);
    return {
      mode: "demo",
      title,
      lyrics,
      style: buildMockStylePrompt({ title, controls: req.controls }),
    };
  }

  const brief = await assembleSongBrief(req, personalMemory);

  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(
    genreGeneratorPromptName(req.controls.genre),
    genreGeneratorFallback(req.controls.genre)
  );
  const userPrompt = buildGeneratorUserPrompt(req, brief, personalMemory);
  const model = promptConfig.model ?? getLyricsModel();
  const trace = startGeneration({
    name: `unwritten-generator-${req.controls.genre}`,
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: {
      templateId: req.input.templateId ?? null,
      promptSource,
      briefAssembled: brief !== null,
      genre: req.controls.genre,
      mood: req.controls.mood,
    },
  });

  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      temperature: promptConfig.temperature ?? 0.85,
      maxTokens: promptConfig.maxTokens ?? 1600,
      reasoning: promptConfig.reasoning,
      // Leave enough room (after the brief call) for parsing and a helpful
      // JSON error response before the Vercel function deadline.
      timeoutMs: 40_000,
    });
    trace.end(completion.text, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    const { title, style, lyrics } = parseGeneratorCompletion(completion.text);
    return {
      mode: "live",
      title,
      lyrics,
      // A completion that dropped its STYLE line still renders: the
      // deterministic brief is an honest fallback, never a failed song.
      style: style || buildMockStylePrompt({ title, controls: req.controls }),
      model: completion.model,
    };
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "lyrics failed");
    await trace.flush();
    throw err;
  }
}

export interface QuestionsOutcome {
  questions: SongQuestion[];
  model?: string;
}

/**
 * Writes the follow-up questions shown between "Shape" and "Lyrics".
 *
 * Unlike lyrics and the style brief, this has NO deterministic fallback by
 * design: a canned list would ask everyone the same thing, which is the one
 * thing the step exists to avoid. So an unconfigured or failing OpenRouter
 * surfaces as an error the UI reports, rather than as generic questions the
 * writer would reasonably assume were written for them.
 */
export async function generateQuestions(req: QuestionsRequestParsed): Promise<QuestionsOutcome> {
  if (!isOpenRouterConfigured()) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }

  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(guidePromptName(), GUIDE_SYSTEM_PROMPT);
  const userPrompt = buildGuideQuestionsUserPrompt(req);
  const model = promptConfig.model ?? getModel();
  const trace = startGeneration({
    name: "unwritten-guide-questions",
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: {
      templateId: req.input.templateId ?? null,
      promptSource,
      genre: req.controls.genre,
      mood: req.controls.mood,
    },
  });

  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      temperature: promptConfig.temperature ?? 0.8,
      maxTokens: promptConfig.maxTokens ?? 400,
      reasoning: promptConfig.reasoning,
    });
    const questions = parseQuestionsCompletion(completion.text);
    if (questions.length < MIN_QUESTIONS) {
      // Too few parsed means the contract drifted badly — treat it as a
      // failure so the UI offers a retry instead of a one-question step.
      throw new OpenRouterError("The model didn't return a usable set of questions.");
    }
    trace.end(completion.text, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    return { questions, model: completion.model };
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "questions failed");
    await trace.flush();
    throw err;
  }
}

export interface StylePromptOutcome {
  stylePrompt: string;
  promptMode: "demo" | "live";
}

/**
 * Resolves the production brief handed to the music provider.
 *
 * There is no music LLM call in V4: the generator already wrote the STYLE
 * brief alongside the lyrics, and it travels with the render request. This
 * only falls back to the deterministic brief when no style travelled with
 * the song (an old draft, or a caller that skipped write_lyrics).
 */
export function resolveStylePrompt(req: {
  title: string;
  style?: string;
  controls: LyricsRequestParsed["controls"];
}): StylePromptOutcome {
  const style = req.style?.trim();
  if (style && style.length > 0) return { stylePrompt: style, promptMode: "live" };
  return {
    stylePrompt: buildMockStylePrompt({ title: req.title, controls: req.controls }),
    promptMode: "demo",
  };
}
