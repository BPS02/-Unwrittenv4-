import { NextResponse } from "next/server";
import { generateTemplateThought } from "@/lib/generate";
import { getTemplate } from "@/lib/templates";
import { verifyStartingPoint } from "@/lib/starting-points";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * The opening thought a starting point drops into the box.
 *
 * The client sends a template ID ONLY — the theme, tagline and feelings are
 * looked up server-side from lib/templates.ts. A client that could post its
 * own theme text would be an open prompt-injection surface on an unauthenticated
 * route; an id that isn't one of the ten is simply rejected.
 *
 * Free and anonymous, like /api/lyrics: this fires before anyone has signed in.
 * It never fails the user — on any provider trouble it answers 200 with the
 * template's shipped starter thought and mode "demo".
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

  const raw = (body ?? {}) as {
    templateId?: unknown;
    point?: unknown;
    token?: unknown;
    variation?: unknown;
  };

  const rawVariation = Number(raw.variation);
  const variation = Number.isFinite(rawVariation) ? Math.abs(Math.floor(rawVariation)) % 1000 : 0;

  // ── Built-in tile: looked up server-side, so no client text is trusted.
  if (typeof raw.templateId === "string") {
    const template = getTemplate(raw.templateId);
    if (!template) {
      return NextResponse.json({ error: "Unknown starting point." }, { status: 404 });
    }
    const result = await generateTemplateThought({
      theme: template.theme,
      tagline: template.tagline,
      feelings: template.feelings,
      fallback: template.starterThought,
      variation,
    });
    return NextResponse.json({
      thought: result.thought,
      mode: result.mode,
      templateId: template.id,
    });
  }

  // ── Generated tile: only accepted with a signature this server produced.
  const point = raw.point as
    | { theme?: unknown; tagline?: unknown; feelings?: unknown }
    | undefined;
  if (
    !point ||
    typeof point.theme !== "string" ||
    typeof point.tagline !== "string" ||
    !Array.isArray(point.feelings) ||
    typeof raw.token !== "string"
  ) {
    return NextResponse.json({ error: "A starting point is required." }, { status: 400 });
  }

  const feelings = point.feelings.filter((f): f is string => typeof f === "string");
  const candidate = { theme: point.theme, tagline: point.tagline, feelings };
  if (!verifyStartingPoint(candidate, raw.token)) {
    // Either forged, or edited after we signed it. Refuse rather than feed
    // arbitrary client text to the model on an unauthenticated route.
    return NextResponse.json({ error: "That starting point isn't valid." }, { status: 400 });
  }

  const result = await generateTemplateThought({
    ...candidate,
    // A generated tile has no shipped starter, so the honest fallback is a
    // blank box — better than a canned line that contradicts the tile.
    fallback: "",
    variation,
  });

  return NextResponse.json({ thought: result.thought, mode: result.mode });
}
