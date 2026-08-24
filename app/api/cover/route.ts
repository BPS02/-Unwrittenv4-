import { NextResponse } from "next/server";
import { z } from "zod";
import { GENRES, MOODS } from "@/lib/types";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const coverRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  lyrics: z.string().trim().min(10).max(8000),
  genre: z.enum(GENRES),
  mood: z.enum(MOODS),
  style: z.string().trim().max(1200).optional(),
});

/**
 * Generates one square, text-free album cover through OpenRouter's dedicated
 * Images API. This is intentionally separate from the lyric prompt: the
 * generator writes words and production direction; GPT Image interprets the
 * finished song visually.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = checkGenerationRateLimit(request);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter) as NextResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  const parsed = coverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid cover request." }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Album-cover generation is not configured." }, { status: 503 });
  }

  const { title, lyrics, genre, mood, style } = parsed.data;
  const lyricExcerpt = lyrics.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").slice(0, 1000);
  const prompt = [
    "Create a finished square album-cover image for one deeply personal song.",
    `Song title (context only; do not render it): ${JSON.stringify(title)}.`,
    `Musical direction: ${genre}; ${mood}.`,
    style ? `Production atmosphere: ${style.slice(0, 650)}.` : "",
    `Lyric imagery to interpret visually: ${JSON.stringify(lyricExcerpt)}.`,
    "Choose one emotionally specific visual metaphor from the lyrics. Cinematic editorial photography with tactile natural texture, intimate composition, restrained color, and beautiful practical light. The result should feel like a real record cover, not generic stock art.",
    "No words, letters, typography, title, logo, signature, watermark, border, frame, CD, vinyl record, or album mockup. Do not imitate any named artist. Do not invent a recognizable real person.",
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
        ...(process.env.OPENROUTER_APP_NAME ? { "X-Title": process.env.OPENROUTER_APP_NAME } : {}),
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_COVER_MODEL || "openai/gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "low",
        output_format: "jpeg",
        output_compression: 82,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[api/cover] OpenRouter", response.status, detail.slice(0, 300));
      return NextResponse.json({ error: "The album cover couldn’t be painted just now." }, { status: 502 });
    }

    const result = await response.json() as {
      data?: Array<{ b64_json?: string; url?: string }>;
      model?: string;
    };
    const image = result.data?.[0];
    if (!image?.b64_json && !image?.url) {
      return NextResponse.json({ error: "The image service returned no cover." }, { status: 502 });
    }
    let imageUrl = image.b64_json ? `data:image/jpeg;base64,${image.b64_json}` : "";
    if (!imageUrl && image.url) {
      const imageResponse = await fetch(image.url, { signal: controller.signal });
      if (!imageResponse.ok) throw new Error("Could not download generated cover");
      const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      imageUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
    }
    return NextResponse.json(
      { imageUrl, model: result.model ?? process.env.OPENROUTER_COVER_MODEL ?? "openai/gpt-image-1" },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("[api/cover]", error);
    return NextResponse.json({ error: "The album cover couldn’t be painted just now." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
