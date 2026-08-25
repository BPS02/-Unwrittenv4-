/**
 * Minimal server-side OpenRouter chat client. The API key never leaves the
 * server; client code only ever talks to our own /api routes.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function getModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

/** Model for lyric generation; falls back to the app-wide model. */
export function getLyricsModel(): string {
  return process.env.OPENROUTER_LYRICS_MODEL || getModel();
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  usage?: ChatUsage;
}

export async function chatComplete(params: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** Explicitly enable/disable provider reasoning ("thinking") mode. Reasoning
   *  models like DeepSeek v4 reason by default and can spend the entire token
   *  budget thinking, returning an empty completion. Omit to use the
   *  provider's default. */
  reasoning?: boolean;
}): Promise<ChatResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not configured.");
  }
  const model = params.model ?? getModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 60_000);
  try {
    const request = async (reasoning: boolean | undefined) =>
      fetch(OPENROUTER_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "Unwritten",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          temperature: params.temperature ?? 0.85,
          max_tokens: params.maxTokens ?? 1500,
          ...(reasoning === undefined ? {} : { reasoning: { enabled: reasoning } }),
        }),
      });

    let res = await request(params.reasoning);
    // Some OpenRouter models require reasoning and reject an explicit false.
    // A stale managed-prompt config must not make the writing flow fail.
    if (res.status === 400 && params.reasoning === false) {
      const rejectedBody = await res.text().catch(() => "");
      if (/reasoning is mandatory|cannot be disabled/i.test(rejectedBody)) {
        res = await request(undefined);
      } else {
        throw new OpenRouterError(
          `OpenRouter responded with ${res.status}${rejectedBody ? `: ${rejectedBody.slice(0, 300)}` : ""}`,
          res.status
        );
      }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter responded with ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
        res.status
      );
    }
    const data: unknown = await res.json();
    const parsed = data as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: ChatUsage;
    };
    const text = parsed.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new OpenRouterError("OpenRouter returned an empty completion.");
    }
    return { text, model: parsed.model ?? model, usage: parsed.usage };
  } catch (err) {
    if (err instanceof OpenRouterError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new OpenRouterError("The model took too long to respond. Please try again.");
    }
    throw new OpenRouterError(
      err instanceof Error ? `Could not reach OpenRouter: ${err.message}` : "Could not reach OpenRouter."
    );
  } finally {
    clearTimeout(timeout);
  }
}
