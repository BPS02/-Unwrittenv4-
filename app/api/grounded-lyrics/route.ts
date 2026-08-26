import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenRouterError } from "@/lib/openrouter";
import { generateGroundedSong, groundedFlowEnabled, type GroundedSongOutcome } from "@/lib/grounded-live";
import { getStoryMapRecord } from "@/lib/story-maps-store";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
// Draft → audit → one repair → audit is up to four model calls.
export const maxDuration = 300;

/**
 * Resolves with the first run whose song passed the gate; when none passes,
 * resolves with the last settled refusal. Rejects only when every run threw.
 */
function firstPassingRun(runs: Array<Promise<GroundedSongOutcome>>): Promise<GroundedSongOutcome> {
  return new Promise((resolve, reject) => {
    let settled = 0;
    let done = false;
    let lastRefusal: GroundedSongOutcome | null = null;
    let lastError: unknown = null;
    for (const run of runs) {
      run
        .then((outcome) => {
          if (done) return;
          if (outcome.passed && outcome.title && outcome.style && outcome.lyrics) {
            done = true;
            resolve(outcome);
            return;
          }
          lastRefusal = outcome;
          settled += 1;
          if (settled === runs.length) {
            done = true;
            resolve(lastRefusal);
          }
        })
        .catch((error: unknown) => {
          if (done) return;
          lastError = error;
          settled += 1;
          if (settled === runs.length) {
            done = true;
            if (lastRefusal) resolve(lastRefusal);
            else reject(lastError);
          }
        });
    }
  });
}

const groundedLyricsRequestSchema = z.object({
  storyMapId: z.string().regex(/^sm_[A-Za-z0-9_-]{4,64}$/),
  lead: z.enum(["female", "male"]).default("female"),
});

/**
 * Writes the song from an APPROVED Story Map through the bounded grounded
 * pipeline (source packet → draft → mechanical gates → claims audit →
 * reconciliation, one repair maximum). Free like /api/lyrics — the paywall
 * stays exactly where it has always been, on /api/music. The STYLE brief
 * travels back with the lyrics the same way the classic flow's does, so the
 * Music step needs no changes at all.
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
  const parsed = groundedLyricsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That request couldn’t be used." }, { status: 400 });
  }

  const record = await getStoryMapRecord(parsed.data.storyMapId);
  if (!record) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (record.status !== "approved") {
    return NextResponse.json(
      { error: "Approve your story first — the song is only written from what you approved." },
      { status: 409 }
    );
  }

  try {
    // The gate refuses roughly half of single runs by design (it rejects
    // rather than inventing), so one refusal is not an error the writer
    // should see. Two fresh pipeline runs — each keeping its own one-repair
    // ceiling — RACE in parallel, and the first one to pass is served, so
    // the writer waits one run's latency instead of two. Only when both
    // refuse does the honest failure surface. The doubled lyric-model spend
    // is small next to the music render this song leads to.
    const RACE_SIZE = 3;
    const outcome = await firstPassingRun(
      Array.from({ length: RACE_SIZE }, () => generateGroundedSong(record.map, parsed.data.lead))
    );
    const runs = RACE_SIZE;
    if (!outcome.passed || !outcome.title || !outcome.style || !outcome.lyrics) {
      // Make every refusal diagnosable from the deployment logs: which
      // checks failed and which claims the auditor still flags. Flags quote
      // the writer's own story content, which these logs already handle
      // (the extraction/draft prompts flow through the same infrastructure).
      const finalAttempt = outcome.report.attempts.at(-1);
      console.error(
        "[api/grounded-lyrics] gate refused",
        JSON.stringify({
          storyMapId: record.id,
          mechanical: finalAttempt?.mechanical.checks.filter((check) => !check.passed).map((check) => check.id),
          remainingFlags: finalAttempt?.reconciliation?.inventionFlags.map((flag) => ({
            claim: flag.claim,
            excerpt: flag.lyric_excerpt,
          })),
        })
      );
      // The gate refused rather than invent. Honest failure, retryable.
      return NextResponse.json(
        {
          error:
            "The song didn’t pass our accuracy check against your approved story, so we didn’t keep it. Try again — every attempt is written fresh.",
          code: "GROUNDING_FAILED",
          grounded: { passed: false, repaired: outcome.report.repaired, runs },
        },
        { status: 502 }
      );
    }
    return NextResponse.json({
      mode: "live",
      title: outcome.title,
      lyrics: outcome.lyrics,
      style: outcome.style,
      model: outcome.model,
      grounded: {
        passed: true,
        repaired: outcome.report.repaired,
        pipeline: outcome.report.version,
        storyMapId: record.id,
        runs,
      },
    });
  } catch (err) {
    const message =
      err instanceof OpenRouterError ? err.message : "Something went wrong while writing your song.";
    console.error("[api/grounded-lyrics]", err);
    return NextResponse.json({ error: `We couldn’t finish your song. ${message}` }, { status: 502 });
  }
}
