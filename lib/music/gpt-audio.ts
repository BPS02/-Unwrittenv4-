import type { MusicRequestParsed } from "../validation";
import { MusicProviderError, type MusicProvider, type ProviderRender } from "./provider";
import { collectAudioFromSse } from "./sse";

/**
 * OpenAI gpt-audio provider, reached through OpenRouter's chat completions.
 * Enabled with MUSIC_PROVIDER=gpt-audio; reuses OPENROUTER_API_KEY.
 *
 * gpt-audio is a voice model, not a music model: it performs the lyrics as an
 * expressive vocal rendition (no instrumental backing track). OpenRouter only
 * emits audio over streaming, so this provider consumes the SSE stream and
 * assembles the pcm16 chunks, then wraps them in a WAV header (24kHz mono).
 */
export class GptAudioMusicProvider implements MusicProvider {
  readonly name = "gpt-audio";

  isConfigured(): boolean {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }

  async generate(req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new MusicProviderError("MUSIC_PROVIDER=gpt-audio but OPENROUTER_API_KEY is not set.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
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
          model: "openai/gpt-audio",
          stream: true,
          modalities: ["text", "audio"],
          audio: { voice: process.env.GPT_AUDIO_VOICE || "alloy", format: "pcm16" },
          messages: [
            {
              role: "system",
              content:
                "You are a singer performing a listener's original song. Perform the lyrics out loud as an expressive musical performance matching the production brief. Begin the performance immediately — no spoken introduction, commentary, or outro of any kind.",
            },
            {
              role: "user",
              content: `Production brief: ${stylePrompt}\n\nPerform these original lyrics titled "${req.title}":\n${req.lyrics.slice(0, 4000)}`,
            },
          ],
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw new MusicProviderError(
          `gpt-audio responded with ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
      }

      const collected = await collectAudioFromSse(res.body);
      const pcm = collected.audio;
      if (pcm.length === 0) {
        const why = collected.error ? ` Provider error: ${collected.error.slice(0, 200)}` : "";
        throw new MusicProviderError(`gpt-audio returned no audio.${why}`);
      }
      return {
        mode: "audio",
        stylePrompt,
        provider: this.name,
        audio: { mimeType: "audio/wav", bytes: wrapPcm16InWav(pcm) },
      };
    } catch (err) {
      if (err instanceof MusicProviderError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MusicProviderError("Music generation timed out. Please try again.");
      }
      throw new MusicProviderError(
        err instanceof Error ? `Could not reach gpt-audio: ${err.message}` : "Could not reach gpt-audio."
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Wraps raw pcm16 samples (24kHz mono — gpt-audio's output) in a WAV header. */
function wrapPcm16InWav(pcm: Buffer, sampleRate = 24_000): Buffer {
  const channels = 1;
  const bits = 16;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
