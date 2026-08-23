import type { MusicRequestParsed } from "../validation";
import { ElevenLabsMusicProvider } from "./elevenlabs";
import { GptAudioMusicProvider } from "./gpt-audio";
import { LyriaMusicProvider } from "./lyria";
import { MurekaMusicProvider } from "./mureka";

/**
 * Music provider abstraction.
 *
 * OpenRouter is an LLM gateway — it does not produce audio. Actual audio
 * generation needs a dedicated music API. This interface keeps that pluggable:
 *
 * - `demo` (default): returns the constructed style prompt and defers audio to
 *   the browser's local synthesizer (lib/demo-audio.ts) — no external service.
 * - `elevenlabs`: calls the ElevenLabs Music API and returns real audio.
 *
 * Providers return raw audio bytes to the SERVER (`ProviderRender`). The API
 * route decides how audio reaches the client (a short-lived streaming token,
 * see lib/audio-store.ts) so that entitlement rules like "streaming only for
 * the free song" are enforced in one place.
 *
 * To add a provider (e.g. Suno via a gateway, Stability Audio, Replicate):
 * implement MusicProvider in a new file under lib/music/, register it in
 * getMusicProvider() below, and document its env vars in .env.example.
 * See README "Connecting a real music API" for step-by-step instructions.
 */

/** Server-internal render result. Audio bytes never leave the server as-is. */
export type ProviderRender =
  | { mode: "demo"; stylePrompt: string }
  | {
      mode: "audio";
      stylePrompt: string;
      provider: string;
      audio: { bytes: Buffer; mimeType: string };
    };

export interface MusicProvider {
  readonly name: string;
  /** Whether required credentials are present. */
  isConfigured(): boolean;
  /**
   * Generates music for the request. `stylePrompt` is the production brief
   * (LLM-constructed when OpenRouter is configured, deterministic otherwise).
   */
  generate(req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender>;
}

export class DemoMusicProvider implements MusicProvider {
  readonly name = "demo";
  isConfigured(): boolean {
    return true;
  }
  async generate(_req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender> {
    return { mode: "demo", stylePrompt };
  }
}

export class MusicProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicProviderError";
  }
}

export function getMusicProvider(): MusicProvider {
  const which = (process.env.MUSIC_PROVIDER || "demo").toLowerCase();
  switch (which) {
    case "elevenlabs":
      return new ElevenLabsMusicProvider();
    case "gpt-audio":
      return new GptAudioMusicProvider();
    case "lyria":
      return new LyriaMusicProvider();
    case "mureka":
      return new MurekaMusicProvider();
    case "demo":
    case "":
      return new DemoMusicProvider();
    default:
      throw new MusicProviderError(
        `Unknown MUSIC_PROVIDER "${which}". Supported: demo, elevenlabs, gpt-audio, lyria, mureka.`
      );
  }
}
