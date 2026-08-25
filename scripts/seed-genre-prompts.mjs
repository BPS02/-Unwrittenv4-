import { LangfuseClient } from "@langfuse/client";
import fs from "node:fs/promises";

const genres = {
  "pop": `POP-SPECIFIC DIRECTION:\n- Build around an immediate, memorable chorus hook with a clear emotional payoff.\n- Use concise, conversational verses and a pre-chorus only when it creates genuine lift.\n- Favor clean internal rhyme and natural repetition; never repeat merely to fill space.\n- STYLE should specify modern pop production, a defined BPM, hook-forward arrangement, and a dynamic final chorus.`,
  "acoustic-folk": `ACOUSTIC / FOLK-SPECIFIC DIRECTION:\n- Let concrete personal details carry the emotion; write like an intimate story told aloud.\n- Favor organic phrasing, restrained rhyme, and melodies that can breathe over sparse instrumentation.\n- Avoid generic nature imagery unless it came from the writer's own story.\n- STYLE should name the acoustic instruments, room intimacy, tempo, vocal texture, and gradual dynamic arc.`,
  "rnb-soul": `R&B / SOUL-SPECIFIC DIRECTION:\n- Write fluid, emotionally direct lines with space for melisma, ad-libs, and call-and-response.\n- Use tasteful internal rhyme, sensual rhythm, and a chorus that deepens the central confession.\n- Add performance tags only where musically useful, such as [Ad-libs] or [Backing vocals].\n- STYLE should define groove, BPM, harmonic warmth, bass and keys, vocal runs, and the song's emotional build.`,
  "indie": `INDIE-SPECIFIC DIRECTION:\n- Preserve unusual, specific details and an individual point of view instead of polishing them into clichés.\n- Allow asymmetry, understated hooks, slant rhyme, and a slightly unexpected image or structural turn.\n- Keep eccentricity emotionally legible and singable.\n- STYLE should identify the indie subtexture, tempo, distinctive instrumentation, vocal character, and dynamic contrast.`,
  "rock": `ROCK-SPECIFIC DIRECTION:\n- Write muscular, singable lines with forward motion and a chorus built to land with a band.\n- Use tension and release, strong verbs, and strategic repetition; avoid empty rebellion clichés.\n- Let the bridge or breakdown change the emotional pressure rather than merely restating the chorus.\n- STYLE should specify rock lane, BPM, guitar tone, drums, bass, vocal intensity, and the peak of the arrangement.`,
  "country": `COUNTRY-SPECIFIC DIRECTION:\n- Tell a clear story through places, objects, actions, and spoken-language phrasing grounded in the writer's details.\n- Use accessible rhyme and a chorus whose central phrase feels earned by the verses.\n- Avoid stock trucks, whiskey, small towns, porches, and dirt roads unless the writer actually supplied them.\n- STYLE should specify country lane, BPM, acoustic/electric instrumentation, vocal character, and narrative dynamic arc.`,
  "hip-hop": `HIP-HOP-SPECIFIC DIRECTION:\n- Every lyrical bar must participate in an audible rhyme scheme. Do not leave unrhymed filler lines.\n- Use frequent internal rhymes plus strong end rhymes; favor multisyllabic rhyme chains and evolve the rhyme sound every 2–4 bars.\n- Keep every rhyme natural, meaningful, and easy to perform. Never distort grammar or add empty words merely to force a rhyme.\n- Prioritize cadence and bar-to-bar momentum. Vary bar length intentionally, use wordplay rooted in the writer's details, and make the hook rhythmically undeniable.\n- Do not imitate, name, or closely mimic any living artist. Avoid filler boasts and forced slang.\n- STYLE should specify hip-hop lane, BPM, drum feel, bass, sample or synth palette, flow character, hook treatment, and beat changes.`,
  "electronic": `ELECTRONIC-SPECIFIC DIRECTION:\n- Write economical, rhythmically clean lyrics that leave room for builds, drops, texture, and repetition with purpose.\n- Center one strong lyrical motif and transform it across sections instead of overloading verses with explanation.\n- Use production section tags such as [Build] or [Drop] only where they clarify the musical arc.\n- STYLE should specify electronic subgenre, BPM, drum pattern, synth palette, vocal processing, build, drop, and final release.`,
  "lo-fi": `LO-FI-SPECIFIC DIRECTION:\n- Keep the writing intimate, understated, and close to a private thought; favor small observations over declarations.\n- Use loose rhyme, short phrases, negative space, and a gentle hook that can repeat without becoming theatrical.\n- Avoid making sadness decorative or vague; preserve the writer's real details.\n- STYLE should specify slow-to-mid BPM, dusty drums, warm keys or guitar, ambient texture, close vocal treatment, and restrained dynamics.`,
};

if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
  throw new Error("Langfuse credentials are not configured");
}

const source = await fs.readFile(new URL("../lib/prompts.ts", import.meta.url), "utf8");
const match = source.match(/export const GENERATOR_SYSTEM_PROMPT = `([\s\S]*?)`;\r?\n/);
if (!match) throw new Error("Could not read GENERATOR_SYSTEM_PROMPT");

const client = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
});
const baseName = process.env.LANGFUSE_GENERATOR_PROMPT_NAME || "unwritten-generator";
const requestedSlug = process.argv[2];
if (requestedSlug && !(requestedSlug in genres)) {
  throw new Error(`Unknown genre slug: ${requestedSlug}`);
}
const selected = requestedSlug
  ? [[requestedSlug, genres[requestedSlug]]]
  : Object.entries(genres);
for (const [slug, direction] of selected) {
  const created = await client.prompt.create({
    name: `${baseName}-${slug}`,
    type: "chat",
    prompt: [{ role: "system", content: `${match[1]}\n\n${direction}` }],
    labels: ["production"],
    config: {
      model: "meta/muse-spark-1.2-contributor",
      temperature: 0.85,
      maxTokens: 3000,
      reasoning: false,
    },
    commitMessage: `Add ${slug} songwriting specialization`,
  });
  console.log(`${created.name} v${created.version}`);
}
