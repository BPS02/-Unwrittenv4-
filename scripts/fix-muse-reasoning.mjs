import { LangfuseClient } from "@langfuse/client";

if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
  throw new Error("Langfuse credentials are not configured");
}

const client = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
});
const generatorBase = process.env.LANGFUSE_GENERATOR_PROMPT_NAME || "unwritten-generator";
const names = [
  process.env.LANGFUSE_GUIDE_PROMPT_NAME || "unwritten-guide",
  ...[
    "pop",
    "acoustic-folk",
    "rnb-soul",
    "indie",
    "rock",
    "country",
    "hip-hop",
    "electronic",
    "lo-fi",
  ].map((slug) => `${generatorBase}-${slug}`),
];

for (const name of names) {
  const current = await client.prompt.get(name, { label: "production", type: "chat" });
  const created = await client.prompt.create({
    name,
    type: "chat",
    prompt: current.prompt,
    labels: ["production"],
    config: { ...current.config, reasoning: true },
    commitMessage: "Enable mandatory Muse reasoning",
  });
  console.log(`${created.name} v${created.version}`);
}
