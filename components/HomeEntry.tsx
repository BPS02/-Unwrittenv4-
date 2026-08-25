"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import PixelField from "./PixelField";
import { DRAFT_KEY, packExpiring, unpackExpiring } from "@/lib/draft-storage";
import { getTemplate } from "@/lib/templates";
import { DEFAULT_CONTROLS, EMPTY_INPUT, type SongControls, type SongInput } from "@/lib/types";
import { MAX_THOUGHT_LENGTH, MIN_THOUGHT_WORDS, thoughtWordCount } from "@/lib/validation";

export const SENTENCE_STARTERS = [
  "I keep thinking about…",
  "I never told you…",
  "Lately I feel…",
] as const;

const HOME_TEMPLATES = [
  { id: "someone-i-miss", title: "A person I miss", note: "Turn a memory into something lasting", icon: "portrait" },
  { id: "something-unsaid", title: "Something I never said", note: "Write the words you held back", icon: "letter" },
  { id: "starting-over", title: "Where I am right now", note: "Capture this chapter of your life", icon: "horizon" },
] as const;

interface StoredDraft {
  input?: SongInput;
  controls?: SongControls;
  mode?: string;
}

function TemplateIcon({ name }: { name: (typeof HOME_TEMPLATES)[number]["icon"] }) {
  if (name === "letter") {
    return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 12l19 16 19-16M7 10h34v28H7z" /><path className="home-template-accent" d="M20 21c2-5 9-3 8 1-1-4 6-6 8-1 1 4-5 8-8 10-3-2-9-6-8-10z" /></svg>;
  }
  if (name === "horizon") {
    return <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="13" cy="13" r="5" /><path d="M13 3v4M13 19v4M3 13h4M19 13h4M5.8 5.8l3 3M17.2 17.2l3 3M20.2 5.8l-3 3M4 40c7-8 13-8 20-4 7 4 12 2 20-6M4 32c8-5 14-5 21-1M26 26c6 2 11 1 18-4" /></svg>;
  }
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 5h29l3 34H12z" /><path d="M14 10h19v20H14z" /><circle cx="24" cy="17" r="4" /><path d="M16 28c3-5 7-7 10-5 3 2 5 2 7 0" /></svg>;
}

function YouAccountButton() {
  const { isLoaded, isSignedIn } = useUser();

  const openAccount = () => {
    if (!isLoaded) return;
    if (isSignedIn) {
      window.location.assign("/profile");
    } else {
      window.location.assign("/sign-in");
    }
  };

  return (
    <button type="button" onClick={openAccount} aria-label={isSignedIn ? "Open your profile" : "Sign in"}>
      <span aria-hidden="true">♙</span><small>You</small>
    </button>
  );
}

export default function HomeEntry({ clerkEnabled = true }: { clerkEnabled?: boolean }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [thought, setThought] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const draft = unpackExpiring<StoredDraft>(sessionStorage.getItem(DRAFT_KEY));
    if (draft?.mode === "freeform" && draft.input?.thought) setThought(draft.input.thought);
  }, []);

  function saveAndContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = thought.trim();
    if (thoughtWordCount(value) < MIN_THOUGHT_WORDS) {
      setError("Share at least a few honest words to begin.");
      textareaRef.current?.focus();
      return;
    }
    if (value.length > MAX_THOUGHT_LENGTH) {
      setError("Please keep this under 2,000 characters.");
      return;
    }
    // The Home page starts a new setup. Never merge hidden context, feelings,
    // answers, or questions from a previous draft into this new thought.
    sessionStorage.setItem(DRAFT_KEY, packExpiring({
      step: "shape", reached: "shape", mode: "freeform",
      input: { ...EMPTY_INPUT, thought: value },
      controls: DEFAULT_CONTROLS,
      variation: 0, song: null, songId: null, questions: [], answers: {},
    }));
    router.push("/create");
  }

  function insertStarter(starter: string) {
    setThought(starter);
    setError(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(starter.length, starter.length);
    });
  }

  function startFromTemplate(templateId: string) {
    const template = getTemplate(templateId);
    if (!template) {
      router.push("/create/start");
      return;
    }
    sessionStorage.setItem(DRAFT_KEY, packExpiring({
      step: "write", reached: "write", mode: "template",
      input: {
        ...EMPTY_INPUT,
        thought: template.starterThoughts[0] ?? "",
        feelings: [...template.feelings],
        templateId: template.id,
      },
      controls: { ...DEFAULT_CONTROLS, ...template.suggested },
      variation: 0, song: null, songId: null, questions: [], answers: {},
    }));
    router.push("/create");
  }

  return (
    <main className={`home-journal${thought ? " is-writing" : ""}`}>
      <PixelField />
      <div className="home-ambient" aria-hidden="true" />
      <div className="home-journal-inner">
        <header className="home-intro">
          <p className="home-kicker">UNWRITTEN</p>
          <h1>Take your time.</h1>
          <span className="home-title-stroke" aria-hidden="true" />
          <p>Start with the moment<br />you can’t stop thinking about.</p>
        </header>

        <form className="home-writing-form" onSubmit={saveAndContinue} noValidate>
          <section className="home-paper" aria-labelledby="home-thought-title">
            <span className="home-paper-shadow" aria-hidden="true" />
            <h2 id="home-thought-title">What’s been on your<br />mind lately?</h2>
            <span className="home-paper-rule" aria-hidden="true" />
            <textarea ref={textareaRef} value={thought}
              onChange={(event) => { setThought(event.target.value); setError(null); }}
              placeholder="Write a thought, memory, confession, or feeling…"
              maxLength={MAX_THOUGHT_LENGTH} rows={5} aria-invalid={Boolean(error)}
              aria-describedby={error ? "home-thought-error" : "home-thought-help"} />
            <p id="home-thought-help" className="home-paper-help"><span aria-hidden="true">♧</span> A few honest words are enough.</p>
            {error && <p id="home-thought-error" className="home-paper-error" role="alert">{error}</p>}
          </section>

          <div className="home-notes" aria-label="Sentence starters">
            {SENTENCE_STARTERS.map((starter, index) => (
              <button key={starter} type="button" onClick={() => insertStarter(starter)} className={`home-note home-note-${index + 1}`}>{starter}</button>
            ))}
          </div>
          <button type="submit" className="home-submit">Shape this into lyrics <span aria-hidden="true">→</span></button>
        </form>

        <section className="home-templates" aria-labelledby="home-templates-title">
          <h2 id="home-templates-title"><span aria-hidden="true">❧</span> Starter templates <span aria-hidden="true">❧</span></h2>
          <div className="home-template-list">
            {HOME_TEMPLATES.map((template) => (
              <button key={template.id} type="button" onClick={() => startFromTemplate(template.id)} className="home-template-row">
                <span className="home-template-icon"><TemplateIcon name={template.icon} /></span>
                <span className="home-template-copy"><strong>{template.title}</strong><small>{template.note}</small></span>
                <span className="home-template-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <Link href="/create/start" className="home-browse-link">Browse all templates</Link>
        </section>
      </div>

      <nav className="home-bottom-nav" aria-label="Primary navigation">
        <Link href="/" className="is-current" aria-current="page"><span aria-hidden="true">✎</span><small>Write</small></Link>
        <Link href="/songs"><span aria-hidden="true">♫</span><small>My Songs</small></Link>
        {clerkEnabled
          ? <YouAccountButton />
          : <Link href="/plans"><span aria-hidden="true">♙</span><small>You</small></Link>}
      </nav>
    </main>
  );
}
