/** Next.js initializes server tracing through this hook before route code. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initializeLangfuseRuntime } = await import("./lib/langfuse-runtime");
  initializeLangfuseRuntime();
}
