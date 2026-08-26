import { NextResponse } from "next/server";
import { lyricsRequestSchema, firstIssueMessage } from "@/lib/validation";
import { OpenRouterError } from "@/lib/openrouter";
import { extractStoryMapDraft, groundedFlowEnabled } from "@/lib/grounded-live";
import { createStoryMapDraft } from "@/lib/story-maps-store";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Extracts a draft Story Map from the writer's interview ("Here's what I
 * heard"). Grounded-flow only: while GROUNDED_FLOW is off this route does
 * not exist as far as clients are concerned, so the classic flow is
 * completely unaffected. Like /api/questions there is no deterministic
 * fallback — a canned Story Map presented as "what I heard" would be a lie.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!groundedFlowEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
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

  try {
    const extraction = await extractStoryMapDraft(parsed.data);
    const record = await createStoryMapDraft(extraction.storyMap, extraction.flags);
    return NextResponse.json({
      storyMapId: record.id,
      storyMap: record.map,
      flags: record.flags,
    });
  } catch (err) {
    const message =
      err instanceof OpenRouterError ? err.message : "We couldn’t put your story together just now.";
    console.error("[api/story-map]", err);
    return NextResponse.json(
      { error: message, code: "STORY_MAP_UNAVAILABLE" },
      { status: err instanceof OpenRouterError && !process.env.OPENROUTER_API_KEY ? 503 : 502 }
    );
  }
}
