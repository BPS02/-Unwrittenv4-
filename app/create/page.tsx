import { Suspense } from "react";
import type { Metadata } from "next";
import CreateFlow from "@/components/CreateFlow";
import { getMusicProvider } from "@/lib/music/provider";

export const metadata: Metadata = {
  title: "Write a song",
};

/**
 * Which kind of render this server can actually produce. MUSIC_PROVIDER is
 * server-only, so the client cannot work this out for itself — without it the
 * music step would have to guess, and would end up promising a full song on a
 * deployment that can only synthesize a demo sketch.
 */
function musicMode(): "demo" | "live" {
  try {
    const provider = getMusicProvider();
    return provider.name !== "demo" && provider.isConfigured() ? "live" : "demo";
  } catch {
    return "demo";
  }
}

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateFlow musicMode={musicMode()} />
    </Suspense>
  );
}
