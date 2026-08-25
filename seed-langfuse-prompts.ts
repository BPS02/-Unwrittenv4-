/**
 * One-off seeding: create V4's two managed prompts in Langfuse.
 *
 * Pushes the in-repo fallbacks (lib/prompts.ts) as chat prompts with the
 * `production` label, so the app resolves them immediately and every later
 * edit happens in Langfuse with no deploy. Re-running creates a new version
 * of each prompt (also labelled `production`) — it never duplicates a name.
 *
 *   npx tsx seed-langfuse-prompts.ts            # both prompts
 *   npx tsx seed-langfuse-prompts.ts <name>     # just one (e.g. unwritten-guide)
 */
import { loadEnvConfig } from "@next/env";
import { GENERATOR_SYSTEM_PROMPT, GUIDE_SYSTEM_PROMPT } from "./lib/prompts";

interface PromptSeed {
  name: string;
  content: string;
  config: Record<string, unknown>;
  commitMessage: string;
}

async function main() {
  loadEnvConfig(process.cwd());

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = (process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/$/, "");
  if (!publicKey || !secretKey) {
    console.error("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are not set. Fill .env first.");
    process.exit(1);
  }

  const seeds: PromptSeed[] = [
    {
      name: process.env.LANGFUSE_GUIDE_PROMPT_NAME || "unwritten-guide",
      content: GUIDE_SYSTEM_PROMPT,
      // The personal-detail prompt runs on its own model, per product decision.
      // muse-spark is a MANDATORY-reasoning model: `reasoning: false` is a 400,
      // and thinking spends the token budget, so maxTokens stays generous.
      config: {
        model: "meta/muse-spark-1.2-contributor",
        temperature: 0.7,
        maxTokens: 2000,
        reasoning: true,
      },
      commitMessage: "Guide: turn personal assessments into concrete songwriting briefs",
    },
    {
      name: process.env.LANGFUSE_GENERATOR_PROMPT_NAME || "unwritten-generator",
      content: GENERATOR_SYSTEM_PROMPT,
      // No model here on purpose: the generator follows OPENROUTER_LYRICS_MODEL /
      // OPENROUTER_MODEL until one is pinned in Langfuse.
      config: {
        temperature: 0.85,
        maxTokens: 3000,
        reasoning: false,
      },
      commitMessage: "Generator: carry explicit lead voice into the music STYLE brief",
    },
  ];

  const only = process.argv[2];
  const selected = only ? seeds.filter((s) => s.name === only) : seeds;
  if (selected.length === 0) {
    console.error(`No seed named "${only}". Known: ${seeds.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  const auth = "Basic " + Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  for (const seed of selected) {
    const res = await fetch(`${baseUrl}/api/public/v2/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        name: seed.name,
        type: "chat",
        prompt: [{ role: "system", content: seed.content }],
        config: seed.config,
        labels: ["production"],
        commitMessage: seed.commitMessage,
      }),
    });
    if (!res.ok) {
      console.error(`FAILED ${seed.name}: HTTP ${res.status} — ${await res.text()}`);
      process.exit(1);
    }
    const created = (await res.json()) as { name: string; version: number; labels?: string[] };
    console.log(
      `ok ${created.name} v${created.version} labels=[${(created.labels ?? []).join(", ")}] model=${
        (seed.config.model as string | undefined) ?? "(env fallback)"
      }`
    );
  }

  // Read back through the same GET the app's SDK uses, so "seeded" means
  // "actually resolvable with the production label".
  for (const seed of selected) {
    const res = await fetch(
      `${baseUrl}/api/public/v2/prompts/${encodeURIComponent(seed.name)}?label=production`,
      { headers: { Authorization: auth } }
    );
    if (!res.ok) {
      console.error(`VERIFY FAILED ${seed.name}: HTTP ${res.status}`);
      process.exit(1);
    }
    const prompt = (await res.json()) as { name: string; version: number };
    console.log(`verified ${prompt.name} resolves at v${prompt.version} with label "production"`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
