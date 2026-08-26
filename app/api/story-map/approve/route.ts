import { NextResponse } from "next/server";
import { z } from "zod";
import { approveStoryMap } from "@/lib/story-map-approval";
import { storyMapSchema } from "@/lib/story-map";
import { groundedFlowEnabled } from "@/lib/grounded-live";
import { getStoryMapRecord, saveApprovedStoryMap } from "@/lib/story-maps-store";
import { checkGenerationRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const approveRequestSchema = z.object({
  storyMapId: z.string().regex(/^sm_[A-Za-z0-9_-]{4,64}$/),
  /** The writer-edited draft from the review screen. */
  storyMap: storyMapSchema,
  /** Indexes into the SERVER-stored flag list the writer resolved on screen. */
  resolvedFlagIndexes: z.array(z.number().int().min(0).max(19)).max(20).default([]),
});

/**
 * Approves a Story Map after the "Here's what I heard" review. The server
 * performs the approval itself against its own stored record: the client's
 * edits to the writer-owned story content are accepted, but the id, the
 * draft status precondition, and the unresolved-contradiction gate are all
 * enforced here — never trusted from the browser.
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
  const parsed = approveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That review couldn’t be used." }, { status: 400 });
  }
  const { storyMapId, storyMap, resolvedFlagIndexes } = parsed.data;

  const record = await getStoryMapRecord(storyMapId);
  // Unknown and unauthorized are indistinguishable on purpose (404, not 403).
  if (!record) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (record.status !== "draft") {
    return NextResponse.json({ error: "This story has already been approved." }, { status: 409 });
  }

  const resolved = new Set(resolvedFlagIndexes);
  const unresolvedFlags = record.flags.filter((_, index) => !resolved.has(index));

  try {
    // The map content is the writer's own story, so their edits stand; the id
    // and status come from the server record, never from the body.
    const approved = approveStoryMap(
      storyMapSchema.parse({ ...storyMap, story_map_id: record.id, status: "draft" }),
      unresolvedFlags
    );
    await saveApprovedStoryMap(record.id, approved);
    return NextResponse.json({ storyMapId: record.id, status: "approved" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Approval failed.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
