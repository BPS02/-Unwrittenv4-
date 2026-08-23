import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { clerkEnabled } from "@/lib/clerk-config";
import PlaylistsView from "@/components/PlaylistsView";

export default async function SongsPage() {
  if (!clerkEnabled) {
    return <section className="songs-empty"><span aria-hidden="true">♫</span><h1>Set up Clerk to enable accounts</h1><p>Your anonymous creative flow still works. Add Clerk keys and restart the app to unlock this private space.</p><Link href="/create" className="btn btn-primary">Start creating</Link></section>;
  }
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn({ returnBackUrl: "/songs" });
  return <PlaylistsView />;
}
