import { readFileSync } from "node:fs";

/**
 * Founder-run promotion: adds the `production` label to the exact grounded
 * prompt versions validated by the pipeline v13 evaluation (checkpoint 36)
 * and promoted by the checkpoint 37 decision. Each version keeps its
 * `staging` label, so the evaluation harness continues to serve the same
 * text. Idempotent — re-running reapplies the same labels.
 *
 *   node scripts/promote-grounded-prompts.mjs
 */

const env = {};
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}
if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
  throw new Error("Langfuse credentials are not configured in .env");
}
const base = (env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com").replace(/\/$/, "");
const auth = "Basic " + Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString("base64");

// The validated versions. Do not bump these numbers without a new evaluation.
const TARGETS = [
  ["unwritten-grounded-draft", 7],
  ["unwritten-grounded-repair", 8],
  ["unwritten-claims-audit", 6],
];

for (const [name, version] of TARGETS) {
  const res = await fetch(`${base}/api/public/v2/prompts/${encodeURIComponent(name)}/versions/${version}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({ newLabels: ["production", "staging"] }),
  });
  if (!res.ok) throw new Error(`${name} v${version}: HTTP ${res.status} ${await res.text()}`);
  const prompt = await res.json();
  console.log(`${prompt.name} v${prompt.version} labels=[${(prompt.labels ?? []).join(", ")}]`);
}
console.log("Production labels applied. The live grounded routes now serve these versions from Langfuse.");
