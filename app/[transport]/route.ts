import { auth } from "@clerk/nextjs/server";
import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { GENRES, MOODS, DEFAULT_CONTROLS } from "@/lib/types";
import { lyricsRequestSchema, musicRequestSchema } from "@/lib/validation";
import { generateLyrics, resolveStylePrompt } from "@/lib/generate";
import { getMusicProvider, MusicProviderError } from "@/lib/music/provider";
import {
  getEntitlement,
  recordMusicGeneration,
  releaseMusicGeneration,
  reserveMusicGeneration,
} from "@/lib/entitlement/service";
import { freeTakesRemaining, masterAccessAllowed, summarize } from "@/lib/entitlement/logic";
import { GENERATION_COST_USD, SONG_PASS_PRICE_USD, PRO_PRICE_USD } from "@/lib/entitlement/types";
import { makeAudioPreview } from "@/lib/audio-preview";
import { deleteAudio, mintAudioToken, mintBlobAudioToken, storeAudio } from "@/lib/audio-store";
import { listSongs, rollbackSongTake, saveSongTake } from "@/lib/songs-store";
import { startGeneration } from "@/lib/langfuse";
import { detectCrisisLanguage } from "@/lib/crisis";

export const runtime = "nodejs";
// A full render takes 60-90s; the tool call stays open for it.
export const maxDuration = 300;

/**
 * Unwritten MCP server.
 *
 * Exposes songwriting to any MCP client (Claude and friends) over OAuth:
 * Clerk is the authorization server, so the caller's Clerk userId arrives on
 * every tool call and the SAME entitlement rules as the website apply — one
 * one lifetime preview render, then Song Passes or render credits
 * or Pro. Masters are never exposed to unentitled callers here either; tools
 * hand back streaming URLs minted by lib/audio-store.
 *
 * Tool arguments arrive loosely typed from the SDK, so every tool re-parses
 * them with the app's own schemas before touching anything.
 */

interface ToolContext {
  authInfo?: { extra?: Record<string, unknown> };
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

/**
 * Minimal view of the MCP server's tool registration.
 *
 * The SDK types its `inputSchema` against its own bundled Zod build, which
 * doesn't unify with this app's Zod 3 instance — a purely type-level clash
 * (raw shapes are accepted at runtime). This shim keeps the call sites
 * honestly typed: arguments arrive as unknown values and every tool
 * re-parses them with the app's own schemas.
 */
interface ToolRegistrar {
  registerTool(
    name: string,
    config: { title?: string; description?: string; inputSchema?: Record<string, unknown> },
    cb: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
  ): unknown;
}

function callerId(ctx: ToolContext): string | null {
  const id = ctx?.authInfo?.extra?.userId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function appUrl(): string {
  return process.env.APP_URL || "https://v2-liner-notes.vercel.app";
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Paywall copy shared by every refusal, so clients can relay the offer. */
function paywallMessage(songTitle: string): string {
  return [
    `You've used your free song. "${songTitle}" is fully written and recorded — it just needs unlocking.`,
    ``,
    `• Song Pass: $${SONG_PASS_PRICE_USD} one-time (3 takes, full quality, permanent download)`,
    `• Unwritten Pro: $${PRO_PRICE_USD}/month for 20 render credits`,
    ``,
    `Both are available at ${appUrl()}/songs`,
  ].join("\n");
}

const handler = createMcpHandler((mcpServer) => {
  const server = mcpServer as unknown as ToolRegistrar;

  // ── write_lyrics — free and anonymous, the hook ──────────────────────
  server.registerTool(
    "write_lyrics",
    {
      title: "Write song lyrics",
      description:
        "Write original song lyrics from a thought, memory, or feeling. Free — no account needed. Returns lyrics with structural tags, ready to be turned into music.",
      inputSchema: {
        thought: z
          .string()
          .min(3)
          .max(2000)
          .describe("What the song is about, in the person's own words"),
        feelings: z
          .array(z.string())
          .max(8)
          .optional()
          .describe("Feelings, e.g. ['nostalgic','hopeful']"),
        details: z.string().max(600).optional().describe("Names, places, details to weave in"),
        genre: z.enum(GENRES).optional(),
        mood: z.enum(MOODS).optional(),
      },
    },
    async (args) => {
      const thought = str(args.thought) ?? "";
      const details = str(args.details) ?? "";
      const feelings = Array.isArray(args.feelings)
        ? args.feelings.filter((f): f is string => typeof f === "string")
        : [];

      if (detectCrisisLanguage(thought, "", details)) {
        return text(
          [
            "Before we write: this mentions something serious. If you or the person you're helping is in danger, please reach out — in the US, call or text 988 (Suicide & Crisis Lifeline), any time, free.",
            "",
            "I can still write the song if you'd like — just ask again.",
          ].join("\n")
        );
      }

      const parsed = lyricsRequestSchema.safeParse({
        input: { thought, feelings, feelingsText: "", context: details },
        controls: {
          ...DEFAULT_CONTROLS,
          ...(str(args.genre) ? { genre: args.genre } : {}),
          ...(str(args.mood) ? { mood: args.mood } : {}),
        },
        variation: 0,
      });
      if (!parsed.success) {
        return text("That couldn't be used: " + parsed.error.issues[0]?.message);
      }

      const result = await generateLyrics(parsed.data);
      return text(
        [
          `TITLE: ${result.title}`,
          `STYLE: ${result.style}`,
          ``,
          result.lyrics,
          ``,
          `— Written by Unwritten. To hear it as a real recorded song, use generate_song with these exact lyrics and pass the STYLE line as its style.`,
        ].join("\n")
      );
    }
  );

  // ── generate_song — authenticated, entitled, costs money ─────────────
  server.registerTool(
    "generate_song",
    {
      title: "Record the song",
      description:
        "Turn lyrics into an actual recorded song with vocals and instruments. Requires a signed-in Unwritten account. Free accounts get one 15-second preview render; paid renders include full playback and downloads. Takes 60-90 seconds.",
      inputSchema: {
        title: z.string().min(1).max(120),
        lyrics: z.string().min(20).max(4000).describe("Full lyrics, ideally from write_lyrics"),
        style: z
          .string()
          .max(1500)
          .optional()
          .describe("The STYLE production brief from write_lyrics; a plain brief is used if omitted"),
        genre: z.enum(GENRES).optional(),
        mood: z.enum(MOODS).optional(),
        songId: z
          .string()
          .min(6)
          .max(64)
          .optional()
          .describe("Reuse a previous songId to render another take of the same song"),
      },
    },
    async (args, ctx: ToolContext) => {
      const userId = callerId(ctx);
      const title = str(args.title) ?? "Untitled";
      if (!userId) {
        return text(
          `Recording a song needs a Unwritten account. Connect your account (the client will walk you through signing in), then ask again — the first song is free.`
        );
      }

      const parsed = musicRequestSchema.safeParse({
        title,
        lyrics: str(args.lyrics) ?? "",
        ...(str(args.style) ? { style: args.style } : {}),
        controls: {
          ...DEFAULT_CONTROLS,
          ...(str(args.genre) ? { genre: args.genre } : {}),
          ...(str(args.mood) ? { mood: args.mood } : {}),
        },
        songId: str(args.songId) ?? crypto.randomUUID(),
      });
      if (!parsed.success) {
        return text("That couldn't be used: " + parsed.error.issues[0]?.message);
      }
      const req = parsed.data;
      const id = req.songId as string;

      // ── Entitlement gate + hold BEFORE any provider call. Same functions
      // the website uses, so there is no second paywall to keep in sync.
      const { assessment, reservationId } = await reserveMusicGeneration(userId, id);
      if (!assessment.allowed || !reservationId) return text(paywallMessage(title));

      const provider = (() => {
        try {
          return getMusicProvider();
        } catch {
          return null;
        }
      })();
      if (!provider || !provider.isConfigured()) {
        await releaseMusicGeneration(reservationId);
        return text("Music generation is unavailable right now. Your lyrics are safe — try again shortly.");
      }

      const { stylePrompt } = resolveStylePrompt(req);
      let render;
      try {
        render = await provider.generate(req, stylePrompt);
      } catch (err) {
        // Failed render costs nothing — release the hold.
        await releaseMusicGeneration(reservationId);
        const message = err instanceof MusicProviderError ? err.message : "The recording didn't finish.";
        return text(`${message} Nothing was used up — ask me to try again.`);
      }
      if (render.mode !== "audio") {
        await releaseMusicGeneration(reservationId);
        return text("This server is in demo mode, so no real recording was made.");
      }

      const unlocked = assessment.quality === "full";

      const storedAudioIds: string[] = [];
      let savedTakeNumber: number | null = null;
      let committed = false;
      try {
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

      let takeNumber = 1;
      {
        const now = new Date().toISOString();
        const saved = await saveSongTake(
          userId,
          {
            id,
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
            quality: assessment.quality,
            sizeBytes: render.audio.bytes.length,
            masterAudioId: masterRef.audioId ?? undefined,
            previewAudioId: previewRef.audioId ?? undefined,
          },
          masterRef.audioId ? undefined : { masterBytes: render.audio.bytes, previewBytes }
        );
        takeNumber = saved.takes.at(-1)?.n ?? 1;
        savedTakeNumber = takeNumber;
      }

      const updated = await recordMusicGeneration(userId, id, reservationId);
      committed = true;
      const summary = summarize(updated);

      const trace = startGeneration({
        name: "liner-notes-music-render",
        model: render.provider,
        input: { songId: id, surface: "mcp" },
        metadata: {
          costUsd: GENERATION_COST_USD,
          provider: render.provider,
          quality: assessment.quality,
          tier: summary.tier,
          surface: "mcp",
          songId: id,
        },
      });
      trace.end(`rendered ${render.audio.bytes.length} bytes (${assessment.quality})`);
      await trace.flush().catch((err) => console.error("[mcp] render trace failed:", err));

      // Unentitled callers receive ONLY the preview token.
      const servedToken = unlocked ? masterRef.token : previewRef.token;
      const listenUrl = `${appUrl()}/api/audio/${servedToken}`;
      const takesLeft = freeTakesRemaining(updated);

      return text(
        [
          `♪ "${req.title}" — take ${takeNumber} is ready.`,
          ``,
          unlocked ? `Full song: ${listenUrl}` : `15-second preview: ${listenUrl}`,
          ``,
          unlocked
            ? `Saved to the vault at ${appUrl()}/songs`
            : [
                `The full-length version is already recorded and waiting.`,
                takesLeft > 0
                  ? `You can hear ${takesLeft} more free take${takesLeft === 1 ? "" : "s"} of this song — call generate_song again with songId "${id}".`
                  : `That was the last free take.`,
                `Get a Song Pass for $${SONG_PASS_PRICE_USD} at ${appUrl()}/songs`,
              ].join("\n"),
          ``,
          `songId: ${id}`,
        ].join("\n")
      );
      } catch (err) {
        if (!committed && savedTakeNumber !== null) {
          await rollbackSongTake(userId, id, savedTakeNumber).catch(() => {});
        }
        if (!committed) {
          await deleteAudio(storedAudioIds).catch(() => {});
          await releaseMusicGeneration(reservationId).catch(() => {});
        }
        console.error("[mcp] finalizing song failed:", err);
        return text("The recording couldn't be saved, so nothing was used up — ask me to try again.");
      }
    }
  );

  // ── list_my_songs ────────────────────────────────────────────────────
  server.registerTool(
    "list_my_songs",
    {
      title: "List my songs",
      description:
        "List the songs saved in the caller's Unwritten vault, with listening links and whether each is unlocked.",
      inputSchema: {},
    },
    async (_args, ctx: ToolContext) => {
      const userId = callerId(ctx);
      if (!userId) return text("Connect your Unwritten account to see your songs.");

      const [songs, entitlement] = await Promise.all([listSongs(userId), getEntitlement(userId)]);
      if (songs.length === 0) {
        return text("No songs yet. Use write_lyrics, then generate_song, to make the first one.");
      }

      const lines = songs.map((song) => {
        const serveMaster = song.unlocked === true || masterAccessAllowed(entitlement, song.id);
        const latest = song.takes?.[song.takes.length - 1];
        // Postgres audio first; legacy Blob takes still resolve by pathname.
        const audioId = serveMaster ? latest?.masterAudioId : latest?.previewAudioId;
        const pathname = serveMaster ? latest?.masterPathname : latest?.previewPathname;
        const token = audioId
          ? mintAudioToken({ audioId, ownerId: userId, downloadable: serveMaster })
          : pathname
            ? mintBlobAudioToken({ pathname, ownerId: userId, downloadable: serveMaster })
            : null;
        const url = token ? `${appUrl()}/api/audio/${token}` : `${appUrl()}/songs`;
        return `• "${song.title}" — ${serveMaster ? "unlocked, full song" : "preview only"}, ${song.takes?.length ?? 1} take(s)\n  ${url}`;
      });

      const summary = summarize(entitlement);
      return text(
        [
          `${songs.length} song${songs.length === 1 ? "" : "s"} in the vault:`,
          ``,
          ...lines,
          ``,
          summary.tier === "pro"
            ? `Unwritten Pro — ${summary.songsRemaining} songs left this period.`
            : `Free account — ${summary.freeTakesRemaining} free take${summary.freeTakesRemaining === 1 ? "" : "s"} remaining.`,
        ].join("\n")
      );
    }
  );

  // ── my_account ───────────────────────────────────────────────────────
  server.registerTool(
    "my_account",
    {
      title: "My Unwritten plan",
      description:
        "Show the caller's Unwritten plan: tier, remaining songs or free takes, and what unlocking costs.",
      inputSchema: {},
    },
    async (_args, ctx: ToolContext) => {
      const userId = callerId(ctx);
      if (!userId) return text("Connect your Unwritten account to see your plan.");
      const summary = summarize(await getEntitlement(userId));
      if (summary.tier === "pro") {
        return text(
          `Unwritten Pro — ${summary.songsRemaining} of 20 render credits left this period${
            summary.periodEnd ? ` (resets ${new Date(summary.periodEnd).toLocaleDateString()})` : ""
          }. Full quality and downloads included.`
        );
      }
      return text(
        [
          `Free account.`,
          summary.freeSongAvailable
            ? `Your lifetime free 15-second preview render is still available.`
            : `Free takes remaining: ${summary.freeTakesRemaining}.`,
          ``,
          `Song Pass: $${SONG_PASS_PRICE_USD} · Unwritten Pro: $${PRO_PRICE_USD}/month for 20 renders`,
          `${appUrl()}/songs`,
        ].join("\n")
      );
    }
  );
});

const authHandler = withMcpAuth(
  handler,
  async (_req, token) => {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    return verifyClerkToken(clerkAuth, token);
  },
  {
    // write_lyrics is genuinely free, so a token is optional: anonymous
    // callers still get lyrics, and the paid tools ask them to connect.
    required: false,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
