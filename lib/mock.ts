import type { LyricsRequestParsed } from "./validation";
import type { Mood } from "./types";
import { hashString, mulberry32, pick, pickMany, type Rng } from "./rng";

/**
 * Deterministic local lyric generation for Demo Mode (no API keys needed).
 * The same input always produces the same song, so the flow is fully
 * demonstrable and testable offline. It weaves the user's own words,
 * feelings, and context details into mood-appropriate imagery.
 */

interface MoodPalette {
  images: string[];
  verbs: string[];
  closers: string[];
  titleWords: string[];
}

const MOOD_PALETTES: Record<Mood, MoodPalette> = {
  Hopeful: {
    images: [
      "first light through the curtains",
      "a door I haven't opened yet",
      "green shoots in the sidewalk cracks",
      "a map with the ink still wet",
      "morning air after the rain",
      "a window left open to spring",
    ],
    verbs: ["rising", "reaching", "beginning", "becoming"],
    closers: ["and I'm still on my way", "and the light keeps finding me", "and tomorrow knows my name"],
    titleWords: ["Morning", "Open Door", "Still on My Way", "First Light"],
  },
  Bittersweet: {
    images: [
      "ticket stubs in an old coat pocket",
      "the last warm day of autumn",
      "a photograph curling at the edges",
      "laughter echoing down an empty hall",
      "honey and salt on the same breath",
      "the porch light we never turned off",
    ],
    verbs: ["holding", "leaving", "keeping", "letting go of"],
    closers: ["and it was beautiful anyway", "and I'd do it all again", "and some goodbyes are gifts"],
    titleWords: ["Anyway", "The Last Warm Day", "Both Things True", "Porch Light"],
  },
  Melancholy: {
    images: [
      "rain tracing the windowpane",
      "an empty chair at the table",
      "streetlights on wet pavement",
      "a coat that still smells like winter",
      "the quiet after the phone goes dark",
      "fog settling over the harbor",
    ],
    verbs: ["missing", "carrying", "remembering", "wandering through"],
    closers: ["and the quiet stays with me", "and I let the rain talk", "and some rooms keep their echoes"],
    titleWords: ["Blue Hour", "Empty Chair", "What the Rain Knows", "Echoes"],
  },
  Peaceful: {
    images: [
      "steam rising from a morning cup",
      "slow clouds crossing a wide sky",
      "bare feet on cool floorboards",
      "a candle steady in still air",
      "the hum of a house at rest",
      "leaves turning over in a soft wind",
    ],
    verbs: ["breathing", "settling", "resting", "softening"],
    closers: ["and this is enough", "and I am here, just here", "and the world can wait a while"],
    titleWords: ["Enough", "Still Water", "Small Hours", "Here"],
  },
  Uplifting: {
    images: [
      "the whole sky turning gold",
      "hands raised at the chorus",
      "engines humming on an open road",
      "confetti caught in the stage lights",
      "a heartbeat loud as a drumline",
      "windows down and the radio up",
    ],
    verbs: ["running", "shining", "climbing", "singing"],
    closers: ["and nothing's gonna dim this now", "and we were built for this", "and I'm louder than the doubt"],
    titleWords: ["Louder", "Gold", "Open Road", "Built for This"],
  },
  "Raw & honest": {
    images: [
      "the mirror at 2 a.m.",
      "unsent messages in the drafts",
      "a truth I kept under my tongue",
      "bare walls where the pictures hung",
      "my own name said out loud",
      "the scar I stopped hiding",
    ],
    verbs: ["admitting", "unlearning", "facing", "saying"],
    closers: ["and I'm done pretending now", "and the truth can have the mic", "and this is me, unfiltered"],
    titleWords: ["Unfiltered", "2 A.M.", "Say It Plain", "Bare Walls"],
  },
  Playful: {
    images: [
      "sneakers squeaking on the kitchen floor",
      "a grin we couldn't hide in church",
      "ice cream before dinner, don't tell",
      "bad karaoke sung like an anthem",
      "matching umbrellas in July",
      "a paper crown from a birthday box",
    ],
    verbs: ["dancing", "laughing", "spinning", "winking at"],
    closers: ["and we make our own parade", "and who needs a reason anyway", "and the joke's still funny now"],
    titleWords: ["Paper Crown", "Don't Tell", "Our Own Parade", "Karaoke Heart"],
  },
  Cinematic: {
    images: [
      "headlights sweeping the valley road",
      "a skyline holding its breath",
      "dust rising off a summer field",
      "the tide pulling back before the wave",
      "credits rolling over an empty street",
      "thunder counting down the miles",
    ],
    verbs: ["chasing", "crossing", "burning through", "standing at the edge of"],
    closers: ["and the horizon knows the rest", "and the story isn't over", "and the camera never blinks"],
    titleWords: ["Horizon", "Valley Road", "Before the Wave", "Wide Shot"],
  },
};

interface PronounSet {
  subj: string;
  obj: string;
  poss: string;
  am: string;
}

function pronouns(perspective: LyricsRequestParsed["controls"]["perspective"]): PronounSet {
  switch (perspective) {
    case "Second person (you)":
      return { subj: "you", obj: "you", poss: "your", am: "you're" };
    case "Third person (story)":
      return { subj: "they", obj: "them", poss: "their", am: "they're" };
    default:
      return { subj: "I", obj: "me", poss: "my", am: "I'm" };
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const LEADING_STOPWORDS =
  /^(?:and|but|because|so|about|that|of|the|a|an|to|in|on|how|when|while|with)\s+/i;

/** Pulls short usable fragments from the user's own words. */
export function extractAnchors(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;,—-])\s+|\s+(?:and|but|because|so)\s+/i)
    .map((s) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, "").trim())
    .map((s) => {
      // Keep long clauses usable by taking their tail and trimming filler.
      const words = s.split(" ");
      let anchor = words.length > 10 ? words.slice(-8).join(" ") : s;
      for (let i = 0; i < 3; i++) anchor = anchor.replace(LEADING_STOPWORDS, "");
      return anchor.trim();
    })
    .filter((s) => {
      const words = s.split(" ");
      return words.length >= 2 && words.length <= 10;
    })
    .slice(0, 6);
}

function lowerFirst(s: string): string {
  // Keep "I" capitalized when the fragment starts with it.
  if (/^I\b/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function collectFeelings(req: LyricsRequestParsed): string[] {
  const fromText = req.input.feelingsText
    .split(/[,.;]|\band\b/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 2 && s.split(" ").length <= 3);
  const all = [...req.input.feelings.map((f) => f.toLowerCase()), ...fromText];
  return [...new Set(all)].slice(0, 6);
}

function buildVerse(
  rng: Rng,
  p: PronounSet,
  palette: MoodPalette,
  anchors: string[],
  feelings: string[],
  contextDetail: string | undefined
): string[] {
  const image = pick(rng, palette.images);
  const verb = pick(rng, palette.verbs);
  const lines: string[] = [];

  lines.push(`${capitalize(image)},`);
  if (anchors.length > 0) {
    lines.push(`${p.subj === "I" ? "I keep coming back to" : capitalize(p.subj) + " keep coming back to"} ${lowerFirst(pick(rng, anchors))}`);
  } else {
    lines.push(`${capitalize(p.am)} ${verb} through another day`);
  }
  if (contextDetail) {
    lines.push(`${capitalize(contextDetail)} — ${p.subj} remember${p.subj === "I" || p.subj === "you" || p.subj === "they" ? "" : "s"} it all`);
  } else {
    lines.push(`${capitalize(pick(rng, palette.images))} in ${p.poss} mind`);
  }
  if (feelings.length > 0) {
    lines.push(`${capitalize(p.am)} ${pick(rng, feelings)}, and that's the truth of it`);
  } else {
    lines.push(`No easy words for what this is`);
  }
  return lines;
}

function buildChorus(
  rng: Rng,
  p: PronounSet,
  palette: MoodPalette,
  anchors: string[],
  feelings: string[]
): string[] {
  const closer = pick(rng, palette.closers);
  const verb = pick(rng, palette.verbs);
  const anchor = anchors.length > 0 ? lowerFirst(pick(rng, anchors)) : `${verb} toward the light`;
  const feeling = feelings.length > 0 ? pick(rng, feelings) : verb;
  return [
    `So here ${p.subj === "I" ? "I am" : p.subj === "you" ? "you are" : "they are"}, ${verb} —`,
    `${capitalize(anchor)},`,
    `Every ${feeling} note of it,`,
    `${capitalize(closer)}.`,
  ];
}

function buildBridge(rng: Rng, p: PronounSet, palette: MoodPalette, feelings: string[]): string[] {
  const image = pick(rng, palette.images);
  return [
    `And if ${p.subj} forget${p.subj === "I" || p.subj === "you" || p.subj === "they" ? "" : "s"} how far ${p.subj} ${p.subj === "I" ? "have" : "have"} come,`,
    `Remind ${p.obj} of ${image},`,
    feelings.length > 1
      ? `How ${p.subj} can be ${feelings[0]} and ${feelings[1]} at once,`
      : `How the quiet can be a kind of song,`,
    `And let that be enough.`,
  ];
}

function buildTitle(rng: Rng, palette: MoodPalette, anchors: string[]): string {
  if (anchors.length > 0 && rng() < 0.5) {
    const a = pick(rng, anchors);
    const words = a.split(" ").slice(0, 4).join(" ");
    return words
      .split(" ")
      .map((w) => (w.length > 2 ? capitalize(w) : w))
      .join(" ");
  }
  return pick(rng, palette.titleWords);
}

export interface MockSong {
  title: string;
  lyrics: string;
}

export function generateMockLyrics(req: LyricsRequestParsed): MockSong {
  const seed = hashString(JSON.stringify(req));
  const rng = mulberry32(seed);
  const palette = MOOD_PALETTES[req.controls.mood];
  const p = pronouns(req.controls.perspective);
  const anchors = extractAnchors(req.input.thought);
  const feelings = collectFeelings(req);
  const contextDetails = extractAnchors(req.input.context);

  const title = buildTitle(rng, palette, anchors);
  const sections: string[] = [];

  const verse = () =>
    sections.push(
      `[Verse ${sections.filter((s) => s.startsWith("[Verse")).length + 1}]\n` +
        buildVerse(rng, p, palette, anchors, feelings, pickManyOrUndef(rng, contextDetails)).join("\n")
    );
  const chorusLines = buildChorus(rng, p, palette, anchors, feelings);
  const chorus = () => sections.push(`[Chorus]\n` + chorusLines.join("\n"));
  const bridge = () => sections.push(`[Bridge]\n` + buildBridge(rng, p, palette, feelings).join("\n"));

  switch (req.controls.structure) {
    case "Verse – Chorus":
      verse(); chorus(); verse(); chorus();
      break;
    case "Verse – Chorus – Bridge":
      verse(); chorus(); verse(); chorus(); bridge(); chorus();
      break;
    case "Through-composed (story)":
      verse(); verse(); verse(); verse();
      break;
    case "Short & simple (verse + hook)":
      verse(); chorus();
      break;
  }

  let lyrics = sections.join("\n\n");
  if (req.controls.keepClean) {
    // The generator never produces explicit language, but make the guarantee
    // explicit for anything woven in from user anchors.
    lyrics = lyrics.replace(/\b(fuck\w*|shit\w*|bitch\w*|damn)\b/gi, "—");
  }
  return { title, lyrics };
}

function pickManyOrUndef(rng: Rng, items: string[]): string | undefined {
  if (items.length === 0) return undefined;
  return pickMany(rng, items, 1)[0];
}

/** Deterministic music style prompt used when no LLM key is configured. */
export function buildMockStylePrompt(req: {
  title: string;
  controls: LyricsRequestParsed["controls"];
}): string {
  const { genre, mood } = req.controls;
  const voice = req.controls.vocalist === "Choose for me"
    ? "a lead voice chosen to fit the story"
    : `a ${req.controls.vocalist.toLowerCase()}`;
  const tempoByMood: Record<string, string> = {
    Hopeful: "mid-tempo, around 96 BPM",
    Bittersweet: "gentle mid-tempo, around 84 BPM",
    Melancholy: "slow, around 68 BPM",
    Peaceful: "slow and spacious, around 72 BPM",
    Uplifting: "energetic, around 118 BPM",
    "Raw & honest": "sparse mid-tempo, around 80 BPM",
    Playful: "bright, around 110 BPM",
    Cinematic: "building, around 90 BPM",
  };
  const instrumentation: Record<string, string> = {
    Pop: "polished synths, punchy drums, layered vocal harmonies",
    "Acoustic / Folk": "fingerpicked acoustic guitar, soft strings, close intimate vocal",
    "R&B / Soul": "warm electric piano, smooth bass, soulful lead vocal with runs",
    Indie: "jangly guitars, tape-saturated drums, airy reverb-washed vocal",
    Rock: "driving electric guitars, live drums, powerful vocal",
    Country: "acoustic and pedal steel guitars, brushed drums, storytelling vocal",
    "Hip-Hop": "boom-bap drums, deep 808 bass, rhythmic confident delivery",
    Electronic: "pulsing synth arpeggios, sidechained pads, ethereal processed vocal",
    "Lo-fi": "dusty piano loops, vinyl crackle, relaxed understated vocal",
  };
  return (
    `${genre} song, ${mood.toLowerCase()} mood, ${tempoByMood[mood] ?? "mid-tempo"}. ` +
    `Instrumentation: ${instrumentation[genre] ?? "balanced full-band arrangement"}. Lead vocal: ${voice}. ` +
    `Song title: "${req.title}". Emotionally sincere performance, dynamic build from intimate opening to a fuller final chorus, clean modern production.`
  );
}
