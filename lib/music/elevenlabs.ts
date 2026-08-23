import type { MusicRequestParsed } from "../validation";
import { MusicProviderError, type MusicProvider, type ProviderRender } from "./provider";

/**
 * ElevenLabs Music API provider (https://elevenlabs.io/docs/api-reference/music).
 * Enabled with MUSIC_PROVIDER=elevenlabs and ELEVENLABS_API_KEY.
 *
 * The composition endpoint takes a text prompt and returns audio bytes; we
 * return them to the client as a data URL so no audio is persisted server-side.
 */
export class ElevenLabsMusicProvider implements MusicProvider {
  readonly name = "elevenlabs";

  isConfigured(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  }

  async generate(req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new MusicProviderError(
        "MUSIC_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is not set."
      );
    }
    const lengthMs = clampLength(Number(process.env.MUSIC_LENGTH_MS) || 30_000);
    const prompt =
      `${stylePrompt}\n\nUse these lyrics for the vocals:\n${req.lyrics.slice(0, 4000)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/music", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, music_length_ms: lengthMs }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new MusicProviderError(
          `ElevenLabs responded with ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) {
        throw new MusicProviderError("ElevenLabs returned empty audio.");
      }
      const mimeType = res.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
      return {
        mode: "audio",
        stylePrompt,
        provider: this.name,
        audio: { mimeType, bytes },
      };
    } catch (err) {
      if (err instanceof MusicProviderError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new MusicProviderError("Music generation timed out. Please try again.");
      }
      throw new MusicProviderError(
        err instanceof Error ? `Could not reach ElevenLabs: ${err.message}` : "Could not reach ElevenLabs."
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function clampLength(ms: number): number {
  return Math.min(Math.max(ms, 10_000), 300_000);
}
