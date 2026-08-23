import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Langfuse v4 project compatibility", () => {
  it("uses the current scoped SDK packages instead of legacy ingestion", () => {
    const pkg = JSON.parse(source("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.langfuse).toBeUndefined();
    expect(pkg.dependencies["@langfuse/client"]).toMatch(/^\^5\./);
    expect(pkg.dependencies["@langfuse/tracing"]).toMatch(/^\^5\./);
    expect(pkg.dependencies["@langfuse/otel"]).toMatch(/^\^5\./);
  });

  it("registers the OpenTelemetry processor before server routes run", () => {
    const instrumentation = source("instrumentation.ts");
    const runtime = source("lib/langfuse-runtime.ts");
    expect(instrumentation).toContain("initializeLangfuseRuntime");
    expect(runtime).toContain('exportMode: "immediate"');
    expect(runtime).toContain("new NodeTracerProvider({ spanProcessors: [processor] })");
    expect(runtime).toContain("provider.register()");
  });

  it("puts input and output on the root generation observation", () => {
    const integration = source("lib/langfuse.ts");
    expect(integration).toContain("startObservation(");
    expect(integration).toContain('{ asType: "generation" }');
    expect(integration).toContain("input: params.input");
    expect(integration).toContain("output,");
    expect(integration).toContain("usageDetails:");
  });

  it("does not retain deprecated trace-level I/O compatibility calls", () => {
    const all = [
      source("lib/langfuse.ts"),
      source("lib/langfuse-runtime.ts"),
      source("instrumentation.ts"),
    ].join("\n");
    expect(all).not.toMatch(
      /set_current_trace_io|setActiveTraceIO|setTraceIO|set_trace_io|updateActiveTrace|updateTrace/
    );
  });

  it("continues to fetch production-labeled chat prompts with a fallback", () => {
    const integration = source("lib/langfuse.ts");
    expect(integration).toContain('label: "production"');
    expect(integration).toContain('type: "chat"');
    expect(integration).toContain("fallback:");
  });
});
