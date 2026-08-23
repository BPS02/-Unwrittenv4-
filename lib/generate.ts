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
  GENERATOR_SYSTEM_PROMPT,
  GUIDE_SYSTEM_PROMPT,
  STARTING_POINTS_SYSTEM_PROMPT,
  TEMPLATE_THOUGHT_SYSTEM_PROMPT,
  buildGeneratorUserPrompt,
  buildGuideBriefUserPrompt,
  buildGuideQuestionsUserPrompt,
  buildStartingPointsUserPrompt,
  buildTemplateThoughtUserPrompt,
  cleanTemplateThought,
  parseBriefCompletion,
  parseGeneratorCompletion,
  parseQuestionsCompletion,
  parseStartingPointsCompletion,
} from "./prompts";
import { getManagedPrompt, startGeneration } from "./langfuse";
import { MIN_QUESTIONS, type SongQuestion } from "./types";
import type { LyricsRequestParsed, QuestionsRequestParsed } from "./validation";

/**
 * Shared generation core.
 *
 * The web API routes and the MCP server both call these, so a song made
 * through Claude is produced exactly like one made on the site — same
 * managed prompts, same models, same tracing.
 *
 * The whole flow runs on TWO managed prompts (see lib/prompts.ts): the GUIDE
 * asks the follow-up questions and then puts everything the writer shared
 * together into a song brief; the GENERATOR turns that brief into the song —
 * title, production STYLE brief, and lyrics — in one completion.
 */

/** Managed prompt names, overridable per deployment. */
function guidePromptName(): string {
  return process.env.LANGFUSE_GUIDE_PROMPT_NAME || "unwritten-guide";
}
function generatorPromptName(): string {
  return process.env.LANGFUSE_GENERATOR_PROMPT_NAME || "unwritten-generator";
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
async function assembleSongBrief(req: LyricsRequestParsed): Promise<string | null> {
  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(guidePromptName(), GUIDE_SYSTEM_PROMPT);
  const userPrompt = buildGuideBriefUserPrompt(req);
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
export async function generateLyrics(req: LyricsRequestParsed): Promise<LyricsOutcome> {
  if (!isOpenRouterConfigured()) {
    const { title, lyrics } = generateMockLyrics(req);
    return {
      mode: "demo",
      title,
      lyrics,
      style: buildMockStylePrompt({ title, controls: req.controls }),
    };
  }

  const brief = await assembleSongBrief(req);

  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(generatorPromptName(), GENERATOR_SYSTEM_PROMPT);
  const userPrompt = buildGeneratorUserPrompt(req, brief);
  const model = promptConfig.model ?? getLyricsModel();
  const trace = startGeneration({
    name: "unwritten-generator",
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

export interface StartingPointsOutcome {
  points: Array<{ theme: string; tagline: string; feelings: string[] }>;
  mode: "demo" | "live";
}

/**
 * Writes the starting-point tiles themselves.
 *
 * Falls back to the shipped ten (the caller decides how) — a person who came
 * to write must never meet an empty gallery because a model was slow.
 */
export async function generateStartingPoints(params: {
  count: number;
  avoid?: readonly string[];
  variation: number;
}): Promise<StartingPointsOutcome> {
  if (!isOpenRouterConfigured()) return { points: [], mode: "demo" };

  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(
    process.env.LANGFUSE_STARTING_POINTS_PROMPT_NAME,
    STARTING_POINTS_SYSTEM_PROMPT
  );
  const userPrompt = buildStartingPointsUserPrompt(params);
  const model = promptConfig.model ?? getModel();
  const trace = startGeneration({
    name: "liner-notes-starting-points",
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: { promptSource, count: params.count, variation: params.variation },
  });

  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      temperature: promptConfig.temperature ?? 1,
      maxTokens: promptConfig.maxTokens ?? 700,
      reasoning: promptConfig.reasoning,
    });
    const points = parseStartingPointsCompletion(completion.text);
    trace.end(completion.text, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    // Return whatever parsed cleanly. Discarding eight good tiles because a
    // ninth row was malformed put the curated ten back on screen at random,
    // which reads as the feature not working — the caller tops up instead.
    if (points.length === 0) return { points: [], mode: "demo" };
    return { points: points.slice(0, params.count), mode: "live" };
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "starting points failed");
    await trace.flush();
    console.error("[generate] starting points fallback:", err);
    return { points: [], mode: "demo" };
  }
}

export interface TemplateThoughtOutcome {
  thought: string;
  /** "live" when a model wrote it, "demo" when the shipped starter was used. */
  mode: "demo" | "live";
  model?: string;
}

/**
 * Writes the opening thought a template drops into the box.
 *
 * Unlike the follow-up questions, this DOES fall back — every template already
 * ships a hand-written `starterThought`, so falling back to it is honest
 * rather than passing off a canned line as something written for this person.
 * The caller supplies that fallback; a failure here must never block someone
 * from starting a song.
 */
export async function generateTemplateThought(params: {
  theme: string;
  tagline: string;
  feelings: readonly string[];
  fallback: string;
  variation: number;
}): Promise<TemplateThoughtOutcome> {
  if (!isOpenRouterConfigured()) return { thought: params.fallback, mode: "demo" };

  const {
    text: systemPrompt,
    source: promptSource,
    config: promptConfig,
  } = await getManagedPrompt(
    process.env.LANGFUSE_TEMPLATE_PROMPT_NAME,
    TEMPLATE_THOUGHT_SYSTEM_PROMPT
  );
  const userPrompt = buildTemplateThoughtUserPrompt(params);
  const model = promptConfig.model ?? getModel();
  const trace = startGeneration({
    name: "liner-notes-template-thought",
    model,
    input: { system: systemPrompt, user: userPrompt },
    metadata: { promptSource, theme: params.theme, variation: params.variation },
  });

  try {
    const completion = await chatComplete({
      system: systemPrompt,
      user: userPrompt,
      model,
      // Warm — two people picking the same tile should not get the same line.
      temperature: promptConfig.temperature ?? 0.95,
      // Two to four sentences; the old 220 was sized for a single line.
      maxTokens: promptConfig.maxTokens ?? 300,
      reasoning: promptConfig.reasoning,
    });
    const thought = cleanTemplateThought(completion.text);
    trace.end(thought, {
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
    });
    await trace.flush();
    // An empty or absurdly long completion is worse than the shipped starter.
    if (thought.length < 20 || thought.length > 600) {
      return { thought: params.fallback, mode: "demo" };
    }
    return { thought, mode: "live", model: completion.model };
  } catch (err) {
    trace.error(err instanceof Error ? err.message : "template thought failed");
    await trace.flush();
    console.error("[generate] template thought fallback:", err);
    return { thought: params.fallback, mode: "demo" };
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
