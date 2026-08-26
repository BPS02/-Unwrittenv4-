import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSourcePacket } from "@/lib/source-packet";
import { storyMapSchema } from "@/lib/story-map";

interface Fixture { story_map: unknown }
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")) as Fixture[];

describe("source-packet.v2", () => {
  it("builds stable authorized atoms for every approved fixture", () => {
    for (const fixture of fixtures) {
      const map = storyMapSchema.parse(fixture.story_map);
      const first = buildSourcePacket(map);
      expect(first).toEqual(buildSourcePacket(map));
      expect(first.version).toBe("source-packet.v2");
      expect(first.atoms.length).toBeGreaterThan(5);
      expect(first.atoms.map((atom) => atom.id)).toEqual(first.atoms.map((_, index) => `src_${String(index + 1).padStart(2, "0")}`));
      expect(first.atoms.every((atom) => atom.text !== "none")).toBe(true);
    }
  });

  it("marks exact phrases and approved named details for verbatim citation", () => {
    const packet = buildSourcePacket(storyMapSchema.parse(fixtures[0]!.story_map));
    expect(packet.atoms.find((atom) => atom.kind === "exact_phrase")).toMatchObject({ citationPolicy: "exact", verbatim: "take your time" });
    expect(packet.atoms.find((atom) => atom.text === "the first name Rosa")).toMatchObject({ citationPolicy: "exact", verbatim: "Rosa" });
  });

  it("keeps exclusions as controls rather than usable lyric atoms", () => {
    const map = storyMapSchema.parse(fixtures[0]!.story_map);
    const packet = buildSourcePacket(map);
    expect(packet.controls.must_not_use).toEqual(map.must_not_use);
    for (const excluded of map.must_not_use) expect(packet.atoms.map((atom) => atom.text)).not.toContain(excluded);
  });
});
