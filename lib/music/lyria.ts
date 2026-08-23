import type { MusicRequestParsed } from "../validation";
import { MusicProviderError, type MusicProvider, type ProviderRender } from "./provider";
import { collectAudioFromSse, detectAudioMime } from "./sse";

/**
 * Google Lyria 3 music provider, reached through OpenRouter's chat
 * completions. Enabled with MUSIC_PROVIDER=lyria; reuses OPENROUTER_API_KEY.
 *
 * Unlike gpt-audio (voice only), Lyria generates full songs — vocals plus
 * instrumental backing (48kHz, ~$0.08 per song). OpenRouter emits the audio
 * only over streaming; the assembled bytes are an MP3 (sniffed to be safe).
 */
export class LyriaMusicProvider implements MusicProvider {
  readonly name = "lyria";

  isConfigured(): boolean {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }

  async generate(req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new MusicProviderError("MUSIC_PROVIDER=lyria but OPENROUTER_API_KEY is not set.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300_000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.OPENROUTER_APP_NAME || "Unwritten",
        },
        body: JSON.stringify({
          model: process.env.LYRIA_MODEL || "google/lyria-3-pro-preview",
          stream: true,
          modalities: ["text", "audio"],
          messages: [
            {
              role: "user",
              content: `${stylePrompt}\n\nSing these original lyrics for a song titled "${req.title}":\n${req.lyrics.slice(0, 4000)}`,
            },
          ],
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new MusicProviderError(
          `Lyria responded with ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
      }

      const collected = await collectAudioFromSse(res.body);
      const bytes = collected.audio;
      if (bytes.length === 0) {
        const why = collected.error
          ? ` Provider error: ${collected.error.slice(0, 200)}`
          : collected.text
            ? ` Model output: ${collected.text.slice(0, 200)}`
            : "";
        throw new MusicProviderError(`Lyria returned no audio.${why}`);
      }
      return {
        mode: "audio",
        stylePrompt,
        provider: this.name,
        audio: { mimeType: detectAudioMime(bytes), bytes },
      };
    } catch (err) {
      if (err instanceof MusicProviderError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MusicProviderError("Music generation timed out. Please try again.");
      }
      throw new MusicProviderError(
        err instanceof Error ? `Could not reach Lyria: ${err.message}` : "Could not reach Lyria."
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
