import { createHmac, timingSafeEqual } from "node:crypto";
import { GENRES, MOODS, type Genre, type Mood } from "./types";
import { TEMPLATES } from "./templates";

/**
 * Generated starting points, and the signature that makes them safe to send
 * back.
 *
 * The built-in ten live in lib/templates.ts and are looked up server-side by
 * id, so a client can never put words in the model's mouth through them.
 * Generated tiles have no server-side registry — the instance that wrote them
 * is not necessarily the instance asked for a thought about them (the same
 * serverless lesson as the audio store). So each generated tile carries an
 * HMAC over its own fields: the client hands the tile back, any instance
 * verifies it, and unsigned or edited text is refused. That keeps the
 * "never trust client text" rule intact on an unauthenticated route.
 */

export interface StartingPointWire {
  /** Stable within a set — used only as a React key and a click target. */
  id: string;
  theme: string;
  tagline: string;
  feelings: string[];
  glyph: string;
  suggested?: { genre?: Genre; mood?: Mood };
  /** Present on generated tiles only; the built-in ten are found by id. */
  token?: string;
  /** True for the shipped ten, so the client knows to send templateId. */
  builtIn?: boolean;
}

/** Glyphs are assigned here, not by the model — models pick odd characters. */
const GLYPHS = ["◇", "↗", "…", "◌", "◎", "↝", "✦", "♡", "↑", "☆", "◈", "❍"] as const;

export function glyphFor(index: number): string {
  return GLYPHS[index % GLYPHS.length] ?? "◇";
}

/**
 * Signing key. Generated tiles only exist when OpenRouter is configured, so
 * its key is always present in exactly the cases a signature is needed —
 * which avoids inventing a required env var for a feature that degrades to
 * the built-in ten anyway.
 */
function signingSecret(): string {
  return process.env.TEMPLATE_SIGNING_SECRET || process.env.OPENROUTER_API_KEY || "";
}

/** The exact bytes covered by the signature. */
function payload(point: { theme: string; tagline: string; feelings: readonly string[] }): string {
  return JSON.stringify({
    t: point.theme,
    g: point.tagline,
    f: [...point.feelings],
  });
}

export function signStartingPoint(point: {
  theme: string;
  tagline: string;
  feelings: readonly string[];
}): string {
  const secret = signingSecret();
  if (!secret) throw new Error("Cannot sign a starting point without a signing secret.");
  return createHmac("sha256", secret).update(payload(point)).digest("base64url");
}

/** True only when this exact theme/tagline/feelings triple was ours. */
export function verifyStartingPoint(
  point: { theme: string; tagline: string; feelings: readonly string[] },
  token: string
): boolean {
  const secret = signingSecret();
  if (!secret || !token) return false;
  let expected: string;
  try {
    expected = signStartingPoint(point);
  } catch {
    return false;
  }
  const given = Buffer.from(token);
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

/** The shipped ten, in the wire shape the gallery renders. */
export function builtInStartingPoints(): StartingPointWire[] {
  return TEMPLATES.map((t) => ({
    id: t.id,
    theme: t.theme,
    tagline: t.tagline,
    feelings: [...t.feelings],
    glyph: t.glyph,
    suggested: t.suggested,
    builtIn: true,
  }));
}

const GENRE_SET = new Set<string>(GENRES);
const MOOD_SET = new Set<string>(MOODS);

/** Only enum-valid control hints survive; anything else is simply dropped. */
export function coerceSuggested(raw: {
  genre?: string;
  mood?: string;
}): { genre?: Genre; mood?: Mood } | undefined {
  const genre = raw.genre && GENRE_SET.has(raw.genre) ? (raw.genre as Genre) : undefined;
  const mood = raw.mood && MOOD_SET.has(raw.mood) ? (raw.mood as Mood) : undefined;
  if (!genre && !mood) return undefined;
  return { ...(genre ? { genre } : {}), ...(mood ? { mood } : {}) };
}
