import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { readAudioBytes, readAudioMeta, resolveAudio } from "@/lib/audio-store";
import { clerkEnabled } from "@/lib/clerk-config";

export const runtime = "nodejs";

const GONE =
  "This song has expired from the listening cache. Generate it again to keep listening.";

/**
 * Streams a rendered take.
 *
 * - Plain GET: inline streaming playback. The unguessable token is the
 *   capability, so the same URL works as a share link while it lives.
 * - GET ?download=1: file download — refused for renders made without
 *   download entitlement (free tier is streaming-only), and only ever served
 *   to the signed-in owner of the render.
 * - Range requests are served from Postgres with a `substring`, so seeking
 *   costs the bytes asked for rather than a whole master.
 *
 * Audio lives in Postgres (audio_blobs). Legacy takes still in the private
 * Blob store are fetched server-side and streamed through this same route —
 * either way no publicly reachable URL exists and the paywall has one gate.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  const entry = resolveAudio(token);
  if (!entry) {
    return NextResponse.json({ error: GONE }, { status: 404 });
  }

  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  if (wantsDownload) {
    if (!entry.downloadable) {
      return NextResponse.json(
        {
          reason: "payment_required",
          error: "Downloads aren't included with the free song — it stays streamable right here.",
        },
        { status: 403 }
      );
    }
    if (!clerkEnabled) {
      return NextResponse.json({ error: "Accounts are not configured." }, { status: 503 });
    }
    const { userId } = await auth();
    if (!userId || userId !== entry.ownerId) {
      return NextResponse.json(
        { reason: "signin_required", error: "Sign in to download your song." },
        { status: 401 }
      );
    }
  }

  const disposition = wantsDownload ? `attachment; filename="unwritten-song"` : "inline";

  // ── Postgres-backed audio (everything rendered since the move) ──
  if (entry.kind === "pg") {
    const meta = await readAudioMeta(entry.audioId);
    if (!meta) return NextResponse.json({ error: GONE }, { status: 404 });

    const rangeHeader = request.headers.get("range");
    const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
    if (match && !wantsDownload) {
      const startRaw = match[1] ?? "";
      const endRaw = match[2] ?? "";
      // "bytes=-500" means the LAST 500 bytes, not byte 0 to 500.
      const suffix = startRaw === "";
      const start = suffix
        ? Math.max(0, meta.sizeBytes - Number(endRaw || 0))
        : Number(startRaw);
      const end = suffix
        ? meta.sizeBytes - 1
        : endRaw
          ? Math.min(Number(endRaw), meta.sizeBytes - 1)
          : meta.sizeBytes - 1;
      if (!Number.isFinite(start) || start < 0 || start > end || start >= meta.sizeBytes) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${meta.sizeBytes}` },
        });
      }
      const length = end - start + 1;
      const slice = await readAudioBytes(entry.audioId, { start, length });
      if (!slice) return NextResponse.json({ error: GONE }, { status: 404 });
      return new Response(new Uint8Array(slice), {
        status: 206,
        headers: {
          "Content-Type": meta.mimeType,
          "Content-Length": String(slice.byteLength),
          "Content-Range": `bytes ${start}-${end}/${meta.sizeBytes}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": disposition,
        },
      });
    }

    const bytes = await readAudioBytes(entry.audioId);
    if (!bytes) return NextResponse.json({ error: GONE }, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": meta.mimeType,
        "Content-Length": String(bytes.byteLength),
        // Advertised so the player knows it may seek by re-requesting a range.
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": disposition,
      },
    });
  }

  // ── Legacy Blob-backed audio ──
  if (entry.kind === "blob") {
    const result = await get(entry.pathname, { access: "private" }).catch(() => null);
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: GONE }, { status: 404 });
    }
    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "audio/mpeg",
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": disposition,
      },
    });
  }

  // ── In-memory (local dev, no database) ──
  const body = new Uint8Array(entry.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": entry.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
      "Content-Disposition": disposition,
      "Accept-Ranges": "none",
    },
  });
}
