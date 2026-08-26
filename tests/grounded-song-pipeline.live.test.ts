import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { runGroundedSongPipeline, type GroundedPipelineModel } from "@/lib/grounded-song-pipeline";
import { COUNTRY_FOLK_MODULE_PROMPT, soloVocalModulePrompt, type SoloLead } from "@/lib/songwriting-modules";
import { chatComplete } from "@/lib/openrouter";
import { getLangfuse } from "@/lib/langfuse";
import { storyMapSchema } from "@/lib/story-map";

interface Fixture { tags: string[]; story_map: unknown }
const enabled = process.env.RUN_LIVE_GROUNDED_EVAL === "1";

describe.skipIf(!enabled)("live grounded pipeline evaluation", () => {
  beforeAll(() => loadLocalEnv(), 10_000);

  it("runs every approved country/folk fixture through the bounded pipeline", async () => {
    const fixtures = JSON.parse(readFileSync(new URL("./fixtures/story-maps/story-maps.v1.json", import.meta.url), "utf8")) as Fixture[];
    const selected = fixtures.filter((fixture) => fixture.tags.includes("country_folk"));
    const stagingSystems = process.env.RUN_LANGFUSE_STAGING_EVAL === "1" ? await loadStagingSystems() : {};
    const complete: GroundedPipelineModel = async ({ system, user, purpose }) => {
      const staged = stagingSystems[purpose];
      const result = await chatComplete({
        system: staged?.system ?? system,
        user,
        // Model priority: staging prompt config → env, mirroring production's
        // prompt-config-first rule so a Langfuse model pin actually serves.
        model: staged?.model || process.env.OPENROUTER_LYRICS_MODEL || process.env.OPENROUTER_MODEL,
        temperature: purpose === "claims_audit" ? 0 : 0.45,
        maxTokens: purpose === "claims_audit" ? 2500 : 4000,
        timeoutMs: 120_000,
        reasoning: false,
      });
      return { text: result.text, model: result.model };
    };
    const reports = [];
    for (const fixture of selected) {
      const map = storyMapSchema.parse(fixture.story_map);
      const lead: SoloLead = fixture.tags.includes("solo_male") ? "male" : "female";
      const report = await runGroundedSongPipeline({
        storyMap: map,
        productionModules: `${COUNTRY_FOLK_MODULE_PROMPT}\n\n${soloVocalModulePrompt(lead)}`,
        complete,
      });
      reports.push(report);
      console.log(`LIVE_GROUNDED_REPORT ${JSON.stringify(report)}`);
    }
    const summary = {
      version: "grounded-pipeline.v13",
      total: reports.length,
      passed: reports.filter((report) => report.passed).length,
      repaired: reports.filter((report) => report.repaired).length,
      passedAfterRepair: reports.filter((report) => report.passed && report.repaired).length,
      failed: reports.filter((report) => !report.passed).map((report) => report.storyMapId),
    };
    const artifactPath = process.env.LIVE_GROUNDED_REPORT_PATH;
    if (artifactPath) writeFileSync(artifactPath, `${JSON.stringify({ summary, reports }, null, 2)}\n`, "utf8");
    console.log(`LIVE_GROUNDED_SUMMARY ${JSON.stringify(summary)}`);
    expect(reports).toHaveLength(selected.length);
  }, 1_200_000);
});

interface StagingPrompt { system: string; model?: string }

async function loadStagingSystems(): Promise<Partial<Record<"grounded_draft" | "grounded_repair" | "claims_audit", StagingPrompt>>> {
  const client = getLangfuse();
  if (!client) throw new Error("Langfuse is not configured for the staging evaluation.");
  const names = {
    grounded_draft: "unwritten-grounded-draft",
    grounded_repair: "unwritten-grounded-repair",
    claims_audit: "unwritten-claims-audit",
  } as const;
  const entries = await Promise.all(Object.entries(names).map(async ([purpose, name]) => {
    const prompt = await client.prompt.get(name, { label: "staging", type: "chat" });
    const compiled = prompt.compile() as unknown;
    if (!Array.isArray(compiled)) throw new Error(`${name} did not compile as a chat prompt.`);
    const text = compiled
      .filter((message): message is { role: string; content: string } => Boolean(message) && typeof message === "object" && typeof message.content === "string")
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    if (!text) throw new Error(`${name} has no system message.`);
    const config = prompt.config as { model?: unknown } | null | undefined;
    const model = config && typeof config.model === "string" && config.model.length > 0 ? config.model : undefined;
    console.log(`LANGFUSE_STAGING_PROMPT ${name} v${prompt.version} model=${model ?? "(env fallback)"}`);
    return [purpose, { system: text, ...(model ? { model } : {}) }] as const;
  }));
  return Object.fromEntries(entries);
}

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
