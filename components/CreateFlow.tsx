"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type {
  EntitlementSummaryWire,
  MusicResult,
  QuestionAnswer,
  SongControls,
  SongInput,
  SongQuestion,
} from "@/lib/types";
import { DEFAULT_CONTROLS, EMPTY_INPUT } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import { answersComplete, collectAnswers, unansweredQuestionIds } from "@/lib/questions";
import { detectCrisisLanguage } from "@/lib/crisis";
import { MAX_THOUGHT_LENGTH, MIN_THOUGHT_WORDS, thoughtWordCount } from "@/lib/validation";
import Stepper, { STEP_ORDER, type FlowStep } from "./Stepper";
import WriteStep, { type WriteMode } from "./WriteStep";
import ShapeStep from "./ShapeStep";
import QuestionsStep, { type QuestionsStatus } from "./QuestionsStep";
import LyricsStep, { type SongDraft } from "./LyricsStep";
import { lyricsForReading } from "@/lib/lyrics-display";
import MusicStep, {
  type CheckoutProduct,
  type MusicState,
  type MusicStatus,
  type TakeOption,
} from "./MusicStep";
import {
  AUTH_RETURN_KEY,
  DRAFT_KEY,
  PENDING_ACTION_KEY,
  isPendingAction,
  packExpiring,
  unpackExpiring,
  type PendingAction,
} from "@/lib/draft-storage";

const DEVICE_KEY = "liner-notes:device:v1";

interface Draft {
  step: FlowStep;
  reached: FlowStep;
  mode: WriteMode;
  input: SongInput;
  controls: SongControls;
  variation: number;
  song: SongDraft | null;
  /** One thought rendered to music — takes are counted per songId. */
  songId: string | null;
  /** The follow-up questions this draft was asked, and what was typed back. */
  questions: SongQuestion[];
  answers: Record<string, string>;
}

function stepIndex(step: FlowStep): number {
  return STEP_ORDER.indexOf(step);
}

function maxStep(a: FlowStep, b: FlowStep): FlowStep {
  return stepIndex(a) >= stepIndex(b) ? a : b;
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "song";
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function errorMessageFrom(data: unknown, fallback: string): string {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

function refusalReasonFrom(data: unknown): string | null {
  return data && typeof data === "object" && "reason" in data && typeof data.reason === "string"
    ? data.reason
    : null;
}

/** `musicMode` is resolved on the server — MUSIC_PROVIDER is not public. */
export default function CreateFlow({ musicMode = "demo" }: { musicMode?: "demo" | "live" } = {}) {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<FlowStep>("write");
  const [reached, setReached] = useState<FlowStep>("write");
  const [mode, setMode] = useState<WriteMode>("freeform");
  const [input, setInput] = useState<SongInput>(EMPTY_INPUT);
  const [controls, setControls] = useState<SongControls>(DEFAULT_CONTROLS);
  const [variation, setVariation] = useState(0);
  const [songId, setSongId] = useState<string | null>(null);
  const [thoughtError, setThoughtError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<SongQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questionsStatus, setQuestionsStatus] = useState<QuestionsStatus>("ready");
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [missingAnswers, setMissingAnswers] = useState<string[]>([]);

  const [song, setSong] = useState<SongDraft | null>(null);
  const [lyricsStatus, setLyricsStatus] = useState<"loading" | "error" | "ready">("ready");
  const [lyricsError, setLyricsError] = useState<string | null>(null);

  const [music, setMusic] = useState<MusicState | null>(null);
  const [takes, setTakes] = useState<TakeOption[]>([]);
  const [musicStatus, setMusicStatus] = useState<MusicStatus>("idle");
  const [musicError, setMusicError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSummaryWire | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pendingFireRef = useRef(false);
  /** Draft restored onto the questions step before its questions arrived. */
  const refetchQuestionsRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Hydrate draft from sessionStorage, then apply URL params ──────────
  useEffect(() => {
    try {
      const draft = unpackExpiring<Partial<Draft>>(sessionStorage.getItem(DRAFT_KEY));
      const validDraft = Boolean(
        draft && draft.input && typeof draft.input.thought === "string" &&
        draft.controls && draft.step && STEP_ORDER.includes(draft.step) &&
        draft.reached && STEP_ORDER.includes(draft.reached) &&
        (draft.mode === "freeform" || draft.mode === "template")
      );
      if (draft && validDraft) {
        if (draft.input) setInput({ ...EMPTY_INPUT, ...draft.input });
        if (draft.controls) setControls({ ...DEFAULT_CONTROLS, ...draft.controls });
        if (draft.mode) setMode(draft.mode);
        if (typeof draft.variation === "number") setVariation(draft.variation);
        if (draft.song) setSong(draft.song);
        if (typeof draft.songId === "string") setSongId(draft.songId);
        // A restored draft keeps its question set, so returning to the step
        // shows what was asked rather than silently asking something else.
        if (Array.isArray(draft.questions)) setQuestions(draft.questions);
        if (draft.answers && typeof draft.answers === "object") setAnswers(draft.answers);
        // Restored ONTO the questions step with none stored — the tab was
        // reloaded (or came back from sign-in) while they were still being
        // written. Without this the step renders empty forever and the
        // "answer them all" rule passes vacuously.
        if (draft.step === "questions" && (draft.questions ?? []).length === 0) {
          refetchQuestionsRef.current = true;
        }
        if (draft.step && STEP_ORDER.includes(draft.step)) setStep(draft.step);
        if (draft.reached && STEP_ORDER.includes(draft.reached)) setReached(draft.reached);

        // Restore a pending action left before the sign-in redirect, so the
        // user lands back exactly where they were — with generation surfaced.
        const pending = unpackExpiring<PendingAction>(sessionStorage.getItem(PENDING_ACTION_KEY));
        if (isPendingAction(pending) && draft.song) {
          sessionStorage.removeItem(PENDING_ACTION_KEY);
          setStep("music");
          setReached("music");
          pendingFireRef.current = true;
        }
      } else {
        sessionStorage.removeItem(DRAFT_KEY);
        router.replace("/");
      }

      // Post-checkout return: the webhook grants credits, this is only copy.
      const billing = /[?&]billing=(success|cancelled)\b/.exec(window.location.search)?.[1];
      if (billing === "success") {
        setStep("music");
        setReached((r) => maxStep(r, "music"));
        showToast("Payment received — your credits unlock the moment it’s confirmed.");
        router.replace("/create");
      } else if (billing === "cancelled") {
        showToast("Checkout cancelled — everything you made is still here.");
        router.replace("/create");
      }
    } catch {
      // A malformed draft should never break the page.
    }

    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // ── Persist draft (session only, never audio) ─────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    const draft: Draft = {
      step,
      reached,
      mode,
      input,
      controls,
      variation,
      song,
      songId,
      questions,
      answers,
    };
    try {
      sessionStorage.setItem(DRAFT_KEY, packExpiring(draft));
    } catch {
      // Storage may be full or unavailable; the in-memory flow still works.
    }
  }, [
    hydrated,
    step,
    reached,
    mode,
    input,
    controls,
    variation,
    song,
    songId,
    questions,
    answers,
  ]);

  useEffect(() => {
    const active = lyricsStatus === "loading" || musicStatus === "loading";
    window.dispatchEvent(new CustomEvent("liner-notes:generation", { detail: active }));
    return () => {
      window.dispatchEvent(new CustomEvent("liner-notes:generation", { detail: false }));
    };
  }, [lyricsStatus, musicStatus]);

  function deviceToken(): string {
    let token = sessionStorage.getItem(DEVICE_KEY);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(DEVICE_KEY, token);
    }
    return token;
  }

  // Move focus to the step panel on step changes for keyboard users.
  const prevStep = useRef<FlowStep>(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      panelRef.current?.focus({ preventScroll: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showCrisisNote = useMemo(
    () => detectCrisisLanguage(input.thought, input.feelingsText, input.context),
    [input.thought, input.feelingsText, input.context]
  );

  const appliedTemplate = useMemo(
    () => (input.templateId ? getTemplate(input.templateId) : undefined),
    [input.templateId]
  );

  const goTo = useCallback((next: FlowStep) => {
    setStep(next);
    setReached((r) => maxStep(r, next));
  }, []);

  const updateInput = useCallback((patch: Partial<SongInput>) => {
    setInput((prev) => ({ ...prev, ...patch }));
    if (patch.thought !== undefined) setThoughtError(null);
    if (patch.context !== undefined) setContextError(null);
  }, []);

  const updateControls = useCallback((patch: Partial<SongControls>) => {
    setControls((prev) => ({ ...prev, ...patch }));
  }, []);

  function validateThought(): boolean {
    if (thoughtWordCount(input.thought) < MIN_THOUGHT_WORDS) {
      setThoughtError("Share at least a few words to begin.");
      return false;
    }
    if (input.thought.trim().length > MAX_THOUGHT_LENGTH) {
      setThoughtError("Please keep this under 2,000 characters.");
      return false;
    }
    return true;
  }

  /** Details to weave in are required before shaping the song. */
  function validateContext(): boolean {
    if (input.context.trim().length === 0) {
      setContextError("Add a detail or two so the song has something of yours in it.");
      return false;
    }
    return true;
  }

  const handleContinueToShape = () => {
    // Validate both so the user sees every blocker at once rather than
    // clearing one and being stopped again by the next.
    const thoughtOk = validateThought();
    const contextOk = validateContext();
    if (!thoughtOk || !contextOk) return;
    goTo("shape");
  };

  // ── Follow-up questions ───────────────────────────────────────────────
  /**
   * Questions are written for this writer by the model — there is no canned
   * list — so this is a real network call with a real failure state. It runs
   * once per draft: coming back from a later step shows the same questions
   * and the same answers rather than quietly asking something else.
   */
  const fetchQuestions = useCallback(async () => {
    const loadingStartedAt = Date.now();
    const holdLoadingStage = async () => {
      const remaining = 1600 - (Date.now() - loadingStartedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    };
    setQuestionsStatus("loading");
    setQuestionsError(null);
    setMissingAnswers([]);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-LinerNotes-Device": deviceToken() },
        body: JSON.stringify({ input, controls }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(errorMessageFrom(data, "We couldn’t put your questions together."));
      }
      const list = (data as { questions?: SongQuestion[] }).questions ?? [];
      if (list.length === 0) throw new Error("No questions came back. Please try again.");
      await holdLoadingStage();
      setQuestions(list);
      setAnswers({});
      setQuestionsStatus("ready");
    } catch (err) {
      await holdLoadingStage();
      setQuestionsError(err instanceof Error ? err.message : "Something went wrong.");
      setQuestionsStatus("error");
    }
  }, [controls, input]);

  const handleContinueToQuestions = () => {
    if (!validateThought()) {
      setStep("write");
      return;
    }
    if (!songId) setSongId(crypto.randomUUID());

    // Already asked AND fully answered — by walking back a step and
    // forward again. Marching someone through
    // questions they have just answered is the fastest way to make the step
    // feel like an obstacle, so go straight to the lyrics.
    if (answersComplete(questions, answers)) {
      const collected: QuestionAnswer[] = collectAnswers(questions, answers);
      const nextInput: SongInput = { ...input, answers: collected };
      setInput(nextInput);
      void generateLyrics(variation, nextInput);
      return;
    }

    goTo("questions");
    // Partly asked? Keep the set and whatever has been typed into it.
    if (questions.length === 0) void fetchQuestions();
  };

  // Re-ask when a draft was restored onto the step before its questions
  // arrived. Runs once, after hydration, so it sees the restored input.
  useEffect(() => {
    if (!hydrated || !refetchQuestionsRef.current) return;
    refetchQuestionsRef.current = false;
    void fetchQuestions();
  }, [hydrated, fetchQuestions]);

  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setMissingAnswers((prev) => (value.trim() ? prev.filter((q) => q !== id) : prev));
  };

  // ── Lyrics generation ─────────────────────────────────────────────────
  const generateLyrics = useCallback(
    async (variationToUse: number, inputOverride?: SongInput) => {
      // The answers are set in the same tick they're submitted, so the
      // caller passes the input it just built rather than racing setState.
      const payloadInput = inputOverride ?? input;
      goTo("lyrics");
      setLyricsStatus("loading");
      setLyricsError(null);
      // A new take invalidates previously generated music.
      setMusic(null);
      setTakes([]);
      setMusicStatus("idle");
      try {
        const res = await fetch("/api/lyrics", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-LinerNotes-Device": deviceToken() },
          body: JSON.stringify({ input: payloadInput, controls, variation: variationToUse }),
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(errorMessageFrom(data, "Something went wrong while writing your lyrics."));
        }
        const result = data as SongDraft;
        setSong({
          title: result.title,
          lyrics: result.lyrics,
          mode: result.mode,
          style: result.style,
          model: result.model,
        });
        setLyricsStatus("ready");
      } catch (err) {
        setLyricsError(err instanceof Error ? err.message : "Something went wrong.");
        setLyricsStatus("error");
      }
    },
    [controls, goTo, input]
  );

  /**
   * Every question must be answered before the lyrics are written — that is
   * the point of the step. Blank ones are flagged in place rather than the
   * button silently doing nothing.
   */
  const handleSubmitAnswers = () => {
    // No questions means none were answered — "all of them" must not pass
    // vacuously. Ask for them instead of writing lyrics without any.
    if (questions.length === 0) {
      void fetchQuestions();
      return;
    }
    if (!answersComplete(questions, answers)) {
      setMissingAnswers(unansweredQuestionIds(questions, answers));
      return;
    }
    const collected: QuestionAnswer[] = collectAnswers(questions, answers);
    const nextInput: SongInput = { ...input, answers: collected };
    setInput(nextInput);
    setMissingAnswers([]);
    void generateLyrics(variation, nextInput);
  };

  /** Only reachable after the questions failed to generate — not a skip. */
  const handleContinueWithoutQuestions = () => {
    const nextInput: SongInput = { ...input, answers: [] };
    setInput(nextInput);
    void generateLyrics(variation, nextInput);
  };

  const handleAnotherTake = () => {
    const next = variation + 1;
    setVariation(next);
    void generateLyrics(next);
  };

  // ── Music generation ──────────────────────────────────────────────────
  const generateMusic = useCallback(async () => {
    if (!song) return;
    let currentSongId = songId;
    if (!currentSongId) {
      currentSongId = crypto.randomUUID();
      setSongId(currentSongId);
    }
    setMusicStatus("loading");
    setMusicError(null);
    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-LinerNotes-Device": deviceToken() },
        body: JSON.stringify({
          title: song.title,
          lyrics: song.lyrics,
          controls,
          // The STYLE brief the generator wrote with these lyrics; the server
          // falls back to a deterministic brief when a restored draft predates it.
          ...(song.style ? { style: song.style } : {}),
          songId: currentSongId,
        }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const reason = refusalReasonFrom(data);
        if (reason === "signin_required") {
          setMusicStatus("signin");
          return;
        }
        if (reason === "payment_required") {
          const summary = (data as { entitlement?: EntitlementSummaryWire }).entitlement;
          if (summary) setEntitlement(summary);
          setMusicStatus("paywall");
          return;
        }
        throw new Error(errorMessageFrom(data, "Music generation failed unexpectedly."));
      }

      const result = data as MusicResult & {
        promptMode: "demo" | "live";
        entitlement?: EntitlementSummaryWire;
      };

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      if (result.mode === "audio") {
        const ext = result.audio.mimeType.includes("wav") ? "wav" : "mp3";
        if (result.entitlement) setEntitlement(result.entitlement);
        setMusic({
          stylePrompt: result.stylePrompt,
          promptMode: result.promptMode,
          audioUrl: result.audio.streamPath,
          isDemoAudio: false,
          provider: result.provider,
          fileExtension: ext,
          quality: result.quality,
          unlocked: result.unlocked,
          downloadable: result.downloadable,
          takeNumber: result.takeNumber,
        });
        setTakes((prev) => {
          const without = prev.filter((t) => t.n !== result.takeNumber);
          return [
            ...without,
            { n: result.takeNumber, audioUrl: result.audio.streamPath, isDemoAudio: false },
          ].sort((a, b) => a.n - b.n);
        });
      } else {
        // Demo: synthesize a short instrumental sketch locally.
        const { renderDemoAudio } = await import("@/lib/demo-audio");
        const blob = await renderDemoAudio({
          title: song.title,
          mood: controls.mood,
          genre: controls.genre,
        });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        if (result.entitlement) setEntitlement(result.entitlement);
        setMusic({
          stylePrompt: result.stylePrompt,
          promptMode: result.promptMode,
          audioUrl: url,
          isDemoAudio: true,
          fileExtension: "wav",
          quality: "full",
          unlocked: true,
          downloadable: true,
        });
      }
      setMusicStatus("ready");
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Music generation failed.");
      setMusicStatus("error");
    }
  }, [controls, song, songId]);

  // Re-fire a generation that was interrupted by the sign-in redirect.
  useEffect(() => {
    if (!hydrated || !pendingFireRef.current) return;
    pendingFireRef.current = false;
    if (!song) return;
    showToast("Welcome back — generating your song");
    void generateMusic();
  }, [hydrated, song, generateMusic, showToast]);

  // ── Sign-in wall & paywall ────────────────────────────────────────────
  const handleSignInForMusic = () => {
    try {
      // Draft (including lyrics) is already in sessionStorage; store only the
      // pending action name and a safe return route — never content in URLs.
      sessionStorage.setItem(
        PENDING_ACTION_KEY,
        packExpiring<PendingAction>({ action: "generate_music", returnTo: "/create" })
      );
      sessionStorage.setItem(AUTH_RETURN_KEY, "/create");
    } catch {
      // If storage fails the user just returns to a fresh /create.
    }
    router.push("/sign-in");
  };

  const handleDismissPaywall = () => {
    setMusicStatus(music ? "ready" : "idle");
  };

  const handleSelectTake = (n: number) => {
    const take = takes.find((t) => t.n === n);
    if (!take || !music) return;
    setMusic({ ...music, audioUrl: take.audioUrl, isDemoAudio: take.isDemoAudio, takeNumber: n });
  };

  const handleCheckout = async (product: CheckoutProduct) => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Unlocks are per song — the server validates that pairing.
        body: JSON.stringify(product === "song_pass" ? { product, songId } : { product }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(errorMessageFrom(data, "Checkout couldn’t start. Please try again."));
        return;
      }
      const url = (data as { url?: string }).url;
      if (url) window.location.assign(url);
    } catch {
      showToast("Checkout couldn’t start. Please try again.");
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────
  const handleCopyLyrics = async () => {
    if (!song) return;
    try {
      // Share the reading copy — production tags are for the music model.
      await navigator.clipboard.writeText(`${song.title}\n\n${lyricsForReading(song.lyrics)}`);
      showToast("Lyrics copied");
    } catch {
      showToast("Couldn't copy — your browser blocked it");
    }
  };

  const handleCopyPrompt = async () => {
    if (!music) return;
    try {
      await navigator.clipboard.writeText(music.stylePrompt);
      showToast("Production brief copied");
    } catch {
      showToast("Couldn't copy — your browser blocked it");
    }
  };

  const handleCopyListenLink = async () => {
    if (!music?.audioUrl || music.isDemoAudio) return;
    try {
      const absolute = new URL(music.audioUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(absolute);
      showToast("Listen link copied — valid for about an hour");
    } catch {
      showToast("Couldn't copy — your browser blocked it");
    }
  };

  const handleDownloadLyrics = () => {
    if (!song) return;
    downloadBlob(
      new Blob([`${song.title}\n\n${lyricsForReading(song.lyrics)}\n`], { type: "text/plain;charset=utf-8" }),
      `${slugify(song.title)}.txt`
    );
    showToast("Lyrics downloaded");
  };

  const handleDownloadAudio = async () => {
    if (!music?.audioUrl || !song) return;
    try {
      const url = music.isDemoAudio ? music.audioUrl : `${music.audioUrl}?download=1`;
      const res = await fetch(url);
      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        showToast(errorMessageFrom(data, "Couldn't download the audio"));
        return;
      }
      const blob = await res.blob();
      downloadBlob(blob, `${slugify(song.title)}.${music.fileExtension}`);
      showToast("Audio downloaded");
    } catch {
      showToast("Couldn't download the audio");
    }
  };

  // Clears every field and any prior song state, but stays on the write step.
  const handleResetFields = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(PENDING_ACTION_KEY);
    } catch {
      // ignore
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setInput(EMPTY_INPUT);
    setControls(DEFAULT_CONTROLS);
    setVariation(0);
    setSongId(null);
    setSong(null);
    setQuestions([]);
    setAnswers({});
    setQuestionsStatus("ready");
    setQuestionsError(null);
    setMissingAnswers([]);
    setMusic(null);
    setTakes([]);
    setEntitlement(null);
    setMusicStatus("idle");
    setLyricsStatus("ready");
    setLyricsError(null);
    setMusicError(null);
    setThoughtError(null);
    setContextError(null);
    setMode("freeform");
    setStep("write");
    setReached("write");
    showToast("All fields cleared");
  };

  const handleNewSong = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(PENDING_ACTION_KEY);
    } catch {
      // ignore
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setInput(EMPTY_INPUT);
    setControls(DEFAULT_CONTROLS);
    setVariation(0);
    setSongId(null);
    setSong(null);
    setQuestions([]);
    setAnswers({});
    setQuestionsStatus("ready");
    setQuestionsError(null);
    setMissingAnswers([]);
    setMusic(null);
    setTakes([]);
    setEntitlement(null);
    setMusicStatus("idle");
    setLyricsStatus("ready");
    setLyricsError(null);
    setMusicError(null);
    setThoughtError(null);
    setContextError(null);
    setMode("freeform");
    setStep("write");
    setReached("write");
    showToast("Fresh page — take your time");
    router.push("/");
  };

  if (!hydrated) return null;

  return (
    <div className="flow">
      <Stepper current={step} reached={reached} onNavigate={(target) => target === "write" && mode === "freeform" ? router.push("/") : goTo(target)} />

      <div ref={panelRef} tabIndex={-1} style={{ outline: "none" }}>
        {step === "write" && (
          <WriteStep
            input={input}
            onInputChange={updateInput}
            appliedTemplate={appliedTemplate}
            onClearTemplate={() => {
              const clearedInput = { ...EMPTY_INPUT, feelingsText: input.feelingsText, context: input.context };
              try {
                sessionStorage.setItem(DRAFT_KEY, packExpiring<Draft>({ step: "write", reached: "write", mode: "freeform", input: clearedInput, controls: DEFAULT_CONTROLS, variation: 0, song: null, songId: null, questions: [], answers: {} }));
              } catch { /* in-memory navigation still works */ }
              setInput(clearedInput);
              setControls(DEFAULT_CONTROLS);
              // Clearing the template clears what was asked about it.
              setQuestions([]);
              setAnswers({});
              setMode("freeform");
              router.push("/");
            }}
            thoughtError={thoughtError}
            contextError={contextError}
            showCrisisNote={showCrisisNote}
            onContinue={handleContinueToShape}
            onReset={handleResetFields}
          />
        )}

        {step === "shape" && (
          <ShapeStep
            input={input}
            controls={controls}
            onControlsChange={updateControls}
            onBack={() => mode === "template" ? setStep("write") : router.push("/")}
            onGenerate={handleContinueToQuestions}
          />
        )}

        {step === "questions" && (
          <QuestionsStep
            status={questionsStatus}
            error={questionsError}
            questions={questions}
            answers={answers}
            missing={missingAnswers}
            onAnswerChange={handleAnswerChange}
            onRetry={() => void fetchQuestions()}
            onBack={() => setStep("shape")}
            onContinue={handleSubmitAnswers}
            onContinueWithout={handleContinueWithoutQuestions}
          />
        )}

        {step === "lyrics" && (
          <LyricsStep
            status={lyricsStatus}
            error={lyricsError}
            song={song}
            input={input}
            controls={controls}
            onTitleChange={(title) => setSong((s) => (s ? { ...s, title } : s))}
            onLyricsChange={(lyrics) => setSong((s) => (s ? { ...s, lyrics } : s))}
            onAnotherTake={handleAnotherTake}
            onRetry={() => void generateLyrics(variation)}
            onCopy={() => void handleCopyLyrics()}
            onDownload={handleDownloadLyrics}
            onBack={() => setStep("questions")}
            onBackToShape={() => setStep("shape")}
            onContinue={() => goTo("music")}
          />
        )}

        {step === "music" && song && (
          <MusicStep
            status={musicStatus}
            error={musicError}
            music={music}
            takes={takes}
            onSelectTake={handleSelectTake}
            songTitle={song.title}
            lyrics={song.lyrics}
            controls={controls}
            musicMode={musicMode}
            entitlement={entitlement}
            onGenerate={() => void generateMusic()}
            onBack={() => setStep("lyrics")}
            onEditDirection={() => goTo("shape")}
            onViewSongs={() => router.push("/songs")}
            onDownloadAudio={() => void handleDownloadAudio()}
            onCopyPrompt={() => void handleCopyPrompt()}
            onCopyLyrics={() => void handleCopyLyrics()}
            onCopyListenLink={() => void handleCopyListenLink()}
            onNewSong={handleNewSong}
            onSignIn={handleSignInForMusic}
            onDismissPaywall={handleDismissPaywall}
            onCheckout={handleCheckout}
          />
        )}

        {step === "music" && !song && (
          <div className="empty-state">
            <span className="glyph" aria-hidden="true">🎶</span>
            <p>Write your lyrics first — then we’ll set them to music.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep("write")}>
              ← Start writing
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
