import type { Metadata } from "next";
import Link from "next/link";
import AudioPlayer from "@/components/AudioPlayer";
import { artFor } from "@/lib/cover-art";

export const metadata: Metadata = {
  title: "A song shared with you",
  description: "Someone used Unwritten to turn what they were feeling into a song for you.",
};

interface SharePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default async function SharePage({ searchParams }: SharePageProps) {
  const params = await searchParams;
  const audio = single(params.audio);
  const title = single(params.title).trim().slice(0, 200) || "A song for you";
  const songId = single(params.song).slice(0, 100) || title;
  const playable = audio.startsWith("/api/audio/") && !audio.includes("..") ? audio : null;

  return (
    <section className="shared-song-page">
      <div className="shared-song-glow" aria-hidden="true" />
      <article className="shared-song-card">
        <p className="eyebrow">Shared through Unwritten</p>
        <div
          className="shared-song-art"
          style={{ background: artFor(songId) }}
          aria-hidden="true"
        >
          ♪
        </div>
        <p className="shared-song-intro">Someone turned what they were feeling into this song.</p>
        <h1>{title}</h1>
        {playable ? (
          <AudioPlayer src={playable} />
        ) : (
          <div className="banner" role="status">
            <p>This listening link is no longer available. Ask the sender to share it again.</p>
          </div>
        )}
        <p className="shared-song-note">Listen first. There&apos;s nothing you need to say right away.</p>
        <Link href="/" className="btn btn-secondary">Express yourself with Unwritten</Link>
      </article>
    </section>
  );
}
