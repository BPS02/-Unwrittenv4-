/**
 * Deterministic cover art.
 *
 * Songs here have no artwork — nobody uploads a cover for a song they made in
 * ninety seconds. So a song's id is hashed to a fixed gradient, which means
 * the same song always wears the same colours and a playlist tile made of
 * four of them is stable across reloads.
 *
 * Tones are muted and mid-dark on purpose: they sit on a near-black page and
 * must not glow, but still need to differ from each other at tile size.
 */

const ART_GRADIENTS = [
  "linear-gradient(135deg, #6f9598 0%, #3c585b 100%)",
  "linear-gradient(135deg, #93a88f 0%, #4f6650 100%)",
  "linear-gradient(135deg, #a8977c 0%, #665843 100%)",
  "linear-gradient(135deg, #7e97a6 0%, #435767 100%)",
  "linear-gradient(135deg, #99897f 0%, #5b524b 100%)",
  "linear-gradient(135deg, #829a92 0%, #465c56 100%)",
  "linear-gradient(135deg, #9a8298 0%, #56455a 100%)",
  "linear-gradient(135deg, #8d8fae 0%, #4a4c66 100%)",
] as const;

export function artFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return ART_GRADIENTS[hash % ART_GRADIENTS.length] ?? ART_GRADIENTS[0];
}
