export interface SseAudioResult {
  audio: Buffer;
  /** Any streamed text content (some providers narrate alongside audio). */
  text: string;
  /** First error event seen in the stream, if any. */
  error: string | null;
}

/**
 * Shared helper for OpenRouter audio-over-SSE providers: assembles the
 * base64 audio deltas from a streaming chat-completions response, keeping
 * text output and stream-level errors for diagnostics.
 */
export async function collectAudioFromSse(
  body: ReadableStream<Uint8Array>
): Promise<SseAudioResult> {
  const decoder = new TextDecoder();
  const chunks: Buffer[] = [];
  let text = "";
  let error: string | null = null;
  let buffered = "";
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
      try {
        const evt = JSON.parse(trimmed.slice(6)) as {
          choices?: Array<{
            delta?: { audio?: { data?: string }; content?: string };
            finish_reason?: string | null;
          }>;
          error?: { message?: string; code?: number | string };
        };
        if (evt.error && !error) {
          error = typeof evt.error.message === "string" ? evt.error.message : JSON.stringify(evt.error);
        }
        const delta = evt.choices?.[0]?.delta;
        if (delta?.audio?.data) chunks.push(Buffer.from(delta.audio.data, "base64"));
        if (typeof delta?.content === "string") text += delta.content;
      } catch {
        // Keepalives and partial frames are expected; skip them.
      }
    }
  }
  return { audio: Buffer.concat(chunks), text, error };
}

/** Sniffs the audio container from magic bytes; defaults to mpeg. */
export function detectAudioMime(bytes: Buffer): string {
  const head = bytes.subarray(0, 4).toString("latin1");
  if (head === "RIFF") return "audio/wav";
  if (head === "OggS") return "audio/ogg";
  if (head.startsWith("ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) {
    return "audio/mpeg";
  }
  return "audio/mpeg";
}
