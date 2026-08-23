import type { MusicRequestParsed } from "../validation";
import { MusicProviderError, type MusicProvider, type ProviderRender } from "./provider";

/**
 * Mureka song-generation provider (https://platform.mureka.ai).
 * Enabled with MUSIC_PROVIDER=mureka and MUREKA_API_KEY.
 *
 * Mureka is lyrics-first: POST /v1/song/generate takes the lyrics plus a
 * style prompt and returns a task id; the task is polled until it succeeds
 * and yields (usually two) rendered takes. The first take's audio is
 * downloaded server-side and returned as bytes, keeping the app's streaming
 * and entitlement model unchanged.
 */

const API_BASE = "https://api.mureka.ai";
const POLL_INTERVAL_MS = 5_000;
const GENERATION_TIMEOUT_MS = 240_000;

interface MurekaTask {
  id?: string | number;
  status?: string;
  choices?: Array<{ url?: string; flac_url?: string; duration?: number }>;
  failed_reason?: string;
}

export class MurekaMusicProvider implements MusicProvider {
  readonly name = "mureka";

  isConfigured(): boolean {
    return Boolean(process.env.MUREKA_API_KEY);
  }

  async generate(req: MusicRequestParsed, stylePrompt: string): Promise<ProviderRender> {
    const apiKey = process.env.MUREKA_API_KEY;
    if (!apiKey) {
      throw new MusicProviderError("MUSIC_PROVIDER=mureka but MUREKA_API_KEY is not set.");
    }
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const startRes = await fetch(`${API_BASE}/v1/song/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        lyrics: req.lyrics.slice(0, 4000),
        model: process.env.MUREKA_MODEL || "auto",
        // Mureka's prompt is a comma-style descriptor; the production brief
        // works, truncated to stay within their limits.
        prompt: stylePrompt.slice(0, 1000),
      }),
    });
    const startBody = (await startRes.json().catch(() => null)) as MurekaTask | { error?: { message?: string } } | null;
    if (!startRes.ok) {
      const message =
        startBody && "error" in (startBody as object)
          ? ((startBody as { error?: { message?: string } }).error?.message ?? "")
          : "";
      if (startRes.status === 429) {
        throw new MusicProviderError(
          "The music engine is out of credits or at its concurrency limit. Please try again shortly."
        );
      }
      throw new MusicProviderError(
        `Mureka responded with ${startRes.status}${message ? `: ${message.slice(0, 200)}` : ""}`
      );
    }
    const taskId = (startBody as MurekaTask)?.id;
    if (!taskId) throw new MusicProviderError("Mureka did not return a task id.");

    const deadline = Date.now() + GENERATION_TIMEOUT_MS;
    for (;;) {
      if (Date.now() > deadline) {
        throw new MusicProviderError("Music generation timed out. Please try again.");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const pollRes = await fetch(`${API_BASE}/v1/song/query/${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!pollRes.ok) {
        throw new MusicProviderError(`Mureka task polling failed with ${pollRes.status}.`);
      }
      const task = (await pollRes.json()) as MurekaTask;
      if (task.status === "succeeded") {
        const url = task.choices?.[0]?.url ?? task.choices?.[0]?.flac_url;
        if (!url) throw new MusicProviderError("Mureka finished but returned no audio.");
        const audioRes = await fetch(url);
        if (!audioRes.ok) {
          throw new MusicProviderError(`Downloading the Mureka render failed with ${audioRes.status}.`);
        }
        const bytes = Buffer.from(await audioRes.arrayBuffer());
        if (bytes.length === 0) throw new MusicProviderError("Mureka returned empty audio.");
        const mimeType = audioRes.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
        return { mode: "audio", stylePrompt, provider: this.name, audio: { mimeType, bytes } };
      }
      if (task.status === "failed" || task.status === "cancelled") {
        throw new MusicProviderError(
          `Mureka could not finish the song${task.failed_reason ? `: ${task.failed_reason.slice(0, 200)}` : "."}`
        );
      }
      // preparing / queued / running / streaming → keep polling.
    }
  }
}
