/**
 * Performance tags vs. the words of the song.
 *
 * The lyrics prompt deliberately emits Suno-style production markup:
 *
 *   [Intro, Quiet arrangement, Soft vinyl crackle]
 *   (Ahh ahh ahh)
 *
 * The music provider needs those — bracketed tags drive the arrangement and
 * parenthetical vocables are backing-vocal ad libs. A person reading their own
 * song does not: they are stage directions, not lyrics.
 *
 * So the RAW text stays the source of truth everywhere it matters — it is what
 * gets stored, what is sent to the provider, and what a re-render uses. This
 * module only produces a reading copy. Never strip before generation, or the
 * arrangement instructions are lost and the song comes back different.
 */

/**
 * Position decides intent, not wording.
 *
 * A parenthetical ALONE on its own line is a stage direction or an ad lib —
 * `(Ahh ahh ahh)`, `(Fading synth pad, stripped-down echo)`. Nobody sings a
 * line that is entirely bracketed off.
 *
 * A parenthetical TRAILING a lyric line is a backing vocal echoing the lead:
 * `And I never told you (I never told you)`. Those are removed only when they
 * are pure vocalisation, so real sung words survive.
 */
const VOCABLE = /^[\s,.!?'’-]*(?:(?:a+h+|o+h+|o+o+h+|u+h+|m+h*m*|h+m+|l+a+|n+a+|d+a+|d+o+o+|w[oh]+a+h*|y[ea]+h+|hey|whoa|woo+)[\s,.!?'’-]*)+$/i;

/** True when a parenthetical is backing vocals rather than a sung line. */
export function isVocable(inner: string): boolean {
  return VOCABLE.test(inner);
}

/**
 * A reading copy of the lyrics: production markup removed, verses intact.
 *
 * - `[...]` segments are always removed (structural/production tags).
 * - `(...)` segments are removed only when purely vocables.
 * - Lines left empty by the removal are dropped, but deliberate stanza breaks
 *   are preserved and never collapsed to more than one blank line.
 */
export function lyricsForReading(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n").map((line) => {
    // Bracketed production tags never survive, wherever they sit.
    const withoutBrackets = line.replace(/\[[^\]]*\]/g, "").trim();

    // Whole line wrapped in parentheses → stage direction or ad lib.
    if (/^\([^)]*\)$/.test(withoutBrackets)) return "";

    const withoutTags = withoutBrackets.replace(/\(([^)]*)\)/g, (match, inner: string) =>
      isVocable(inner) ? "" : match
    );
    // Tidy the punctuation and spacing a removal can leave behind.
    return withoutTags.replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
  });

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const wasBlank = (raw.split("\n")[i] ?? "").trim().length === 0;
    // A line that became empty was pure markup — drop it rather than leaving
    // a hole. A line that was already blank is a stanza break; keep one.
    if (line.length === 0 && !wasBlank) continue;
    if (line.length === 0 && kept[kept.length - 1] === "") continue;
    kept.push(line);
  }

  while (kept.length > 0 && kept[0] === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return kept.join("\n");
}

/** Whether a reading copy would differ — i.e. there is markup to hide. */
export function hasPerformanceTags(raw: string): boolean {
  return lyricsForReading(raw) !== raw.trim();
}
