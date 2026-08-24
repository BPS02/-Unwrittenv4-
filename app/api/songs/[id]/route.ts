import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { deleteSong, updateSong } from "@/lib/songs-store";

export const runtime = "nodejs";

/**
 * Mutations on one owned saved song. Records are stored under the owner's
 * userId (resolved from auth() only), so cross-user access is impossible.
 */

async function requireUser(): Promise<string | NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { reason: "signin_required", error: "Sign in to manage your songs." },
      { status: 401 }
    );
  }
  return userId;
}

/** PATCH favorite or a generated cover on one owned song. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const favorite = record.favorite;
  const coverArt = record.coverArt;
  const patch: { favorite?: boolean; coverArt?: string } = {};
  if (favorite !== undefined) {
    if (typeof favorite !== "boolean") return NextResponse.json({ error: "favorite must be true or false." }, { status: 400 });
    patch.favorite = favorite;
  }
  if (coverArt !== undefined) {
    if (typeof coverArt !== "string" || coverArt.length > 2_000_000 || !/^data:image\/(jpeg|png);base64,/.test(coverArt)) {
      return NextResponse.json({ error: "coverArt must be a valid image data URL." }, { status: 400 });
    }
    patch.coverArt = coverArt;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Provide favorite or coverArt." }, { status: 400 });

  const updated = await updateSong(userId, id, patch);
  if (!updated) return NextResponse.json({ error: "Song not found." }, { status: 404 });
  return NextResponse.json({ id: updated.id, favorite: updated.favorite === true, coverArt: updated.coverArt ?? null });
}

/** DELETE — removes the song record and its audio. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const { id } = await params;
  const removed = await deleteSong(userId, id);
  if (!removed) return NextResponse.json({ error: "Song not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
