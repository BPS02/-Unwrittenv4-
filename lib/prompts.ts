import { MAX_QUESTIONS, MIN_QUESTIONS, type SongQuestion } from "./types";
import type { LyricsRequestParsed, QuestionsRequestParsed } from "./validation";

/**
 * Local prompt templates. When Langfuse is configured, the server first tries
 * to fetch a managed prompt (see lib/langfuse.ts) so prompts can be versioned
 * and iterated without a deploy; these are the built-in fallbacks and the
 * canonical source for tests.
 *
 * V4 runs the whole creation flow on TWO managed prompts:
 *
 * 1. THE GUIDE (`unwritten-guide`) — guides the writer through telling the
 *    personal detail behind their song (the follow-up questions), then puts
 *    everything they shared together into one song brief.
 * 2. THE GENERATOR (`unwritten-generator`) — writes the song from that brief
 *    in a single completion: title, the production STYLE brief handed to the
 *    music provider, and the lyrics. There is no separate music prompt.
 *
 * The starting-point tiles and template thoughts below are site furniture,
 * not part of the two-prompt core.
 */

export const GENERATOR_SYSTEM_PROMPT = `You are the songwriter and producer for a songwriting service. From a song brief built out of a person's own words, you write the complete song in one pass: the title, the production style for the music generator, and the lyrics.

Principles:
- Honor the writer's actual words: weave the brief's phrases, images, names, and details into the lyrics naturally.
- Be emotionally honest without being melodramatic. Never diagnose, never give therapeutic advice — this is creative expression, not treatment.
- If feelings were not described, infer a gentle emotional tone from the story itself; do not invent feelings the writer did not express.
- Follow the requested genre, mood, perspective, lyrical style, and structure precisely.
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

/* ── Starting points (the tiles themselves) ───────────────────────────── */

export const STARTING_POINTS_SYSTEM_PROMPT = `You write the starting points on a songwriting site — the tiles someone scans when they know they want to write but not what about.

A starting point is a THEME, not a thought and not a lyric. It names a situation a person recognises in themselves within a second of reading it.

Principles:
- Two to five words. "Someone I miss". "Starting over". "The last text I didn't send". Nothing longer.
- Name a SITUATION, not an emotion. "Someone I miss" works; "Sadness" does not. The feeling comes from the situation, and the person supplies it.
- Ordinary human life: love, distance, family, work, moving, growing up, small joys, endings, waiting. Not epic, not abstract, not poetic.
- Every one must be plainly different from the others. Ten shades of heartbreak is one starting point, not ten.
- Roughly half should be warm or hopeful. Somebody arriving happy needs a door too.
- Write for anyone. No names, no places, no ages, no genders, nothing that assumes a life the reader may not have.
- This is creative expression, not therapy. Nothing clinical, nothing about self-harm, nothing that reads as a diagnosis.

Each also needs a TAGLINE — a short second line, under nine words, that says what writing it would give them. And three FEELINGS someone picking it might carry, lowercase, plain words.

Output format — one per line, fields separated by | and nothing else. No numbering, no preamble, no blank lines:
Theme | Tagline | feeling, feeling, feeling`;

export function buildStartingPointsUserPrompt(params: {
  count: number;
  /** Themes already on screen, so a refresh returns genuinely new ones. */
  avoid?: readonly string[];
  variation: number;
}): string {
  const lines = [`Write ${params.count} starting points.`];
  if (params.avoid && params.avoid.length > 0) {
    lines.push(
      ``,
      `ALREADY USED — do not repeat these or write near-synonyms of them:`,
      params.avoid.map((t) => `- ${t}`).join("\n")
    );
  }
  // Nudges the spread so a refresh doesn't drift to the same safe middle.
  const leans = [
    "Lean toward beginnings and arrivals.",
    "Lean toward people — family, friends, the ones who stayed.",
    "Lean toward places and leaving them.",
    "Lean toward small ordinary joys.",
    "Lean toward things left unfinished.",
  ];
  lines.push(``, leans[params.variation % leans.length] ?? leans[0]!);
  return lines.join("\n");
}

export interface ParsedStartingPoint {
  theme: string;
  tagline: string;
  feelings: string[];
}

/**
 * Parses the `Theme | Tagline | feelings` contract, tolerating numbering and
 * stray bullets. Rows missing a field are dropped rather than half-rendered.
 */
export function parseStartingPointsCompletion(text: string): ParsedStartingPoint[] {
  const out: ParsedStartingPoint[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, "");
    if (!line.includes("|")) continue;
    const [theme, tagline, feelings] = line.split("|").map((part) => part.trim());
    if (!theme || !tagline) continue;
    const cleanTheme = theme.replace(/^\*\*|\*\*$/g, "").replace(/^["“]|["”]$/g, "").trim();
    // Two to five words was the instruction; allow a little drift, not a sentence.
    if (cleanTheme.length < 3 || cleanTheme.split(/\s+/).length > 7) continue;
    const key = cleanTheme.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      theme: cleanTheme,
      tagline: tagline.replace(/^\*\*|\*\*$/g, "").trim(),
      feelings: (feelings ?? "")
        .split(",")
        .map((f) => f.trim().toLowerCase())
        .filter((f) => f.length > 0 && f.length < 24)
        .slice(0, 3),
    });
  }
  return out;
}

/* ── Template opening thought ─────────────────────────────────────────── */

export const TEMPLATE_THOUGHT_SYSTEM_PROMPT = `You write the opening thought waiting in the box after someone picks a theme, before they have written anything themselves.

TWO TO FOUR SENTENCES. Long enough to have a shape, short enough to read at a glance and type over.

IT MUST BELONG TO THE THEME THEY PICKED. This is the rule that matters most. Someone reading the thought with the theme hidden should be able to say which one was clicked. The theme names a situation — put them inside that situation from the first words. Do not write a thought that would fit any theme equally well.

Principles:
- First person. This is their voice, not a description of them.
- Plain, spoken language, the way someone actually tells you something across a table.
- Build it from ordinary concrete things — a mug, a passenger seat, a porch light, an unread message. Specific objects, not abstractions.
- Vary the sentence lengths. A short one after a long one is what makes it sound like a person.
- Never invent a specific name, place, or date. It is not your life, and a wrong specific is worse than none.
- Do not resolve it. No conclusion, no lesson, no tidy final sentence that explains the rest. Leave the ending for the song.
- Never mention songs, lyrics, writing, or music.
- This is creative expression, not therapy. Never diagnose, never advise, never write about self-harm.

Theme: "Someone I miss"
Good: "I still reach for two mugs in the morning. The chair by the window is exactly where it was, and I have not moved it. Some days I catch myself saving things to tell you."

Theme: "Starting over"
Good: "Everything I own fits in the car again. I keep checking the mirror like I forgot something, but the rooms behind me are empty. Nobody here knows the old version of me yet."

Too generic — could belong to any theme: "Some days are harder than others. I think about how things used to be and wonder what comes next."

Output the thought and nothing else — no quotes, no preamble, no title.`;

export function buildTemplateThoughtUserPrompt(params: {
  theme: string;
  tagline: string;
  feelings: readonly string[];
  /** Varies the wording between clicks so a second try reads differently. */
  variation: number;
}): string {
  const angles = [
    "Open on a small physical object that belongs to this situation.",
    "Open mid-thought, as if continuing a sentence they started in their head.",
    "Open on the thing they keep doing without meaning to.",
    "Open by stating plainly what changed, then sit in it.",
    "Open in an ordinary moment where this surfaces — a room, a drive, a morning.",
  ];
  return [
    `THEY PICKED THIS THEME: ${params.theme}`,
    `WHAT THE THEME PROMISES THEM: ${params.tagline}`,
    `FEELINGS IN THE AIR: ${params.feelings.join(", ")}`,
    ``,
    `ANGLE FOR THIS ONE: ${angles[params.variation % angles.length]}`,
    ``,
    `Write their opening thought. It must be unmistakably about "${params.theme}" —`,
    `someone who could not see the theme should still be able to name it from`,
    `what you write.`,
  ].join("\n");
}

/** Strips the wrapping quotes and stray labels a model sometimes adds. */
export function cleanTemplateThought(text: string): string {
  return text
    .trim()
    .replace(/^(?:thought|opening thought)\s*:\s*/i, "")
    .replace(/^["“']|["”']$/g, "")
    .trim();
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
    `SONG DIRECTION: ${controls.genre}, ${controls.mood} mood, ${controls.perspective}, ${controls.lyricalStyle} lyrics.`,
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
    `SONG DIRECTION: ${controls.genre}, ${controls.mood} mood, ${controls.perspective}, ${controls.lyricalStyle} lyrics.`,
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
