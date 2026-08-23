/**
 * Gentle, non-blocking crisis-support detection.
 *
 * This is deliberately narrow: it looks for language about self-harm or not
 * wanting to be alive, and it never blocks creation — it only decides whether
 * to show a supportive resources note alongside the flow. Ordinary sadness,
 * heartbreak, grief, and anger are normal creative material and must not
 * trigger it.
 */

const CRISIS_PATTERNS: readonly RegExp[] = [
  /\bkill(?:ing)?\s+myself\b/i,
  /\bsuicid\w*/i,
  /\bend(?:ing)?\s+(?:it\s+all|my\s+life)\b/i,
  /\bself[-\s]?harm\w*/i,
  /\bhurt(?:ing)?\s+myself\b/i,
  /\bcut(?:ting)?\s+myself\b/i,
  /\bdon'?t\s+want\s+to\s+(?:live|be\s+alive|be\s+here\s+anymore|wake\s+up)\b/i,
  /\bwant(?:ed)?\s+to\s+die\b/i,
  /\bbetter\s+off\s+without\s+me\b/i,
  /\bno\s+reason\s+to\s+(?:live|go\s+on|keep\s+going)\b/i,
  /\bcan'?t\s+go\s+on\b/i,
];

export function detectCrisisLanguage(...texts: string[]): boolean {
  const combined = texts.join("\n");
  if (combined.trim().length === 0) return false;
  return CRISIS_PATTERNS.some((re) => re.test(combined));
}

export const CRISIS_SUPPORT_MESSAGE = {
  heading: "You matter, and support is there if you want it",
  body:
    "Some of what you wrote sounds really heavy. Writing can help — and so can talking to someone. " +
    "If you're in the US, you can call or text 988 anytime. Elsewhere, findahelpline.com lists free, confidential support around the world. " +
    "You're welcome to keep creating here, too.",
  links: [
    { label: "988 Suicide & Crisis Lifeline (US)", href: "https://988lifeline.org" },
    { label: "Find a helpline worldwide", href: "https://findahelpline.com" },
  ],
} as const;
