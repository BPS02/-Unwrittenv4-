import { TEMPLATE_FAMILIES, type Template, type TemplateFamily } from "./types";

/**
 * The starter templates — fully hand-curated, no model involved.
 *
 * Organised under the emotion families in TEMPLATE_FAMILIES (see the research
 * note there). Choosing a template selects its feelings immediately and drops
 * one of its hand-written opening thoughts into the box; picking the same
 * template again rotates to the next variant.
 *
 * House style for every starter thought:
 * - First person, plain spoken language, two to four sentences.
 * - Built from ordinary concrete things — a chair, a jacket, an unread
 *   message. Never an invented name, place, or date: it is not your life,
 *   and a wrong specific is worse than none.
 * - Unresolved. No conclusion, no lesson — the ending belongs to the song.
 * - Feelings come only from FEELING_CHIPS, so the chips arrive pre-selected.
 */
export const TEMPLATES: readonly Template[] = [
  /* ── Love ─────────────────────────────────────────────────────────── */
  {
    id: "falling-for-someone",
    family: "Love",
    theme: "Falling for someone",
    tagline: "Capture the bright uncertainty of new love",
    starterThoughts: [
      "I keep rereading the last message they sent, looking for more than it says. The room changes a little when they walk in, and I have stopped pretending not to notice. I have not said anything out loud yet.",
      "I catch myself saving up small things to tell them — a joke, a headline, something I saw on the way home. I don't remember deciding to do that. It just started.",
    ],
    feelings: ["in love", "excited", "tender"],
    glyph: "♡",
    suggested: { genre: "R&B / Soul", mood: "Playful" },
  },
  {
    id: "the-one-who-stayed",
    family: "Love",
    theme: "The one who stayed",
    tagline: "Honor a love that lasted past the fireworks",
    starterThoughts: [
      "We have two mugs that don't match and a way of moving around each other in the kitchen without talking. Nobody claps for a love like this. I want to say out loud how much it holds.",
      "They have seen me at my worst and are still here, reading in the next room. I keep meaning to say what that means to me and keep settling for making the coffee instead.",
    ],
    feelings: ["grateful", "in love", "peaceful"],
    glyph: "◈",
    suggested: { genre: "Acoustic / Folk", mood: "Peaceful" },
  },
  {
    id: "miles-between-us",
    family: "Love",
    theme: "Miles between us",
    tagline: "Hold someone close across the distance",
    starterThoughts: [
      "We say goodnight through a screen and I sit for a while after it goes dark. Their side of the bed is a time zone away. I keep doing the math on when I'll see them again.",
      "I know their morning is my afternoon, and I plan my day around a call. The distance is temporary — we keep saying that word. Some nights it doesn't feel temporary.",
    ],
    feelings: ["lonely", "in love", "hopeful"],
    glyph: "↔",
    suggested: { genre: "Pop", mood: "Bittersweet" },
  },

  /* ── Loss & grief ─────────────────────────────────────────────────── */
  {
    id: "someone-i-miss",
    family: "Loss & grief",
    theme: "Someone I miss",
    tagline: "Hold a person close for the length of a song",
    starterThoughts: [
      "I still reach for two mugs in the morning. The chair by the window is exactly where it was, and I have not moved it. Some days I catch myself saving things to tell them.",
      "Their jacket is still on the hook by the door and I can't decide what moving it would mean. I hear something funny and turn around to repeat it. The house is quieter than it has any right to be.",
    ],
    feelings: ["nostalgic", "lonely", "grateful"],
    glyph: "◇",
    suggested: { genre: "Acoustic / Folk", mood: "Melancholy" },
  },
  {
    id: "the-end-of-us",
    family: "Loss & grief",
    theme: "The end of us",
    tagline: "Say what the breakup left behind",
    starterThoughts: [
      "I gave back the spare key and kept the habit of checking my phone. Half the songs I like are ruined for now. I am angry and I miss them, usually in the same hour.",
      "Their side of the closet is empty and I keep the door shut so I don't see it. I know it was the right thing. Knowing doesn't seem to help at night.",
    ],
    feelings: ["heartbroken", "angry", "relieved"],
    glyph: "⌒",
    suggested: { genre: "Indie", mood: "Raw & honest" },
  },

  /* ── Longing & nostalgia ──────────────────────────────────────────── */
  {
    id: "memory-i-cant-forget",
    family: "Longing & nostalgia",
    theme: "A memory I can’t forget",
    tagline: "Return to one moment in vivid detail",
    starterThoughts: [
      "There is a memory I return to without trying. I can still see the light, hear the room, and feel the exact second when something in me changed.",
      "It was an ordinary day right up until it wasn't. I remember what I was holding and what the air smelled like. Nobody else there knew they were inside one of my important moments.",
    ],
    feelings: ["nostalgic", "bittersweet", "tender"],
    glyph: "◌",
    suggested: { genre: "Country", mood: "Cinematic" },
  },
  {
    id: "the-place-im-from",
    family: "Longing & nostalgia",
    theme: "The place I’m from",
    tagline: "Sing the streets that made you",
    starterThoughts: [
      "I can still walk the whole street with my eyes closed — which porch light came on first, where the sidewalk buckled, which door I never knocked on twice. I left, and I carry it anyway.",
      "When people ask where I'm from, I give the short answer. The long answer has a water tower in it, and a gas station, and a kitchen that always smelled like dinner. I haven't been back in a while.",
    ],
    feelings: ["nostalgic", "proud", "bittersweet"],
    glyph: "⌂",
    suggested: { genre: "Country", mood: "Bittersweet" },
  },
  {
    id: "something-unsaid",
    family: "Longing & nostalgia",
    theme: "Something I never said",
    tagline: "Give words to what stayed quiet",
    starterThoughts: [
      "There is something I never said when I had the chance. I have carried the sentence for so long that it has become part of me, and I am ready to let it speak.",
      "I wrote it out once and never sent it. The draft is still there — I check sometimes, like it might have sent itself. The moment passed, but the words didn't.",
    ],
    feelings: ["tender", "anxious", "bittersweet"],
    glyph: "…",
    suggested: { genre: "Indie", mood: "Raw & honest" },
  },

  /* ── Fear & uncertainty ───────────────────────────────────────────── */
  {
    id: "starting-over",
    family: "Fear & uncertainty",
    theme: "Starting over",
    tagline: "Step into a chapter that has not been written",
    starterThoughts: [
      "Everything I own fits in the car again. I keep checking the mirror like I forgot something, but the rooms behind me are empty. Nobody here knows the old version of me yet.",
      "I am beginning again, and I cannot tell whether the feeling in my chest is fear or hope. I want to remember this moment before the new life feels familiar.",
    ],
    feelings: ["anxious", "hopeful", "excited"],
    glyph: "↗",
    suggested: { genre: "Pop", mood: "Hopeful" },
  },
  {
    id: "carrying-too-much",
    family: "Fear & uncertainty",
    theme: "Carrying too much",
    tagline: "Set the weight down for three minutes",
    starterThoughts: [
      "My list has a list now. I keep telling people I'm fine because the true answer takes too long. Tonight I just want to sit in the car in the driveway for an extra minute.",
      "Everyone thinks I have it handled, because I always have it handled. Lately I lie awake doing arithmetic on things that aren't numbers. I can't remember the last time I asked for help.",
    ],
    feelings: ["overwhelmed", "anxious", "tender"],
    glyph: "≡",
    suggested: { genre: "Lo-fi", mood: "Raw & honest" },
  },

  /* ── Anger & defiance ─────────────────────────────────────────────── */
  {
    id: "words-i-swallowed",
    family: "Anger & defiance",
    theme: "The words I swallowed",
    tagline: "Say it plain, the way you couldn’t then",
    starterThoughts: [
      "I stood there and took it, and in the car afterward I gave the speech of my life to the windshield. I have been polite about this for too long. The politeness is over.",
      "They talked over me and I let them, again. I keep replaying the moment I should have pushed back. The next version of me doesn't wait for permission to speak.",
    ],
    feelings: ["angry", "heartbroken", "free"],
    glyph: "⚡",
    suggested: { genre: "Rock", mood: "Raw & honest" },
  },

  /* ── Joy & gratitude ──────────────────────────────────────────────── */
  {
    id: "quiet-gratitude",
    family: "Joy & gratitude",
    theme: "Quiet gratitude",
    tagline: "Notice the beauty in an ordinary day",
    starterThoughts: [
      "Nothing extraordinary happened today, and that is exactly what I want to remember: morning light, a familiar voice, and the calm of having enough for this moment.",
      "The kettle, the radiator, somebody laughing in the next room. I keep waiting for life to start and then catching it already in progress. Today I just wanted to say thank you to no one in particular.",
    ],
    feelings: ["grateful", "peaceful", "tender"],
    glyph: "✦",
    suggested: { genre: "Lo-fi", mood: "Peaceful" },
  },
  {
    id: "this-good-moment",
    family: "Joy & gratitude",
    theme: "This good moment",
    tagline: "Bottle the day before it slips past",
    starterThoughts: [
      "Something good finally happened and I keep taking it out to look at it, like a ticket stub. I want to remember exactly how today felt before it becomes a story I tell.",
      "We stayed up too late laughing about nothing. My face hurt on the drive home. I don't want to analyze it — I just don't want to forget it.",
    ],
    feelings: ["excited", "grateful", "hopeful"],
    glyph: "☼",
    suggested: { genre: "Pop", mood: "Uplifting" },
  },

  /* ── Pride & triumph ──────────────────────────────────────────────── */
  {
    id: "finding-confidence",
    family: "Pride & triumph",
    theme: "Finding my confidence",
    tagline: "Turn down doubt and hear your own voice",
    starterThoughts: [
      "I spent too long making myself smaller so other people would feel comfortable. I am learning that confidence does not have to be loud to be real.",
      "I said no this week and the ceiling did not fall in. I keep practicing my own opinion in the mirror like a new language. It's starting to sound like me.",
    ],
    feelings: ["proud", "free", "hopeful"],
    glyph: "↑",
    suggested: { genre: "Rock", mood: "Uplifting" },
  },
  {
    id: "how-far-ive-come",
    family: "Pride & triumph",
    theme: "How far I’ve come",
    tagline: "Look back at the distance you covered",
    starterThoughts: [
      "I found an old photo of myself from the hardest year and I wanted to tell that person to hang on. They had no idea what they were about to survive. I'm still here, and some mornings that fact alone feels enormous.",
      "Nobody threw a parade for any of it — the small brave phone calls, the mornings I got up anyway. But I know what those cost. I'm allowed to be proud of invisible things.",
    ],
    feelings: ["proud", "grateful", "relieved"],
    glyph: "◎",
    suggested: { genre: "Hip-Hop", mood: "Cinematic" },
  },
  {
    id: "dream-still-chasing",
    family: "Pride & triumph",
    theme: "A dream I’m still chasing",
    tagline: "Write toward the future you refuse to abandon",
    starterThoughts: [
      "There is a dream I keep returning to even when it would be easier to call it unrealistic. I am not there yet, but I am still moving toward it.",
      "People ask when I'm going to be realistic, and I nod, and then I get up early anyway. The dream has outlasted every sensible argument against it. That has to mean something.",
    ],
    feelings: ["hopeful", "excited", "proud"],
    glyph: "☆",
    suggested: { genre: "Electronic", mood: "Uplifting" },
  },

  /* ── Peace & release ──────────────────────────────────────────────── */
  {
    id: "letting-go",
    family: "Peace & release",
    theme: "Letting go",
    tagline: "Release something you have carried too long",
    starterThoughts: [
      "I have been holding on to something I know I need to release. Part of me is afraid of who I am without it, but I can finally feel how heavy it has become.",
      "I boxed it up today — the reminders, the maybes, the just-in-case. I didn't cry the way I expected to. Mostly my hands feel strangely light.",
    ],
    feelings: ["bittersweet", "relieved", "free"],
    glyph: "↝",
    suggested: { genre: "Acoustic / Folk", mood: "Bittersweet" },
  },
  {
    id: "making-peace",
    family: "Peace & release",
    theme: "Making peace",
    tagline: "Forgive it — them, or yourself",
    starterThoughts: [
      "I have been at war with something that ended a long time ago. Everyone else has gone home from that argument; I'm the only one still standing in it. I think I am finally ready to put it down.",
      "I keep drafting the apology I deserve and never got. Lately I've been wondering if I could stop waiting for it. Forgiveness keeps looking less like a gift to them and more like a door out for me.",
    ],
    feelings: ["peaceful", "relieved", "tender"],
    glyph: "☾",
    suggested: { genre: "Lo-fi", mood: "Peaceful" },
  },
] as const;

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/** Templates grouped in family order, for the browse grid. */
export function templatesByFamily(): Array<{ family: TemplateFamily; templates: Template[] }> {
  return TEMPLATE_FAMILIES.map((family) => ({
    family,
    templates: TEMPLATES.filter((t) => t.family === family),
  })).filter((group) => group.templates.length > 0);
}
