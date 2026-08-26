import { assertApprovedStoryMap, type StoryMapV1 } from "./story-map";

export const SOURCE_PACKET_VERSION = "source-packet.v2" as const;

export type SourceAtomKind = "confirmed" | "interpretation" | "exact_phrase" | "allowed_detail";

export interface SourceAtom {
  id: `src_${string}`;
  path: string;
  text: string;
  kind: SourceAtomKind;
  citationPolicy: "exact" | "direct_paraphrase" | "interpretive";
  verbatim?: string;
}

export interface SourcePacketV1 {
  version: typeof SOURCE_PACKET_VERSION;
  storyMapId: string;
  atoms: SourceAtom[];
  controls: Pick<StoryMapV1, "point_of_view" | "literalness" | "permissions" | "must_not_use">;
  allowedTransformations: readonly ["rhyme", "repetition", "metaphor", "non_factual_sensory_tone"];
}

/** Converts approved prose into a compact, stable set of authorized source atoms. */
export function buildSourcePacket(storyMap: StoryMapV1): SourcePacketV1 {
  const map = assertApprovedStoryMap(storyMap);
  const interpreted = new Set<string>((map.interpretations ?? []).map((item) => item.field));
  const entries: Array<{ path: string; text: string; kind: SourceAtomKind }> = [
    { path: "current_state.feeling", text: map.current_state.feeling, kind: "confirmed" },
    { path: "relevant_past", text: map.relevant_past, kind: "confirmed" },
    ...Object.entries(map.building_blocks).map(([key, text]) => ({
      path: `building_blocks.${key}`,
      text,
      kind: interpreted.has(`building_blocks.${key}`) ? "interpretation" : "confirmed",
    })),
    ...map.exact_phrases_to_keep.map((text, index) => ({ path: `exact_phrases_to_keep.${index}`, text, kind: "exact_phrase" as const })),
    ...map.may_use.map((text, index) => ({ path: `may_use.${index}`, text, kind: "allowed_detail" as const })),
  ] as Array<{ path: string; text: string; kind: SourceAtomKind }>;
  const usableEntries = entries.filter((entry) => normalize(entry.text) !== "none");

  return {
    version: SOURCE_PACKET_VERSION,
    storyMapId: map.story_map_id,
    atoms: usableEntries.map((entry, index) => ({
      id: `src_${String(index + 1).padStart(2, "0")}`,
      ...entry,
      citationPolicy: entry.kind === "exact_phrase" || entry.kind === "allowed_detail"
        ? "exact"
        : entry.kind === "interpretation" ? "interpretive" : "direct_paraphrase",
      ...(entry.kind === "exact_phrase" || entry.kind === "allowed_detail" ? { verbatim: usableText(entry) } : {}),
    })),
    controls: {
      point_of_view: map.point_of_view,
      literalness: map.literalness,
      permissions: map.permissions,
      must_not_use: [...map.must_not_use],
    },
    allowedTransformations: ["rhyme", "repetition", "metaphor", "non_factual_sensory_tone"],
  };
}

function usableText(entry: { text: string; kind: SourceAtomKind }): string {
  if (entry.kind === "allowed_detail") {
    const named = entry.text.match(/^the first name\s+(.+)$/i);
    if (named?.[1]) return named[1].trim();
  }
  return entry.text;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
