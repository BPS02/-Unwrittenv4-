import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import { listSongsWire } from "@/lib/songs-wire";

export const runtime = "nodejs";

/**
 * Lists the signed-in user's saved songs, each with a freshly minted
 * streaming path (also usable as a share link for about a week).
 */
export async function GET(): Promise<NextResponse> {
  if (!clerkEnabled) {
    return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ reason: "signin_required", error: "Sign in to see your songs." }, { status: 401 });
  }

  return NextResponse.json(await listSongsWire(userId));
}
