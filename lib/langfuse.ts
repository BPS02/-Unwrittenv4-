import { LangfuseClient } from "@langfuse/client";
import { startObservation } from "@langfuse/tracing";
import { getLangfuseSpanProcessor } from "./langfuse-runtime";
import type { ReasoningSetting } from "./openrouter";

/**
 * Optional Langfuse integration (server-side only).
 *
 * Prompt management uses the v5 API client. Tracing uses the v5
 * observations-first OpenTelemetry SDK initialized by instrumentation.ts.
 * Local prompt fallbacks and no-op tracing keep Langfuse optional.
 *
 * Traces contain prompt content. Review retention and access controls before
 * enabling this integration for personal writing.
 */

let client: LangfuseClient | null | undefined;

export function getLangfuse(): LangfuseClient | null {
  if (client !== undefined) return client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    client = null;
    return client;
  }
  client = new LangfuseClient({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    timeout: 5,
  });
  return client;
}

export interface ManagedPromptConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Enable/disable provider reasoning mode (see chatComplete). */
  reasoning?: ReasoningSetting;
}

function parsePromptConfig(raw: unknown): ManagedPromptConfig {
  if (!raw || typeof raw !== "object") return {};
  const c = raw as Record<string, unknown>;
  const out: ManagedPromptConfig = {};
  if (typeof c.model === "string" && c.model.length > 0) out.model = c.model;
  if (typeof c.temperature === "number" && Number.isFinite(c.temperature)) {
    out.temperature = c.temperature;
  }
  if (typeof c.maxTokens === "number" && Number.isFinite(c.maxTokens) && c.maxTokens > 0) {
    out.maxTokens = Math.floor(c.maxTokens);
  }
  if (
    typeof c.reasoning === "boolean" ||
    ["minimal", "low", "medium", "high", "xhigh", "max"].includes(String(c.reasoning))
  ) {
    out.reasoning = c.reasoning as ReasoningSetting;
  }
  return out;
}

/** Fetches the production CHAT prompt, falling back locally on any failure. */
export async function getManagedPrompt(
  name: string | undefined,
  fallback: string
): Promise<{
  text: string;
  source: "langfuse" | "local";
  version?: number;
  config: ManagedPromptConfig;
}> {
  const lf = getLangfuse();
  if (!lf || !name) return { text: fallback, source: "local", config: {} };
  try {
    const prompt = await lf.prompt.get(name, {
      label: "production",
      type: "chat",
      fallback: [{ role: "system", content: fallback }],
      maxRetries: 1,
      fetchTimeoutMs: 4000,
    });
    const compiled = prompt.compile();
    const messages = Array.isArray(compiled)
      ? compiled.filter(
          (m): m is { role: string; content: string } =>
            Boolean(m) && typeof m === "object" && typeof m.content === "string"
        )
      : [];
    const systemMessages = messages.filter((m) => m.role === "system");
    const text = (systemMessages.length > 0 ? systemMessages : messages)
      .map((m) => m.content)
      .join("\n\n");
    if (!text) return { text: fallback, source: "local", config: {} };
    return {
      text,
      source: prompt.isFallback ? "local" : "langfuse",
      version: prompt.isFallback ? undefined : prompt.version,
      config: prompt.isFallback ? {} : parsePromptConfig(prompt.config),
    };
  } catch {
    return { text: fallback, source: "local", config: {} };
  }
}

export interface GenerationTrace {
  end(output: string, usage?: { promptTokens?: number; completionTokens?: number }): void;
  error(message: string): void;
  flush(): Promise<void>;
}

const NOOP_TRACE: GenerationTrace = {
  end: () => {},
  error: () => {},
  flush: async () => {},
};

/**
 * Creates one root generation observation. Its input/output and metadata are
 * the v4 query/evaluator contract; deprecated trace-level I/O is not used.
 */
export function startGeneration(params: {
  name: string;
  model: string;
  input: unknown;
  metadata?: Record<string, unknown>;
}): GenerationTrace {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return NOOP_TRACE;
  }
  if (!getLangfuseSpanProcessor()) return NOOP_TRACE;

  try {
    const generation = startObservation(
      params.name,
      { model: params.model, input: params.input, metadata: params.metadata },
      { asType: "generation" }
    );
    return {
      end: (output, usage) => {
        const usageDetails: Record<string, number> = {};
        if (typeof usage?.promptTokens === "number") usageDetails.input = usage.promptTokens;
        if (typeof usage?.completionTokens === "number") usageDetails.output = usage.completionTokens;
        generation
          .update({
            output,
            usageDetails: Object.keys(usageDetails).length > 0 ? usageDetails : undefined,
          })
          .end();
      },
      error: (message) => {
        generation.update({ level: "ERROR", statusMessage: message }).end();
      },
      flush: async () => {
        try {
          const processor = getLangfuseSpanProcessor();
          if (!processor) return;

          // Tracing is best-effort. A slow telemetry endpoint must never hold
          // a user-facing generation request open until Vercel terminates it.
          let timeout: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            processor.forceFlush(),
            new Promise<void>((resolve) => {
              timeout = setTimeout(resolve, 1_500);
            }),
          ]);
          if (timeout) clearTimeout(timeout);
        } catch {
          // Tracing must never break the user-facing request.
        }
      },
    };
  } catch {
    return NOOP_TRACE;
  }
}
