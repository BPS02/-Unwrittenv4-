import { NextResponse } from "next/server";
import { questionsRequestSchema, firstIssueMessage } from "@/lib/validation";
import { OpenRouterError, isOpenRouterConfigured } from "@/lib/openrouter";
import { generateQuestions } from "@/lib/generate";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Shorter than lyrics — this is a small completion, and the user is waiting
// on it mid-flow.
export const maxDuration = 60;

/**
 * Follow-up questions, asked between "Shape" and "Lyrics".
 *
 * The questions are always written for THIS writer from what they actually
 * said; there is deliberately no canned fallback list (see
 * lib/generate.ts#generateQuestions). So when OpenRouter is unconfigured this
 * answers 503 with a distinguishable code rather than quietly serving generic
 * questions the writer would assume were about them.
 *
 * Free and anonymous, like /api/lyrics — only music generation is gated.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = checkGenerationRateLimit(request);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter) as NextResponse;

  if (!isOpenRouterConfigured()) {
    return NextResponse.json(
      {
        code: "QUESTIONS_UNAVAILABLE",
        error:
          "The follow-up questions need a language model, and this server doesn’t have one configured.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = questionsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  try {
    const { questions } = await generateQuestions(parsed.data);
    return NextResponse.json({ questions });
  } catch (err) {
    const message =
      err instanceof OpenRouterError ? err.message : "Something went wrong writing your questions.";
    console.error("[api/questions]", err);
    return NextResponse.json(
      { error: `We couldn’t put your questions together. ${message}` },
      { status: 502 }
    );
  }
}
