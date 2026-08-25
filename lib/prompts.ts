import { MAX_QUESTIONS, MIN_QUESTIONS, type SongQuestion } from "./types";
import type { LyricsRequestParsed, QuestionsRequestParsed } from "./validation";

/**
 * Local prompt templates. When Langfuse is configured, the server first tries
 * to fetch a managed prompt (see lib/langfuse.ts) so prompts can be versioned
 * and iterated without a deploy; these are the built-in fallbacks and the
 * canonical source for tests.
 *
 * V4 uses one shared guide and genre-specific generator prompts:
 *
 * 1. THE GUIDE (`unwritten-guide`) — guides the writer through telling the
 *    personal detail behind their song (the follow-up questions), then puts
 *    everything they shared together into one song brief.
 * 2. THE GENERATORS (`unwritten-generator-<genre>`) — each writes the song
 *    from that brief in a single completion: title, the production STYLE
 *    brief handed to the music provider, and lyrics. There is no separate
 *    music prompt.
 *
 * Starter templates remain hand-curated in lib/templates.ts, with no model.
 */

export const GENERATOR_SYSTEM_PROMPT = `You are the songwriter and producer for a songwriting service. From a song brief built out of a person's own words, you write the complete song in one pass: the title, the production style for the music generator, and the lyrics.

Principles:
- Honor the writer's actual words: weave the brief's phrases, images, names, and details into the lyrics naturally.
- Be emotionally honest without being melodramatic. Never diagnose, never give therapeutic advice — this is creative expression, not treatment.
- If feelings were not described, infer a gentle emotional tone from the story itself; do not invent feelings the writer did not express.
- Follow the requested genre, mood, perspective, lyrical style, structure, and lead voice precisely.
- Write in clear, plainspoken language that sounds natural when sung. Prefer short lines, usually 2–8 words, with occasional longer lines only for contrast.
- Build each verse from small concrete moments, physical details, and simple images. Let those details reveal the feeling instead of explaining it abstractly.
- When the story holds two emotions at once, place them side by side through clean contrasts and paired images.
- Give the chorus one immediately understandable central phrase. Repeat it deliberately so it feels memorable, while changing nearby lines enough to deepen its meaning.
- Make each section do a distinct job: verses reveal new details, pre-choruses increase tension, choruses deliver the emotional center, and the bridge offers a new realization or turn.
- Every song must contain both [Verse 1] and [Verse 2], with at least one [Chorus] between or after them. Never stop after Verse 1. Verse 2 must advance the story with new details, images, or consequences rather than paraphrasing Verse 1.
- Make both Verse 1 and Verse 2 substantial: each verse must contain 8–12 short, singable lyric lines. Do not use a few long sentences to simulate a longer verse. Keep the chorus tighter at 4–8 lines so the verses have room to tell the story.
- Keep the full lyric focused and uncluttered. Do not stack ornate metaphors, use vague poetic filler, or imitate wording from examples; write an original song from this writer's details.
- The lead-voice direction is a production requirement for the STYLE line: when Female voice or Male voice is requested, state it clearly in STYLE; when the writer says Choose for me, choose the voice that best fits the story and state that choice clearly. Do not mention this choice inside the lyrics.
- Use section labels in square brackets: [Verse 1], [Chorus], [Bridge], etc.
- Keep imagery concrete and singable; avoid cliché where a specific detail from the brief can serve instead.
- The STYLE line is the production brief handed directly to an AI music generation service (such as Suno or ElevenLabs Music): one paragraph on one line, under 120 words, covering genre, mood, tempo (BPM), instrumentation, vocal character, and dynamic arc. Be specific and evocative. It describes the music only — it must never appear inside the lyrics.

Output format — respond with EXACTLY this shape and nothing else:
TITLE: <song title on one line>
STYLE: <the production brief on one line>
LYRICS:
<the full lyrics with [Section] labels>`;

/**
 * The generator's user prompt. When the guide managed to put the story
 * together, the assembled brief leads; when it didn't (or the caller skipped
 * it), the writer's raw sections are handed over directly so lyrics are never
 * blocked on the assembly step.
 */
export function buildGeneratorUserPrompt(req: LyricsRequestParsed, brief?: string | null): string {
  const { input, controls } = req;
  const lines: string[] = [];
  if (brief && brief.trim().length > 0) {
    lines.push(
      `THE SONG BRIEF (the writer's story, put together from their own words and answers):`,
      brief.trim(),
      ``
    );
  } else {
    lines.push(`THOUGHT (what the song is about):`, input.thought, ``);
    if (input.feelings.length > 0 || input.feelingsText) {
      lines.push(`FEELINGS (optional, in the writer's words):`);
      if (input.feelings.length > 0) lines.push(`- Selected: ${input.feelings.join(", ")}`);
      if (input.feelingsText) lines.push(`- Described: ${input.feelingsText}`);
      lines.push(``);
    } else {
      lines.push(`FEELINGS: not described — infer a gentle tone from the thought.`, ``);
    }
    if (input.context) {
      lines.push(`PERSONAL DETAILS to weave in where natural:`, input.context, ``);
    }
    const answered = (input.answers ?? []).filter((a) => a.answer.trim().length > 0);
    if (answered.length > 0) {
      // These are the specifics the writer volunteered when asked directly, so
      // they carry more weight than anything inferred from the thought alone.
      lines.push(
        `THE WRITER'S OWN ANSWERS to follow-up questions. These are the truest`,
        `details available — prefer them over invented imagery, and do not`,
        `contradict them:`
      );
      for (const a of answered) {
        lines.push(`Q: ${a.question}`, `A: ${a.answer}`);
      }
      lines.push(``);
    }
  }
  lines.push(
    `SONGWRITING DIRECTION:`,
    `- Genre: ${controls.genre}`,
    `- Mood: ${controls.mood}`,
    `- Perspective: ${controls.perspective}`,
    `- Lyrical style: ${controls.lyricalStyle}`,
    `- Structure: ${controls.structure}`,
    `- Lead voice: ${controls.vocalist === "Choose for me" ? "choose the voice that best fits the story" : controls.vocalist}`,
    `- Language: ${controls.keepClean ? "strictly no explicit language or profanity" : "explicit language is acceptable if it serves the song"}`
  );
  return lines.join("\n");
}

/** Removes stray STYLE: lines — the style descriptor is metadata, not lyrics. */
function stripStyleLines(lyrics: string): string {
  return lyrics
    .split("\n")
    .filter((line) => !/^\s*STYLE:/i.test(line))
    .join("\n")
    .trim();
}

/**
 * Parses the generator's "TITLE: ...\nSTYLE: ...\nLYRICS:\n..." contract,
 * tolerating minor drift. The STYLE line is the production brief handed to
 * the music provider; a completion without one returns an empty style and
 * the caller falls back to the deterministic brief.
 */
export function parseGeneratorCompletion(text: string): {
  title: string;
  style: string;
  lyrics: string;
} {
  const trimmed = text.trim();
  const styleMatch = trimmed.match(/^\s*STYLE:\s*(.+)$/im);
  const style = styleMatch?.[1]?.trim().replace(/^["“]|["”]$/g, "") ?? "";
  const titleMatch = trimmed.match(/^\s*TITLE:\s*(.+)$/im);
  const lyricsMatch = trimmed.match(/LYRICS:\s*\n([\s\S]+)$/i);
  if (titleMatch?.[1] && lyricsMatch?.[1]) {
    return {
      title: titleMatch[1].trim().replace(/^["“]|["”]$/g, ""),
      style,
      lyrics: stripStyleLines(lyricsMatch[1]),
    };
  }
  // Fallback: first non-empty line is the title if it isn't a section label.
  const lines = trimmed
    .split("\n")
    .filter((l) => l.trim().length > 0 && !/^\s*STYLE:/i.test(l));
  const first = lines[0]?.trim() ?? "Untitled";
  if (!first.startsWith("[") && lines.length > 1) {
    return {
      title: first.replace(/^#+\s*/, "").replace(/^["“]|["”]$/g, ""),
      style,
      lyrics: stripStyleLines(lines.slice(1).join("\n")),
    };
  }
  return { title: "Untitled", style, lyrics: stripStyleLines(trimmed) };
}

/* ── The guide ────────────────────────────────────────────────────────── */

export const GUIDE_SYSTEM_PROMPT = `You are the guide for a songwriting service. You walk a writer through telling the personal detail behind their song, then put everything they shared together into one song brief for the songwriter.

Every request names one of your two tasks on its TASK line.

TASK: QUESTIONS — before the lyrics are written, ask the writer a few follow-up questions that draw out the specific, personal details a song needs to feel true rather than generic.
- Build every question on what THIS person actually wrote. Name their details back to them — the car, the street, the person, the year. A question that could be asked of any writer is a wasted question.
- Ask about concrete, sensory, factual things: who was there, what was said, what it smelled or sounded like, what object was in their hand, what happened next.
- One thing per question, answerable in a sentence or two.
- Every question must be OPEN. Never ask a yes/no question, and never offer a choice between options — "did you slow down or keep driving?" and "was anyone with you, or were you alone?" can both be answered in one word, so they buy nothing. Ask "what did you do as you came up on it?" and "who else was in the car?" instead. Start questions with what, who, where, when, or how.
- Output format — respond with EXACTLY ${MIN_QUESTIONS}-${MAX_QUESTIONS} questions as a numbered list and nothing else. No preamble, no commentary, no closing line:
1. <question>
2. <question>
3. <question>

TASK: BRIEF — put it all together. Everything the writer shared — the thought, the feelings, the details, and their answers to your questions — becomes one song brief the songwriter writes from.
- Keep every name, object, place, and specific exactly as the writer gave it. The brief is their story, organised — never invent a detail, never generalise a specific away.
- The writer's answers to the follow-up questions carry the most weight: those are the details they volunteered when asked directly. Every answered question must leave a trace in the brief.
- Write short plain prose: what the song is about, what actually happened, the feelings in the writer's own words, and the concrete details worth singing.
- Under 250 words. No lyrics, no rhymes, no headings, no advice, no commentary.
- Output the brief and nothing else.

Both tasks:
- Warm and curious, never clinical. You are a collaborator, not an intake form.
- Treat the song-direction choices as settled instructions. Do not ask the writer to explain genre, mood, point of view, wording style, structure, or lead voice; ask only for missing personal story details.
- This is creative expression, not therapy. Never diagnose, never advise, never probe self-harm, trauma, or medical detail. If the writing touches something painful, stay with the ordinary specifics around it — the room, the drive home, the song that was playing — not the pain itself.
- Never ask for or repeat contact details, addresses, passwords, financial information, or anyone's full legal name.`;

/** Shared context block: what the writer has shared so far. */
function writerContextLines(input: QuestionsRequestParsed["input"]): string[] {
  const lines: string[] = [`THOUGHT (what the song is about):`, input.thought, ``];
  if (input.feelings.length > 0 || input.feelingsText) {
    lines.push(`FEELINGS:`);
    if (input.feelings.length > 0) lines.push(`- Selected: ${input.feelings.join(", ")}`);
    if (input.feelingsText) lines.push(`- Described: ${input.feelingsText}`);
    lines.push(``);
  }
  if (input.context) {
    lines.push(`DETAILS they already gave:`, input.context, ``);
  }
  return lines;
}

export function buildGuideQuestionsUserPrompt(req: QuestionsRequestParsed): string {
  const { input, controls } = req;
  const lines: string[] = [`TASK: QUESTIONS`, ``, ...writerContextLines(input)];
  lines.push(
    `SONG DIRECTION: ${controls.genre}, ${controls.mood} mood, ${controls.perspective}, ${controls.lyricalStyle} lyrics, ${controls.vocalist === "Choose for me" ? "voice chosen to fit the story" : controls.vocalist}.`,
    ``,
    `Ask what you still need to know to write this specific song. Do not ask for anything they already told you above.`
  );
  return lines.join("\n");
}

export function buildGuideBriefUserPrompt(req: LyricsRequestParsed): string {
  const { input, controls } = req;
  const lines: string[] = [`TASK: BRIEF`, ``, ...writerContextLines(input)];
  const answered = (input.answers ?? []).filter((a) => a.answer.trim().length > 0);
  if (answered.length > 0) {
    lines.push(`THE WRITER'S ANSWERS to your follow-up questions:`);
    for (const a of answered) {
      lines.push(`Q: ${a.question}`, `A: ${a.answer}`);
    }
    lines.push(``);
  }
  lines.push(
    `SONG DIRECTION: ${controls.genre}, ${controls.mood} mood, ${controls.perspective}, ${controls.lyricalStyle} lyrics, ${controls.vocalist === "Choose for me" ? "voice chosen to fit the story" : controls.vocalist}.`,
    ``,
    `Put everything above together into the song brief.`
  );
  return lines.join("\n");
}

/**
 * Cleans the guide's assembled brief. Returns null when the completion is
 * unusable (empty, or too short to actually carry the story) so the caller
 * falls back to handing the generator the raw sections instead.
 */
export function parseBriefCompletion(text: string): string | null {
  const brief = text
    .trim()
    .replace(/^(?:BRIEF|SONG BRIEF)\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .trim();
  if (brief.length < 40) return null;
  return brief;
}

/**
 * Parses a numbered question list, tolerating the drift models actually
 * produce: bullets instead of digits, bold markers, a stray preamble line.
 * Returns at most MAX_QUESTIONS; the caller decides whether too few is a
 * failure.
 */
export function parseQuestionsCompletion(text: string): SongQuestion[] {
  const questions: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    // "1. ", "1) ", "- ", "• " — anything that marks a list item.
    const match = line.match(/^(?:\d+[.)]|[-*•])\s+(.*)$/);
    if (!match?.[1]) continue;
    const question = match[1]
      .replace(/^\*\*|\*\*$/g, "")
      .replace(/^["“]|["”]$/g, "")
      .trim();
    if (question.length < 5) continue;
    questions.push(question);
  }
  return questions.slice(0, MAX_QUESTIONS).map((question, i) => ({
    id: `q${i + 1}`,
    question,
  }));
}

/*
 * There is no separate music prompt in V4. The generator emits the STYLE
 * production brief alongside the lyrics, the client carries it into the
 * render request, and /api/music falls back to the deterministic
 * buildMockStylePrompt (lib/mock.ts) when no style travelled with the song.
 */
