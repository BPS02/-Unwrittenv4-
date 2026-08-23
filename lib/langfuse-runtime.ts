import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

interface LangfuseRuntimeState {
  processor: LangfuseSpanProcessor;
  provider: NodeTracerProvider;
}

const runtimeGlobal = globalThis as typeof globalThis & {
  __unwrittenLangfuseRuntime?: LangfuseRuntimeState;
};

/** Registers the v5 OpenTelemetry exporter once per server process. */
export function initializeLangfuseRuntime(): LangfuseRuntimeState | null {
  if (runtimeGlobal.__unwrittenLangfuseRuntime) return runtimeGlobal.__unwrittenLangfuseRuntime;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;

  const processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
    environment: process.env.LANGFUSE_TRACING_ENVIRONMENT,
    release: process.env.LANGFUSE_RELEASE,
    exportMode: "immediate",
    timeout: 5,
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  provider.register();

  const state = { processor, provider };
  runtimeGlobal.__unwrittenLangfuseRuntime = state;
  return state;
}

export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  return runtimeGlobal.__unwrittenLangfuseRuntime?.processor ?? null;
}
