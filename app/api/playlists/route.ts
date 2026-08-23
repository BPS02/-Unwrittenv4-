import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { PlaylistError, createPlaylist, listPlaylists } from "@/lib/playlists-store";

export const runtime = "nodejs";

/**
 * The caller's playlists. Identity comes from Clerk `auth()` only — a
 * playlist is never addressed by anything a client supplies except its id,
 * and the store scopes every query by this userId.
 */
async function requireUser(): Promise<string | NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { reason: "signin_required", error: "Sign in to see your playlists." },
      { status: 401 }
    );
  }
  return userId;
}

export async function GET(): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;
  return NextResponse.json({ playlists: await listPlaylists(userId) });
}

/** POST { name } — creates an empty playlist. */
export async function POST(request: Request): Promise<NextResponse> {
  const userId = await requireUser();
  if (typeof userId !== "string") return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }
  const name = body && typeof body === "object" && "name" in body ? (body as { name: unknown }).name : "";

  try {
    return NextResponse.json({ playlist: await createPlaylist(userId, name as string) });
  } catch (err) {
    if (err instanceof PlaylistError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/playlists]", err);
    return NextResponse.json({ error: "Could not create the playlist." }, { status: 500 });
  }
}
