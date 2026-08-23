import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import {
  PlaylistError,
  addSongToPlaylist,
  deletePlaylist,
  readPlaylist,
  removeSongFromPlaylist,
  renamePlaylist,
} from "@/lib/playlists-store";

export const runtime = "nodejs";

/**
 * One playlist the caller owns.
 *
 * GET    — the playlist and its song ids
 * PATCH  — { name } to rename, { add: songId } / { remove: songId } for tracks
 * DELETE — removes the playlist (its items cascade; the songs are untouched)
 *
 * The store resolves ownership for all of these and throws 404 when the
 * playlist isn't the caller's, so a guessed id reveals nothing.
 */
async function requireUser(): Promise<string | NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { reason: "signin_required", error: "Sign in to manage your playlists." },
      { status: 401 }
    );
  }
  return userId;
}

function failure(err: unknown, fallback: string): NextResponse {
  if (err instanceof PlaylistError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api/playlists/[id]]", err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const { id } = await params;
  try {
    return NextResponse.json({ playlist: await readPlaylist(userId, id) });
  } catch (err) {
    return failure(err, "Could not load the playlist.");
  }
}

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
  const patch = (body ?? {}) as { name?: unknown; add?: unknown; remove?: unknown };

  try {
    if (typeof patch.add === "string") {
      return NextResponse.json({ playlist: await addSongToPlaylist(userId, id, patch.add) });
    }
    if (typeof patch.remove === "string") {
      return NextResponse.json({ playlist: await removeSongFromPlaylist(userId, id, patch.remove) });
    }
    if (typeof patch.name === "string") {
      return NextResponse.json({ playlist: await renamePlaylist(userId, id, patch.name) });
    }
    return NextResponse.json(
      { error: "Provide a name, or a song to add or remove." },
      { status: 400 }
    );
  } catch (err) {
    return failure(err, "Could not update the playlist.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  const { id } = await params;
  try {
    await deletePlaylist(userId, id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return failure(err, "Could not delete the playlist.");
  }
}
