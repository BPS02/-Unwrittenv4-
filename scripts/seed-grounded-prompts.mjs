import { readFileSync } from "node:fs";
import { LangfuseClient } from "@langfuse/client";

if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
  throw new Error("Langfuse credentials are not configured");
}

const client = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
});

const draftSource = readFileSync(new URL("../lib/grounded-song-draft.ts", import.meta.url), "utf8");
const auditSource = readFileSync(new URL("../lib/song-validator.ts", import.meta.url), "utf8");
// STAGING_PROMPT_MODEL pins the staging config model explicitly (e.g. the
// deepseek evaluation runs); otherwise the env lyric model is used.
const model =
  process.env.STAGING_PROMPT_MODEL ||
  process.env.OPENROUTER_LYRICS_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "anthropic/claude-sonnet-4.5";

const prompts = [
  {
    name: "unwritten-grounded-draft",
    content: extractTemplate(draftSource, "GROUNDED_DRAFT_SYSTEM_PROMPT"),
    temperature: 0.45,
    maxTokens: 4000,
    commitMessage: "Stage grounded-draft.v5: STYLE must name the final sound and never fade",
  },
  {
    name: "unwritten-grounded-repair",
    content: extractTemplate(draftSource, "GROUNDED_REPAIR_SYSTEM_PROMPT"),
    temperature: 0.35,
    maxTokens: 4000,
    commitMessage: "Stage grounded-repair.v7 targeting grounded-draft.v5",
  },
  {
    name: "unwritten-claims-audit",
    content: extractTemplate(auditSource, "SONG_CLAIMS_AUDIT_SYSTEM_PROMPT"),
    temperature: 0,
    maxTokens: 2500,
    commitMessage: "Stage claims-audit.v4 for grounded pipeline evaluation",
  },
];

// Pass prompt names as arguments to push a subset, e.g.:
//   node scripts/seed-grounded-prompts.mjs unwritten-grounded-draft
const only = process.argv.slice(2);
const selected = only.length > 0 ? prompts.filter((prompt) => only.includes(prompt.name)) : prompts;
if (only.length > 0 && selected.length !== only.length) {
  throw new Error(`Unknown prompt name in: ${only.join(", ")}`);
}

for (const prompt of selected) {
  const created = await client.prompt.create({
    name: prompt.name,
    type: "chat",
    prompt: [{ role: "system", content: prompt.content }],
    labels: ["staging"],
    config: {
      model,
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
      reasoning: false,
    },
    commitMessage: prompt.commitMessage,
  });
  console.log(`${created.name} v${created.version} [staging]`);
}

function extractTemplate(source, exportName) {
  const marker = `export const ${exportName} = \``;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${exportName}`);
  const contentStart = start + marker.length;
  const end = source.indexOf("`;", contentStart);
  if (end < 0) throw new Error(`Could not find the end of ${exportName}`);
  const content = source.slice(contentStart, end);
  if (content.includes("${")) throw new Error(`${exportName} contains interpolation and cannot be seeded safely`);
  return content;
}
