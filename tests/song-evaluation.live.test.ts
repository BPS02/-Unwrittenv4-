import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { evaluateCountryFolkSong, summarizeSongEvaluations, type EvaluationModel } from "@/lib/song-evaluation";
import { chatComplete } from "@/lib/openrouter";
import { storyMapSchema } from "@/lib/story-map";

interface Fixture { tags: string[]; story_map: unknown }
const enabled = process.env.RUN_LIVE_SONG_EVAL === "1";

describe.skipIf(!enabled)("live version-pinned song evaluation", () => {
  beforeAll(() => loadLocalEnv(), 10_000);

  it("evaluates each approved country/folk fixture", async () => {
    const fixtures = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")) as Fixture[];
    const maps = fixtures.filter((fixture) => fixture.tags.includes("country_folk")).map((fixture) => storyMapSchema.parse(fixture.story_map));
    const complete: EvaluationModel = async ({ system, user, purpose }) => {
      const result = await chatComplete({
        system,
        user,
        model: process.env.OPENROUTER_LYRICS_MODEL || process.env.OPENROUTER_MODEL,
        temperature: purpose === "songwriter" ? 0.7 : 0,
        maxTokens: purpose === "songwriter" ? 3500 : 2500,
        timeoutMs: 120_000,
        reasoning: false,
      });
      return { text: result.text, model: result.model };
    };
    const reports = [];
    for (const map of maps) {
      const report = await evaluateCountryFolkSong({ storyMap: map, lead: "female", complete });
      reports.push(report);
      console.log(`LIVE_EVAL_REPORT ${JSON.stringify(report)}`);
    }
    const summary = summarizeSongEvaluations(reports);
    console.log(`LIVE_EVAL_SUMMARY ${JSON.stringify(summary)}`);
    expect(reports).toHaveLength(maps.length);
  }, 900_000);
});

function loadLocalEnv(): void {
  const source = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]!]) continue;
    let value = match[2]!.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]!] = value;
  }
}
