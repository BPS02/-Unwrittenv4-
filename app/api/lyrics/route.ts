import { NextResponse } from "next/server";
import { lyricsRequestSchema, firstIssueMessage } from "@/lib/validation";
import { OpenRouterError } from "@/lib/openrouter";
import type { LyricsResult } from "@/lib/types";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { generatePersonalizedLyrics } from "@/lib/personalized-lyrics";

export const runtime = "nodejs";
// LLM lyric generation can take tens of seconds; extend past the default.
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const limit = checkGenerationRateLimit(request);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter) as NextResponse;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = lyricsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  // Generation itself lives in lib/generate.ts so the MCP server produces
  // songs exactly the way this route does.
  try {
    const result: LyricsResult = await generatePersonalizedLyrics(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof OpenRouterError
        ? err.message
        : "Something went wrong while writing your lyrics.";
    console.error("[api/lyrics]", err);
    return NextResponse.json(
      { error: `We couldn't finish your lyrics. ${message}` },
      { status: 502 }
    );
  }
}
