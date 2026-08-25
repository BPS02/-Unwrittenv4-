import { GENERATOR_SYSTEM_PROMPT } from "./prompts";
import type { Genre } from "./types";

export const GENRE_PROMPT_SLUGS: Record<Genre, string> = {
  Pop: "pop",
  "Acoustic / Folk": "acoustic-folk",
  "R&B / Soul": "rnb-soul",
  Indie: "indie",
  Rock: "rock",
  Country: "country",
  "Hip-Hop": "hip-hop",
  Electronic: "electronic",
  "Lo-fi": "lo-fi",
};

export const GENRE_DIRECTIONS: Record<Genre, string> = {
  Pop: `POP-SPECIFIC DIRECTION:
- Build around an immediate, memorable chorus hook with a clear emotional payoff.
- Use concise, conversational verses and a pre-chorus only when it creates genuine lift.
- Favor clean internal rhyme and natural repetition; never repeat merely to fill space.
- STYLE should specify modern pop production, a defined BPM, hook-forward arrangement, and a dynamic final chorus.`,
  "Acoustic / Folk": `ACOUSTIC / FOLK-SPECIFIC DIRECTION:
- Let concrete personal details carry the emotion; write like an intimate story told aloud.
- Favor organic phrasing, restrained rhyme, and melodies that can breathe over sparse instrumentation.
- Avoid generic nature imagery unless it came from the writer's own story.
- STYLE should name the acoustic instruments, room intimacy, tempo, vocal texture, and gradual dynamic arc.`,
  "R&B / Soul": `R&B / SOUL-SPECIFIC DIRECTION:
- Write fluid, emotionally direct lines with space for melisma, ad-libs, and call-and-response.
- Use tasteful internal rhyme, sensual rhythm, and a chorus that deepens the central confession.
- Add performance tags only where musically useful, such as [Ad-libs] or [Backing vocals].
- STYLE should define groove, BPM, harmonic warmth, bass and keys, vocal runs, and the song's emotional build.`,
  Indie: `INDIE-SPECIFIC DIRECTION:
- Preserve unusual, specific details and an individual point of view instead of polishing them into clichés.
- Allow asymmetry, understated hooks, slant rhyme, and a slightly unexpected image or structural turn.
- Keep eccentricity emotionally legible and singable.
- STYLE should identify the indie subtexture, tempo, distinctive instrumentation, vocal character, and dynamic contrast.`,
  Rock: `ROCK-SPECIFIC DIRECTION:
- Write muscular, singable lines with forward motion and a chorus built to land with a band.
- Use tension and release, strong verbs, and strategic repetition; avoid empty rebellion clichés.
- Let the bridge or breakdown change the emotional pressure rather than merely restating the chorus.
- STYLE should specify rock lane, BPM, guitar tone, drums, bass, vocal intensity, and the peak of the arrangement.`,
  Country: `COUNTRY-SPECIFIC DIRECTION:
- Tell a clear story through places, objects, actions, and spoken-language phrasing grounded in the writer's details.
- Use accessible rhyme and a chorus whose central phrase feels earned by the verses.
- Avoid stock trucks, whiskey, small towns, porches, and dirt roads unless the writer actually supplied them.
- Make the lyrics sound like a real person talking honestly to someone they know. Use familiar everyday words, natural contractions, and lines a person could actually say out loud. Favor the writer's own phrasing even when it is imperfect.
- Do not write polished AI-poetry or generic inspirational language. Unless the writer used them literally, ban phrases and imagery built around: tapestry, symphony, echoes, whispers, shadows dancing, destiny, journey, testament, chapters turning, storms inside, shattered pieces, scars telling stories, a spark inside, finding my wings, rising from ashes, or light breaking through darkness.
- Avoid abstract summaries such as “love is a journey” or “time heals all wounds.” Show one ordinary action, object, place, or remembered sentence instead. Use no more than one simple metaphor at a time, and never mix metaphors to make a line sound profound.
- After drafting, silently check every lyric line: if it sounds like something an AI wrote rather than something this particular person would say or sing, replace it with plainer and more specific language.
- Keep AI music metadata out of the lyrics. The only bracketed labels allowed are [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], and [Final Chorus]. Do not emit tags or directions such as [Guitar Solo], [Instrumental], [Backing vocals], [Build], [Drop], vocal cues, performance notes, production notes, or parenthetical stage directions.
- Keep all instrumentation, arrangement, vocal, tempo, and production language exclusively in the STYLE line, never in the LYRICS block.
- STYLE should specify country lane, BPM, acoustic/electric instrumentation, vocal character, and narrative dynamic arc.`,
  "Hip-Hop": `HIP-HOP-SPECIFIC DIRECTION:
- Every lyrical bar must participate in an audible rhyme scheme. Do not leave unrhymed filler lines.
- Use frequent internal rhymes plus strong end rhymes; favor multisyllabic rhyme chains and evolve the rhyme sound every 2–4 bars.
- Keep every rhyme natural, meaningful, and easy to perform. Never distort grammar or add empty words merely to force a rhyme.
- Prioritize cadence and bar-to-bar momentum. Vary bar length intentionally, use wordplay rooted in the writer's details, and make the hook rhythmically undeniable.
- Do not imitate, name, or closely mimic any living artist. Avoid filler boasts and forced slang.
- STYLE should specify hip-hop lane, BPM, drum feel, bass, sample or synth palette, flow character, hook treatment, and beat changes.`,
  Electronic: `ELECTRONIC-SPECIFIC DIRECTION:
- Write economical, rhythmically clean lyrics that leave room for builds, drops, texture, and repetition with purpose.
- Center one strong lyrical motif and transform it across sections instead of overloading verses with explanation.
- Use production section tags such as [Build] or [Drop] only where they clarify the musical arc.
- STYLE should specify electronic subgenre, BPM, drum pattern, synth palette, vocal processing, build, drop, and final release.`,
  "Lo-fi": `LO-FI-SPECIFIC DIRECTION:
- Keep the writing intimate, understated, and close to a private thought; favor small observations over declarations.
- Use loose rhyme, short phrases, negative space, and a gentle hook that can repeat without becoming theatrical.
- Avoid making sadness decorative or vague; preserve the writer's real details.
- STYLE should specify slow-to-mid BPM, dusty drums, warm keys or guitar, ambient texture, close vocal treatment, and restrained dynamics.`,
};

export function genreGeneratorPromptName(genre: Genre): string {
  const base = process.env.LANGFUSE_GENERATOR_PROMPT_NAME || "unwritten-generator";
  return `${base}-${GENRE_PROMPT_SLUGS[genre]}`;
}

export function genreGeneratorFallback(genre: Genre): string {
  return `${GENERATOR_SYSTEM_PROMPT}\n\n${GENRE_DIRECTIONS[genre]}`;
}
