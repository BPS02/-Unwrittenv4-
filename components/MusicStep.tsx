"use client";

import { useEffect, useState } from "react";
import { PREVIEW_SECONDS } from "@/lib/audio-preview";
import { lyricsForReading } from "@/lib/lyrics-display";
import type { EntitlementSummaryWire, SongControls } from "@/lib/types";
import AudioPlayer from "./AudioPlayer";

/**
 * Progress stages shown while a render is in flight.
 *
 * IMPORTANT: these are a presentation device, not telemetry. /api/music is a
 * single synchronous request, so the browser cannot observe which phase the
 * provider is actually in — the stage advances on elapsed time. The copy is
 * therefore written to describe the job, never to claim a server milestone
 * ("Building the arrangement", not "Arrangement complete"). When renders move
 * to the async job table described in CLAUDE.md, these should be driven by
 * real status from the job record instead.
 */
const STAGES = [
  { id: "queued", label: "Queued", note: "Your song is in line." },
  { id: "composing", label: "Composing", note: "Building the arrangement from your lyrics." },
  { id: "rendering", label: "Rendering", note: "Finishing the audio." },
] as const;

/** Roughly when each stage begins, in ms. Live renders take 60–90s. */
const STAGE_AT = { demo: [0, 700, 2200], live: [0, 4000, 45000] } as const;

export interface MusicState {
  stylePrompt: string;
  promptMode: "demo" | "live";
  /** Object URL (demo sketch) or streaming path (provider audio). */
  audioUrl: string | null;
  /** True when audio was synthesized locally by the demo renderer. */
  isDemoAudio: boolean;
  provider?: string;
  fileExtension: string;
  /** Server-decided: free renders serve a short preview only. */
  quality: "full" | "preview";
  unlocked: boolean;
  downloadable: boolean;
  takeNumber?: number;
}

/** A previously rendered take the listener can switch back to. */
export interface TakeOption {
  n: number;
  audioUrl: string;
  isDemoAudio: boolean;
}

export type MusicStatus =
  | "idle"
  | "loading"
  | "error"
  | "ready"
  | "signin"
  | "paywall";

export type CheckoutProduct = "song_pass" | "pro_monthly" | "credit_pack";

interface MusicStepProps {
  status: MusicStatus;
  error: string | null;
  music: MusicState | null;
  /** Previously rendered takes of this song, oldest first. */
  takes: TakeOption[];
  onSelectTake: (n: number) => void;
  songTitle: string;
  lyrics: string;
  stylePrompt?: string;
  controls: SongControls;
  /** What this server can actually render — decided server-side. */
  musicMode: "demo" | "live";
  entitlement: EntitlementSummaryWire | null;
  onGenerate: () => void;
  onCoverReady: (imageUrl: string) => void;
  onBack: () => void;
  onEditDirection: () => void;
  onViewSongs: () => void;
  onDownloadAudio: () => void;
  onCopyPrompt: () => void;
  onCopyLyrics: () => void;
  onCopyListenLink: () => void;
  onNewSong: () => void;
  onSignIn: () => void;
  onDismissPaywall: () => void;
  onCheckout: (product: CheckoutProduct) => Promise<void>;
}

export default function MusicStep(props: MusicStepProps) {
  const [stage, setStage] = useState(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<CheckoutProduct | null>(null);
  // The unlock CTA appears immediately AFTER the first playback finishes.
  const [previewPlayed, setPreviewPlayed] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverState, setCoverState] = useState<"loading" | "ready" | "error">("loading");

  const isDemo = props.musicMode === "demo";

  useEffect(() => {
    if (props.status !== "loading") return;
    setStage(0);
    const marks = STAGE_AT[props.musicMode];
    const timers = marks.map((at, i) => setTimeout(() => setStage(i), at));
    return () => timers.forEach(clearTimeout);
  }, [props.status, props.musicMode]);

  useEffect(() => {
    if (props.status !== "ready") {
      setConfirmingReset(false);
      setPreviewPlayed(false);
    }
    if (props.status !== "paywall") setCheckoutBusy(null);
  }, [props.status]);

  useEffect(() => {
    if (props.status !== "idle") return;
    const controller = new AbortController();
    setCoverState("loading");
    let device = "browser";
    try {
      const key = "liner-notes:device:v1";
      device = sessionStorage.getItem(key) ?? crypto.randomUUID();
      sessionStorage.setItem(key, device);
    } catch { /* a cover can still be requested without persistent storage */ }

    void fetch("/api/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-LinerNotes-Device": device },
      body: JSON.stringify({
        title: props.songTitle,
        lyrics: props.lyrics,
        genre: props.controls.genre,
        mood: props.controls.mood,
        style: props.stylePrompt,
      }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("cover unavailable");
      return response.json() as Promise<{ imageUrl: string }>;
    }).then((result) => {
      setCoverUrl(result.imageUrl);
      setCoverState("ready");
      props.onCoverReady(result.imageUrl);
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCoverState("error");
    });
    return () => controller.abort();
  }, [props.status, props.songTitle, props.lyrics, props.controls.genre, props.controls.mood, props.stylePrompt, props.onCoverReady]);

  const startCheckout = (product: CheckoutProduct) => {
    setCheckoutBusy(product);
    void props.onCheckout(product).finally(() => setCheckoutBusy(null));
  };

  const direction: Array<[string, string]> = [
    ["Genre", props.controls.genre],
    ["Mood", props.controls.mood],
    ["Perspective", props.controls.perspective],
    ["Lead voice", props.controls.vocalist],
    ["Structure", props.controls.structure],
    ["Language", props.controls.keepClean ? "Clean" : "Explicit allowed"],
  ];

  const preGenerate = props.status === "loading";

  if (props.status === "idle") {
    return (
      <div className="music-review-screen">
        <div className="music-review-shade" />
        <header className="music-review-topbar">
          <button type="button" className="music-review-back" onClick={props.onBack} aria-label="Back to lyrics">←</button>
          <span>Unwritten</span>
        </header>
        <main className="music-review-content">
          <p className="music-review-kicker">One last listen</p>
          <h1>How should<br />this song feel?</h1>
          <p className="music-review-intro">Take one last look at the sound before<br />we bring your words to life.</p>

          <section className="sound-paper" aria-labelledby="your-sound-heading">
            <div className="sound-paper-head">
              <h2 id="your-sound-heading">Your sound</h2>
              <button type="button" onClick={props.onEditDirection}>Change</button>
            </div>
            <div className="sound-trio">
              <div><span aria-hidden="true">♬</span><strong>{props.controls.genre}</strong></div>
              <div><span aria-hidden="true">☀</span><strong>{props.controls.mood}</strong></div>
              <div><span aria-hidden="true">♙</span><strong>{props.controls.vocalist}</strong></div>
            </div>
            <p className="sound-structure">{props.controls.structure.replaceAll("-", "  •  ")}</p>
            <p className="sound-note">Warm, honest, and close to the voice.</p>
          </section>

          <section className="song-preview-card">
            <div className={`ai-cover ${coverState}`} aria-label={coverState === "ready" ? "AI-generated album cover" : "Album cover is being created"}>
              {coverUrl && <img src={coverUrl} alt={`AI-generated cover for ${props.songTitle}`} />}
              {!coverUrl && <span>{coverState === "loading" ? "Painting\nyour cover…" : "Unwritten"}</span>}
            </div>
            <div className="song-preview-copy">
              <p>Your song</p>
              <h2>{props.songTitle}</h2>
              <span>{props.controls.genre} · {props.controls.mood}</span>
              <small>🎧 &nbsp; Headphones recommended</small>
            </div>
          </section>

          <button type="button" className="music-review-create" onClick={props.onGenerate}>
            {isDemo ? "Create my song demo" : "Create my full song"} <span aria-hidden="true">→</span>
          </button>
          <p className="music-review-timing">Usually ready in 60–90 seconds. <strong>Keep this screen open.</strong></p>
          <button type="button" className="music-review-lyrics" onClick={props.onBack}>Back to lyrics</button>
        </main>
      </div>
    );
  }

  return (
    <div className="step-panel">
      <div className="step-heading">
        <h1>Set it to music</h1>
        <p>Review the direction for your song, then {isDemo ? "generate a demo" : "create the audio"}.</p>
      </div>

      {/* ── Music direction: the brief, as one deliberate card ─────────── */}
      <section className="direction-card" aria-labelledby="direction-heading">
        <div className="direction-head">
          <h2 id="direction-heading">Music direction</h2>
          <button type="button" className="direction-edit" onClick={props.onEditDirection}>
            Edit direction
          </button>
        </div>
        <dl className="direction-list">
          {direction.map(([term, value]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {props.status === "loading" && (
        <section className="generate-card is-working" role="status" aria-live="polite">
          <ol className="stage-track" aria-label="Progress">
            {STAGES.map((s, i) => (
              <li key={s.id} className={i < stage ? "is-done" : i === stage ? "is-current" : undefined}>
                <span className="stage-dot" aria-hidden="true" />
                <span className="stage-label">{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="breath" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <p className="stage-note">{STAGES[stage]?.note}</p>
          <p className="generate-timing">
            {isDemo ? "Almost there." : "This usually takes about 60–90 seconds."}
          </p>
        </section>
      )}

      {props.status === "error" && (
        <div className="banner banner-error" role="alert">
          <h3>The music didn’t finish</h3>
          <p>{props.error ?? "Music generation failed unexpectedly."}</p>
          <p className="field-hint">Nothing was used up — your free song is still yours.</p>
          <div className="banner-actions action-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={props.onGenerate}>
              Try again
            </button>
          </div>
        </div>
      )}

      {props.status === "signin" && (
        <div className="wall-card card" role="region" aria-labelledby="signin-wall-heading">
          <span className="glyph" aria-hidden="true">✨</span>
          <h2 id="signin-wall-heading">Your lyrics are ready.</h2>
          <p>
            Sign in to hear them as a song — <strong>your first one is on us</strong>.
            Everything you’ve written stays right here while you do.
          </p>
          <div className="action-row wall-actions">
            <button type="button" className="btn btn-primary btn-lg" onClick={props.onSignIn}>
              Sign in to hear your song
            </button>
            <button type="button" className="btn btn-ghost" onClick={props.onBack}>
              Back to lyrics
            </button>
          </div>
        </div>
      )}

      {props.status === "paywall" && (
        <div className="wall-card card" role="region" aria-labelledby="paywall-heading">
          <h2 id="paywall-heading">
            {props.entitlement?.tier === "pro"
              ? "You’ve used all 20 render credits this month."
              : "You’ve used your free song."}
          </h2>
          <p>
            Your lyrics are never paywalled, and everything you’ve made stays
            playable.
          </p>
          <div className="paywall-grid">
            <div className="plan-card">
              <h3>Song Pass for “{props.songTitle}”</h3>
              <p className="plan-price">
                $9.99<span> one-time</span>
              </p>
              <ul>
                <li>Up to 3 takes total</li>
                <li>Download included</li>
                <li>Yours forever</li>
              </ul>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={checkoutBusy !== null}
                onClick={() => startCheckout("song_pass")}
              >
                {checkoutBusy === "song_pass" ? "Opening checkout…" : "Get Song Pass"}
              </button>
            </div>
            <div className="plan-card plan-card-featured">
              <h3>Unwritten Pro</h3>
              <p className="plan-price">
                $19<span>/month</span>
              </p>
              <ul>
                <li>20 render credits every month</li>
                <li>Full quality, no watermark</li>
                <li>Downloads included</li>
              </ul>
              <button
                type="button"
                className="btn btn-primary"
                disabled={checkoutBusy !== null}
                onClick={() => startCheckout("pro_monthly")}
              >
                {checkoutBusy === "pro_monthly" ? "Opening checkout…" : "Go Pro"}
              </button>
            </div>
            <div className="plan-card">
              <h3>Extra credits</h3>
              <p className="plan-price">$7.99<span> one-time</span></p>
              <ul>
                <li>10 additional renders</li>
                <li>Never expire</li>
                <li>Full playback and downloads</li>
              </ul>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={checkoutBusy !== null}
                onClick={() => startCheckout("credit_pack")}
              >
                {checkoutBusy === "credit_pack" ? "Opening checkout…" : "Buy 10 credits"}
              </button>
            </div>
          </div>
          <div className="wall-actions action-row">
            <button type="button" className="btn btn-ghost" onClick={props.onDismissPaywall}>
              Not now — back to my song
            </button>
          </div>
        </div>
      )}

      {props.status === "ready" && props.music && (
        <>
          <div className="player">
            <div className="player-meta">
              <h3>“{props.songTitle}”</h3>
              <span
                className={`badge ${props.music.isDemoAudio ? "badge-demo" : "badge-live"}`}
                title={
                  props.music.isDemoAudio
                    ? "A short instrumental sketch synthesized in your browser. Connect a music provider for full songs — see the README."
                    : `Generated by ${props.music.provider ?? "your music provider"}.`
                }
              >
                {props.music.isDemoAudio
                  ? "Demo sketch"
                  : props.music.quality === "preview"
                    ? `${PREVIEW_SECONDS}-second preview`
                    : `${props.music.provider ?? "provider"} audio`}
              </span>
            </div>
            {props.music.audioUrl ? (
              <AudioPlayer
                src={props.music.audioUrl}
                onEnded={() => setPreviewPlayed(true)}
              />
            ) : (
              <p className="field-hint">No audio was returned.</p>
            )}
            {props.music.isDemoAudio && (
              <p className="field-hint" style={{ marginTop: "0.6rem" }}>
                This 24-second instrumental sketch was synthesized locally from
                your mood and genre — no audio service is connected. The full
                production brief below is ready for a real music API.
              </p>
            )}
            {!props.music.isDemoAudio && props.music.quality === "preview" && (
              <p className="take-note">
                This is a free {PREVIEW_SECONDS}-second preview — the full song is
                already made and ready to unlock.
              </p>
            )}

            {props.takes.length > 1 && (
              <div className="take-switcher" role="group" aria-label="Choose a take">
                {props.takes.map((take) => (
                  <button
                    key={take.n}
                    type="button"
                    className="shape-chip"
                    aria-pressed={props.music?.takeNumber === take.n}
                    onClick={() => props.onSelectTake(take.n)}
                  >
                    Take {take.n}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!props.music.isDemoAudio && props.music.quality === "preview" && previewPlayed && (
            <div className="wall-card card unlock-cta" role="region" aria-labelledby="unlock-heading">
              <h2 id="unlock-heading">Like what you heard?</h2>
              <p>
                The full-length, full-quality version of{" "}
                <strong>“{props.songTitle}”</strong>
                {props.takes.length > 1 ? ` (take ${props.music.takeNumber})` : ""} is
                already made. Unlock it to keep it forever
                {props.takes.length > 1 ? " — every take included" : ""}.
              </p>
              <div className="action-row wall-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={checkoutBusy !== null}
                  onClick={() => startCheckout("song_pass")}
                >
                  {checkoutBusy === "song_pass"
                    ? "Opening checkout…"
                    : `Song Pass — $9.99`}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={checkoutBusy !== null}
                  onClick={() => startCheckout("pro_monthly")}
                >
                  {checkoutBusy === "pro_monthly" ? "Opening checkout…" : "Or go Pro — 20 renders, $19/mo"}
                </button>
              </div>
            </div>
          )}

          <div className="lyrics-panel">
            <div className="lyrics-panel-head">
              <h3>Lyrics</h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={props.onCopyLyrics}>
                Copy lyrics
              </button>
            </div>
            {/* Reading copy — the raw tagged text is what was sent to the
                provider and what stays stored. */}
            <pre>{lyricsForReading(props.lyrics)}</pre>
          </div>

          <div className="style-prompt">
            <h3>Production brief {props.music.promptMode === "live" ? "(AI-crafted)" : "(auto-built)"}</h3>
            <p>{props.music.stylePrompt}</p>
          </div>

          <div className="action-row">
            {props.music.audioUrl && (props.music.isDemoAudio || props.music.downloadable) && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={props.onDownloadAudio}>
                Download audio
              </button>
            )}
            {!props.music.isDemoAudio && props.music.audioUrl && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={props.onCopyListenLink}>
                Copy listen link
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={props.onCopyPrompt}>
              Copy brief
            </button>
          </div>

          {/* ── The return loop, only once there is something to return to ── */}
          <div className="finish-row" role="group" aria-label="What next">
            {(props.entitlement?.tier === "pro" ||
              (props.entitlement?.purchasedCredits ?? 0) > 0 ||
              (props.entitlement?.freeTakesRemaining ?? 0) > 0) && (
              <button type="button" className="btn btn-primary" onClick={props.onGenerate}>
                ↻ Make another version
                {props.entitlement?.tier !== "pro" &&
                  ` (${(props.entitlement?.purchasedCredits ?? 0) > 0 ? props.entitlement?.purchasedCredits : props.entitlement?.freeTakesRemaining} left)`}
              </button>
            )}
            {!props.music.isDemoAudio && (
              <button type="button" className="btn btn-secondary" onClick={props.onViewSongs}>
                View in My Songs
              </button>
            )}
            {confirmingReset ? (
              <span className="action-row" role="group" aria-label="Confirm starting over">
                <span className="finish-confirm">Clear everything and start fresh?</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingReset(false)}>
                  Keep this song
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={props.onNewSong}>
                  Yes, new song
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmingReset(true)}>
                ✦ Start a new song
              </button>
            )}
          </div>
        </>
      )}

      {/* Before a render there is exactly one way onward and one way back —
          no competing escape route beside the main goal. */}
      <div className="flow-nav">
        <button type="button" className="btn btn-secondary" onClick={props.onBack}>
          ← Back to lyrics
        </button>
        <span className="spacer" />
        {!preGenerate && props.status !== "ready" && (
          confirmingReset ? (
            <span className="action-row" role="group" aria-label="Confirm starting over">
              <span className="finish-confirm">Clear everything and start fresh?</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmingReset(false)}>
                Keep this song
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={props.onNewSong}>
                Yes, new song
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmingReset(true)}>
              ✦ Start a new song
            </button>
          )
        )}
      </div>
    </div>
  );
}
