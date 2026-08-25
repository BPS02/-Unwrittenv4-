/** Shared domain types for the Unwritten creation flow. */

export const GENRES = [
  "Pop",
  "Acoustic / Folk",
  "R&B / Soul",
  "Indie",
  "Rock",
  "Country",
  "Hip-Hop",
  "Electronic",
  "Lo-fi",
] as const;
export type Genre = (typeof GENRES)[number];

export const MOODS = [
  "Hopeful",
  "Bittersweet",
  "Melancholy",
  "Peaceful",
  "Uplifting",
  "Raw & honest",
  "Playful",
  "Cinematic",
] as const;
export type Mood = (typeof MOODS)[number];

export const PERSPECTIVES = [
  "First person (I)",
  "Second person (you)",
  "Third person (story)",
] as const;
export type Perspective = (typeof PERSPECTIVES)[number];

export const LYRICAL_STYLES = [
  "Plainspoken",
  "Poetic & metaphorical",
  "Storytelling",
  "Minimal & repetitive",
] as const;
export type LyricalStyle = (typeof LYRICAL_STYLES)[number];

export const STRUCTURES = [
  "Verse – Chorus",
  "Verse – Chorus – Bridge",
  "Through-composed (story)",
  "Short & simple (verse + hook)",
] as const;
export type Structure = (typeof STRUCTURES)[number];

export const VOCALISTS = ["Choose for me", "Female voice", "Male voice"] as const;
export type Vocalist = (typeof VOCALISTS)[number];

/** Songwriting controls chosen in the "Shape" step. */
export interface SongControls {
  genre: Genre;
  mood: Mood;
  perspective: Perspective;
  lyricalStyle: LyricalStyle;
  structure: Structure;
  vocalist: Vocalist;
  /** true = avoid explicit language (default). */
  keepClean: boolean;
}

/**
 * One follow-up question put to the writer in the "Questions" step.
 *
 * Questions are always written by the model from what the writer actually
 * said — there is no canned list — so they can name the Corolla, the parking
 * lot, the person, rather than asking a generic "who was there?".
 */
export interface SongQuestion {
  /** Stable id within a single question set ("q1", "q2", …). */
  id: string;
  /** The question as it is shown to the writer. */
  question: string;
  /** Optional short nudge shown under the input. */
  hint?: string;
}

/** A question paired with the writer's answer, fed into the lyrics prompt. */
export interface QuestionAnswer {
  id: string;
  /** Kept alongside the answer so the prompt (and a restored draft) keep the pairing. */
  question: string;
  answer: string;
}

/** Everything the user expressed in the "Write" step. */
export interface SongInput {
  /** The thought or moment the song is about. Required. */
  thought: string;
  /** Selected feeling words. Optional — feelings are never required. */
  feelings: string[];
  /** Free-text description of how they feel. Optional. */
  feelingsText: string;
  /** Optional personal/context details (names, places, images to weave in). */
  context: string;
  /** Template id if the user started from a starting point. */
  templateId?: string;
  /**
   * Answers to the follow-up questions. Optional on the type so the MCP
   * server and templates can build a SongInput without them; the web flow
   * requires every question to be answered before lyrics are written.
   */
  answers?: QuestionAnswer[];
}

export interface LyricsRequest {
  input: SongInput;
  controls: SongControls;
}

export interface LyricsResult {
  mode: "demo" | "live";
  title: string;
  lyrics: string;
  /** The generator's STYLE production brief — carried into the music request. */
  style: string;
  model?: string;
}

export interface MusicRequest {
  title: string;
  lyrics: string;
  controls: SongControls;
  /** The STYLE brief written alongside the lyrics; deterministic fallback when absent. */
  style?: string;
}

/** Wire shape of the music step result. Real audio is referenced by a
 *  short-lived streaming path — never a file/data URL — so the free tier can
 *  stay streaming-only. */
export type MusicResult =
  | {
      mode: "demo";
      stylePrompt: string;
      quality?: "full" | "preview";
    }
  | {
      mode: "audio";
      stylePrompt: string;
      audio: { streamPath: string; mimeType: string };
      provider: string;
      quality: "full" | "preview";
      unlocked: boolean;
      downloadable: boolean;
      takeNumber: number;
    };

/** Client-safe entitlement summary attached to gated responses. */
export interface EntitlementSummaryWire {
  tier: "free" | "pro";
  songsRemaining: number;
  purchasedCredits: number;
  freeSongAvailable: boolean;
  freeTakesRemaining: number;
  periodEnd: string | null;
}

/**
 * The emotion families the starter templates are organised under. Grounded in
 * emotion research rather than invented ad hoc: Plutchik's primary emotions
 * (joy, trust, fear, sadness, anger, anticipation) and their studied blends —
 * love as joy+trust, nostalgia as the sadness+joy blend — plus the distinct
 * categories that large-scale studies of self-reported feeling keep finding
 * (Cowen & Keltner's 27 emotion categories: nostalgia, relief, awe, pride,
 * calmness as separable states, not shades of "happy" or "sad").
 */
export const TEMPLATE_FAMILIES = [
  "Love",
  "Loss & grief",
  "Longing & nostalgia",
  "Fear & uncertainty",
  "Anger & defiance",
  "Joy & gratitude",
  "Pride & triumph",
  "Peace & release",
] as const;
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number];

export interface Template {
  id: string;
  /** Which emotion family the template belongs to — see TEMPLATE_FAMILIES. */
  family: TemplateFamily;
  theme: string;
  /** Short evocative tagline shown on the card. */
  tagline: string;
  /**
   * Hand-written opening thoughts, one of which is dropped into the box when
   * the template is chosen. Several variants so a second try reads
   * differently — no model writes these.
   */
  starterThoughts: readonly string[];
  /** Pre-selected feeling chips — always drawn from FEELING_CHIPS. */
  feelings: string[];
  /** Decorative glyph for the card. */
  glyph: string;
  /** Optional control suggestions applied when the template is chosen. */
  suggested?: Partial<Pick<SongControls, "genre" | "mood">>;
}

export const DEFAULT_CONTROLS: SongControls = {
  genre: "Acoustic / Folk",
  mood: "Hopeful",
  perspective: "First person (I)",
  lyricalStyle: "Plainspoken",
  structure: "Verse – Chorus – Bridge",
  vocalist: "Choose for me",
  keepClean: true,
};

export const EMPTY_INPUT: SongInput = {
  thought: "",
  feelings: [],
  feelingsText: "",
  context: "",
  answers: [],
};

/** How many follow-up questions a set may contain. */
export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 6;

/** Feeling words offered as quick-select chips. Always optional. */
export const FEELING_CHIPS = [
  "grateful",
  "hopeful",
  "tender",
  "bittersweet",
  "lonely",
  "relieved",
  "proud",
  "anxious",
  "nostalgic",
  "peaceful",
  "heartbroken",
  "excited",
  "angry",
  "free",
  "overwhelmed",
  "in love",
] as const;
