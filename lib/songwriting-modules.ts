export const COUNTRY_FOLK_MODULE_VERSION = "country_folk.v3" as const;

export const COUNTRY_FOLK_MODULE_PROMPT = `MODULE VERSION: country_folk.v3

COUNTRY / FOLK / ACOUSTIC NARRATIVE
- Tell the story through ordinary actions, objects, places, and remembered language already authorized by the Story Map.
- Use natural contractions and spoken grammar. Rhyme should support the sentence; never bend grammar or add filler to complete a rhyme.
- Do not add stock trucks, whiskey, dirt roads, porches, small towns, fields, church imagery, or family roles unless the Story Map supports them.
- Choose the structure that serves the story. The only allowed labels are [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Verse 2], [Bridge], [Final Chorus], and [Outro]. Never emit [Verse 3] or any other label. A pre-chorus is optional, never mandatory.
- Do not emit curly-brace performance cues in this genre. Put every production instruction in STYLE instead.
- Verse 1 establishes only a confirmed scene. Verse 2 must advance time, consequence, or present understanding by directly using approved wording from building_blocks.change_over_time or current_state. It may not add a second invented scene. The bridge adds an approved realization rather than summarizing the verses.
- Target 9 words or fewer per sung line, with 12 as the absolute ceiling.
- Keep the chorus centered on one plain, memorable statement earned by the details. Repetition belongs mainly in the chorus.
- Select 3–5 instruments from an organic palette that fits the requested subgenre: acoustic guitar, electric guitar, piano, upright bass, electric bass, brushed drums, restrained drum kit, mandolin, banjo, fiddle, dobro, or pedal steel. Do not use an instrument merely because it is associated with the genre.
- STYLE has a 90-word target and a hard 110-word ceiling. Set a specific BPM and key. Concisely describe section-level entrances and dropouts, vocal treatment, room/mix character, exact ending, and 4–6 song-specific exclusions.
- STYLE describes sound only and contains no plot, names, dates, relationship labels, or singable sentences.`;

export const SOLO_VOCAL_MODULE_VERSION = "solo.v1" as const;

export type SoloLead = "male" | "female";

export function soloVocalModulePrompt(lead: SoloLead): string {
  return `MODULE VERSION: solo.v1

SOLO VOCAL
- Use one ${lead} lead singer throughout the complete song.
- Choose a genre-appropriate register and describe it in STYLE without inventing age, identity, accent, or biography.
- Translate emotional distance into mic proximity, breath, restraint, phrasing, and dynamic ceiling.
- Background harmonies may support a chorus only when the genre module and chorus message call for them. They never become a second lead.
- Do not switch lead gender, assign dialogue, create a duet, or use a choir.`;
}
