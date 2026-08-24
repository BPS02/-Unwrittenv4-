import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { musicRequestSchema, firstIssueMessage } from "@/lib/validation";
import { resolveStylePrompt } from "@/lib/generate";
import { startGeneration } from "@/lib/langfuse";
import { getMusicProvider, MusicProviderError } from "@/lib/music/provider";
import {
  checkGenerationRateLimit,
  rateLimitResponse,
  checkDailyRenderCeiling,
  dailyCeilingResponse,
} from "@/lib/rate-limit";
import { clerkEnabled } from "@/lib/clerk-config";
import {
  recordMusicGeneration,
  releaseMusicGeneration,
  reserveMusicGeneration,
} from "@/lib/entitlement/service";
import { summarize } from "@/lib/entitlement/logic";
import { GENERATION_COST_USD } from "@/lib/entitlement/types";
import { makeAudioPreview } from "@/lib/audio-preview";
import { deleteAudio, storeAudio } from "@/lib/audio-store";
import { rollbackSongTake, saveSongTake } from "@/lib/songs-store";

export const runtime = "nodejs";
// Lyria composes for 1-3 minutes; allow the function to run long enough on
// Vercel (clamped to the plan's maximum).
export const maxDuration = 300;

/**
 * Music generation.
 *
 * ALL generation — demo sketches included — is authenticated and entitled
 * whenever Clerk is configured: writing lyrics is free and anonymous, but
 * generating music requires sign-in and each account gets exactly one free
 * generation. The userId comes from Clerk `auth()` only, entitlement is
 * decided exclusively by lib/entitlement, the check happens BEFORE the
 * provider is called, and the take is recorded only AFTER the provider
 * confirms a successful render — a failed render never consumes a credit.
 *
 * Bare-checkout fallback: with no Clerk keys at all (a dev clone), demo mode
 * stays public and rate limited so the app still runs; real providers instead
 * fail with AUTH_NOT_CONFIGURED.
 *
 * Refusals are structured (`reason: "signin_required" | "payment_required"`)
 * so the UI knows which wall it hit. This route is protected independently of
 * any page-level protection.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const limit = checkGenerationRateLimit(request);
  if (!limit.ok) return rateLimitResponse(limit.retryAfter) as NextResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = musicRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const req = parsed.data;

  const provider = (() => {
    try {
      return getMusicProvider();
    } catch (err) {
      return err instanceof MusicProviderError ? err : new MusicProviderError("Music is unavailable.");
    }
  })();
  if (provider instanceof MusicProviderError) {
    return NextResponse.json({ error: provider.message }, { status: 502 });
  }
  if (!provider.isConfigured()) {
    return NextResponse.json(
      {
        error: `The "${provider.name}" music provider is selected but its credentials are missing. Check your .env — see README "Connecting a real music API".`,
      },
      { status: 500 }
    );
  }

  const isRealRender = provider.name !== "demo";

  // ── Gate generation: sign-in, then entitlement — before any provider call.
  // Demo renders are gated too when Clerk is configured (only a bare checkout
  // without keys keeps demo public).
  let userId: string | null = null;
  let songId: string | null = null;
  /** Hold placed before the provider call; committed on success, released on failure. */
  let reservationId: string | null = null;
  const storedAudioIds: string[] = [];
  let savedTakeNumber: number | null = null;
  let quality: "full" | "preview" = "preview";

  if (isRealRender || clerkEnabled) {
    if (!clerkEnabled) {
      return NextResponse.json(
        {
          error:
            "Accounts aren’t configured on this server yet, so full music generation is unavailable. Demo mode still works.",
          code: "AUTH_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
    const session = await auth();
    userId = session.userId;
    if (!userId) {
      return NextResponse.json(
        {
          reason: "signin_required",
          error: "Your lyrics are ready. Sign in to hear them as a song — your first one is on us.",
        },
        { status: 401 }
      );
    }
    if (!req.songId) {
      return NextResponse.json(
        { error: "songId is required for full music generation." },
        { status: 400 }
      );
    }
    songId = req.songId;

    // Atomically gate AND hold what this render will consume, so two
    // simultaneous renders can't both pass on the last remaining take.
    const { assessment, meta, reservationId: held } = await reserveMusicGeneration(userId, songId);
    if (!assessment.allowed) {
      return NextResponse.json(
        {
          reason: assessment.reason,
          error:
            assessment.reason === "payment_required"
              ? "You’ve used your free render. Get a $9.99 Song Pass, a credit pack, or go Pro."
              : "Please sign in to continue.",
          entitlement: summarize(meta),
        },
        { status: assessment.reason === "payment_required" ? 402 : 401 }
      );
    }
    reservationId = held;
    quality = assessment.quality;

    // Application-wide daily ceiling on billed renders (abuse guard) — demo
    // sketches are synthesized locally and cost nothing to serve.
    if (isRealRender && !checkDailyRenderCeiling().ok) {
      // Turned away after the hold was placed — give it straight back.
      if (reservationId) await releaseMusicGeneration(reservationId);
      return dailyCeilingResponse() as NextResponse;
    }
  }

  // ── Resolve the style prompt. The generator already wrote the STYLE brief
  // alongside the lyrics and it travels with the request; there is no music
  // LLM call. Absent (an old draft), the deterministic brief steps in.
  const { stylePrompt, promptMode } = resolveStylePrompt(req);

  // ── Render, then (only on success) record the take.
  try {
    const render = await provider.generate(req, stylePrompt);

    if (render.mode === "demo") {
      // Gated demo render (Clerk configured): the sketch counts as the
      // user's generation, so record it like any other successful render.
      if (userId && songId && reservationId) {
        const updated = await recordMusicGeneration(userId, songId, reservationId);
        return NextResponse.json({
          mode: "demo",
          stylePrompt: render.stylePrompt,
          coverArt: req.coverArt,
          promptMode,
          quality,
          entitlement: summarize(updated),
        });
      }
      return NextResponse.json({ mode: "demo", stylePrompt: render.stylePrompt, promptMode });
    }

    if (!userId || !songId || !reservationId) {
      // Unreachable for real providers (gated above); defensive.
      return NextResponse.json({ error: "Sign in to generate full music." }, { status: 401 });
    }

    const unlocked = quality === "full";

    // The full master is ALWAYS stored; the preview is what free renders
    // serve. The master token is minted only for entitled renders.
    const masterRef = await storeAudio({
      bytes: render.audio.bytes,
      mimeType: render.audio.mimeType,
      ownerId: userId,
      downloadable: true,
    });
    if (masterRef.audioId) storedAudioIds.push(masterRef.audioId);
    const previewBytes =
      makeAudioPreview(render.audio.bytes, render.audio.mimeType) ?? render.audio.bytes;
    const previewRef = await storeAudio({
      bytes: previewBytes,
      mimeType: render.audio.mimeType,
      ownerId: userId,
      downloadable: false,
    });
    if (previewRef.audioId) storedAudioIds.push(previewRef.audioId);

    // Persist the take before consuming the reservation. A storage or vault
    // failure costs the user nothing and is cleaned up by the catch below.
    let takeNumber = 1;
    {
      const now = new Date().toISOString();
      const saved = await saveSongTake(
        userId,
        {
          id: songId,
          title: req.title,
          lyrics: req.lyrics,
          stylePrompt: render.stylePrompt,
          provider: render.provider,
          mimeType: render.audio.mimeType,
          createdAt: now,
          unlocked,
          favorite: false,
        },
        {
          createdAt: now,
          provider: render.provider,
          mimeType: render.audio.mimeType,
          quality,
          sizeBytes: render.audio.bytes.length,
          masterAudioId: masterRef.audioId ?? undefined,
          previewAudioId: previewRef.audioId ?? undefined,
        },
        // Only the memory backend needs the bytes handed along.
        masterRef.audioId ? undefined : { masterBytes: render.audio.bytes, previewBytes }
      );
      takeNumber = saved.takes.at(-1)?.n ?? 1;
      savedTakeNumber = takeNumber;
    }

    const updated = await recordMusicGeneration(userId, songId, reservationId);
    reservationId = null;
    const summary = summarize(updated);

    const renderTrace = startGeneration({
      name: "liner-notes-music-render",
      model: render.provider,
      input: { songId, stylePrompt: render.stylePrompt.slice(0, 500) },
      metadata: { costUsd: GENERATION_COST_USD, provider: render.provider, quality, tier: summary.tier, songId },
    });
    renderTrace.end(`rendered ${render.audio.bytes.length} bytes (${quality})`);
    await renderTrace.flush().catch((err) => console.error("[api/music] render trace failed:", err));

    // Nothing after this point may throw: the reservation has been consumed.
    savedTakeNumber = null;
    storedAudioIds.length = 0;

    // Unentitled responses carry ONLY the preview token — the master token
    // never crosses to the client for locked songs.
    const servedToken = unlocked ? masterRef.token : previewRef.token;
    return NextResponse.json({
      mode: "audio",
      stylePrompt: render.stylePrompt,
      provider: render.provider,
      promptMode,
      audio: { streamPath: `/api/audio/${servedToken}`, mimeType: render.audio.mimeType },
      quality,
      unlocked,
      downloadable: unlocked,
      takeNumber,
      entitlement: summary,
    });
  } catch (err) {
    // Finalization is all-or-nothing from the user's perspective.
    if (userId && songId && savedTakeNumber !== null) {
      await rollbackSongTake(userId, songId, savedTakeNumber).catch(() => {});
    }
    await deleteAudio(storedAudioIds).catch(() => {});
    if (reservationId) await releaseMusicGeneration(reservationId).catch(() => {});
    const message =
      err instanceof MusicProviderError ? err.message : "Music generation failed unexpectedly.";
    console.error("[api/music]", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
