import { NextResponse } from "next/server";
import { generateStartingPoints } from "@/lib/generate";
import {
  builtInStartingPoints,
  glyphFor,
  signStartingPoint,
  type StartingPointWire,
} from "@/lib/starting-points";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 45;

const COUNT = 10;
/** Below this the set doesn't read as written-for-you; use the curated ten. */
const MIN_GENERATED = 6;

/**
 * The starting-point tiles.
 *
 * Generated fresh by the model when OpenRouter is configured, otherwise the
 * shipped ten from lib/templates.ts. Either way the gallery is never empty —
 * this is the first screen of someone who came here to write.
 *
 * Every generated tile is returned with an HMAC over its own fields, because
 * /api/template-thought will later be handed one back and must be able to
 * tell "a tile we wrote" from "text this client made up".
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = checkGenerationRateLimit(request);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter) as NextResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const raw = (body ?? {}) as { avoid?: unknown; variation?: unknown };
  const avoid = Array.isArray(raw.avoid)
    ? raw.avoid.filter((t): t is string => typeof t === "string" && t.length < 80).slice(0, 40)
    : [];
  const parsedVariation = Number(raw.variation);
  const variation = Number.isFinite(parsedVariation)
    ? Math.abs(Math.floor(parsedVariation)) % 1000
    : 0;

  const { points, mode } = await generateStartingPoints({ count: COUNT, avoid, variation });

  // Too few to feel generated — show the curated ten rather than a thin grid.
  if (mode === "demo" || points.length < MIN_GENERATED) {
    return NextResponse.json({ points: builtInStartingPoints(), mode: "demo" });
  }

  const wire: StartingPointWire[] = points.map((point, i) => ({
    id: `gen-${variation}-${i}`,
    theme: point.theme,
    tagline: point.tagline,
    feelings: point.feelings,
    glyph: glyphFor(i),
    token: signStartingPoint(point),
  }));

  // A short set is topped up from the shipped ten rather than leaving gaps —
  // a model that returns eight good rows should not cost the visitor a full
  // grid, and the two shapes are already handled per-tile downstream.
  if (wire.length < COUNT) {
    const taken = new Set(wire.map((p) => p.theme.toLowerCase()));
    for (const fallback of builtInStartingPoints()) {
      if (wire.length >= COUNT) break;
      if (taken.has(fallback.theme.toLowerCase())) continue;
      wire.push({ ...fallback, glyph: glyphFor(wire.length) });
    }
  }

  return NextResponse.json({ points: wire, mode: "live" });
}
