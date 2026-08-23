"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SongInput, Template } from "@/lib/types";
import { FEELING_CHIPS } from "@/lib/types";
import { MAX_CONTEXT_LENGTH, MAX_FEELINGS_TEXT_LENGTH, MAX_THOUGHT_LENGTH } from "@/lib/validation";
import CrisisNote from "./CrisisNote";

export type WriteMode = "freeform" | "template";

/** How many feelings show before the rest are tucked behind "More feelings". */
const VISIBLE_FEELINGS = 8;

/**
 * Emotional families, used only for a barely-there tint difference on a
 * selected chip. The point is that a wall of identical pills stops reading as
 * a wall — not colour-coding, so the shift stays under ~10% mix.
 */
const FEELING_FAMILY: Record<string, "lifted" | "tender" | "heavy"> = {
  grateful: "lifted", hopeful: "lifted", relieved: "lifted", proud: "lifted",
  excited: "lifted", free: "lifted", "in love": "lifted",
  tender: "tender", bittersweet: "tender", nostalgic: "tender", peaceful: "tender",
  lonely: "heavy", anxious: "heavy", heartbroken: "heavy", angry: "heavy",
  overwhelmed: "heavy",
};

interface WriteStepProps {
  input: SongInput;
  onInputChange: (patch: Partial<SongInput>) => void;
  appliedTemplate: Template | undefined;
  onClearTemplate: () => void;
  thoughtError: string | null;
  contextError: string | null;
  showCrisisNote: boolean;
  onContinue: () => void;
  onReset: () => void;
}

export default function WriteStep({ input, onInputChange, appliedTemplate, onClearTemplate, thoughtError, contextError, showCrisisNote, onContinue, onReset }: WriteStepProps) {
  const thoughtId = useId();
  const feelingsId = useId();
  const contextId = useId();
  const errorId = useId();
  const contextErrorId = useId();
  const moreId = useId();
  const thoughtRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<HTMLTextAreaElement>(null);

  /** Feelings stay optional; the thought and the details do not. */
  const incomplete = input.thought.trim().length === 0 || input.context.trim().length === 0;

  /**
   * This step is tall enough that a refusal can render off-screen above
   * someone working in the last card, so bring the first offending field to
   * them rather than leaving the button looking broken.
   */
  useEffect(() => {
    const target = thoughtError ? thoughtRef.current : contextError ? contextRef.current : null;
    if (!target) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    target.focus({ preventScroll: true });
  }, [thoughtError, contextError]);

  const primary = FEELING_CHIPS.slice(0, VISIBLE_FEELINGS);
  const overflow = useMemo(() => FEELING_CHIPS.slice(VISIBLE_FEELINGS), []);
  // A feeling carried in from a draft must never be hidden behind the toggle.
  const [expanded, setExpanded] = useState(() => overflow.some((f) => input.feelings.includes(f)));
  const shown = expanded ? FEELING_CHIPS : primary;
  const hiddenSelected = overflow.filter((f) => input.feelings.includes(f)).length;

  const toggleFeeling = (feeling: string) => onInputChange({ feelings: input.feelings.includes(feeling) ? input.feelings.filter((item) => item !== feeling) : [...input.feelings, feeling] });

  return (
    <div className="step-panel">
      <div className="step-heading"><h1>Make this starting point yours.</h1><p>Edit every word, keep only what feels true, and skip feelings freely.</p></div>
      {appliedTemplate && <div className="template-note"><span>Started from <strong>“{appliedTemplate.theme}”</strong> — edit anything below to make it yours.</span><button type="button" className="btn btn-ghost btn-sm" onClick={onClearTemplate}>Clear</button></div>}
      {showCrisisNote && <CrisisNote />}

      <form className="write-form" onSubmit={(event) => { event.preventDefault(); onContinue(); }} noValidate>
        {/* ── The thought: the loudest card on the page ─────────────────── */}
        <section className="write-section is-primary">
          {/* The other two cards say "Optional"; saying so here makes the one
              rule visible before someone hits it. */}
          <label className="write-label" htmlFor={thoughtId}>
            Your thought<span className="write-required">Required</span>
          </label>
          <p className="write-hint">A memory, person, worry, hope, or moment you can’t shake. Three words is enough.</p>
          <textarea
            ref={thoughtRef}
            id={thoughtId}
            value={input.thought}
            className={`write-input is-tall${thoughtError ? " invalid" : ""}`}
            aria-invalid={Boolean(thoughtError)}
            aria-describedby={thoughtError ? errorId : undefined}
            placeholder="Write at least three words…"
            onChange={(event) => onInputChange({ thought: event.target.value })}
          />
          {input.thought.length > 1800 && <div className="char-count" aria-live="polite">{input.thought.length} / {MAX_THOUGHT_LENGTH}</div>}
          {thoughtError && <p className="field-error" id={errorId} role="alert">{thoughtError}</p>}
        </section>

        {/* ── Feelings: lighter, and no longer a wall of chips ──────────── */}
        <section className="write-section is-secondary">
          <span className="write-label" id={`${feelingsId}-label`}>
            How does it feel?<span className="write-optional">Optional</span>
          </span>
          <div className="write-chips" role="group" aria-labelledby={`${feelingsId}-label`}>
            {shown.map((feeling) => (
              <button
                key={feeling}
                type="button"
                className="chip feeling-chip"
                data-family={FEELING_FAMILY[feeling] ?? "tender"}
                aria-pressed={input.feelings.includes(feeling)}
                onClick={() => toggleFeeling(feeling)}
              >
                {feeling}
              </button>
            ))}
            {!expanded && overflow.length > 0 && (
              <button type="button" className="chip chip-more" aria-expanded={false} aria-controls={moreId} onClick={() => setExpanded(true)}>
                + {overflow.length} more{hiddenSelected > 0 ? ` (${hiddenSelected} selected)` : ""}
              </button>
            )}
          </div>
          {expanded && overflow.length > 0 && (
            <button type="button" className="write-more-toggle" id={moreId} aria-expanded onClick={() => setExpanded(false)}>Show fewer</button>
          )}
          <textarea
            aria-label="Describe the feeling in your own words (optional)"
            className="write-input"
            value={input.feelingsText}
            maxLength={MAX_FEELINGS_TEXT_LENGTH}
            placeholder="…or describe it in your own words."
            onChange={(event) => onInputChange({ feelingsText: event.target.value })}
          />
        </section>

        {/* ── Details: the quietest card ───────────────────────────────── */}
        <section className="write-section is-quiet">
          <label className="write-label" htmlFor={contextId}>
            Details to weave in<span className="write-required">Required</span>
          </label>
          <p className="write-hint">Names, places, phrases, or tiny details that make the song yours.</p>
          <textarea
            ref={contextRef}
            id={contextId}
            className={`write-input${contextError ? " invalid" : ""}`}
            value={input.context}
            maxLength={MAX_CONTEXT_LENGTH}
            aria-invalid={Boolean(contextError)}
            aria-describedby={contextError ? contextErrorId : undefined}
            placeholder="Her name is June. We always stopped at the diner with the broken neon sign."
            onChange={(event) => onInputChange({ context: event.target.value })}
          />
          {contextError && <p className="field-error" id={contextErrorId} role="alert">{contextError}</p>}
        </section>

        <div className="write-nav">
          <button type="button" className="write-reset" onClick={onReset} title="Clears everything on this page — thought, feelings, and personal details.">↺ Reset all fields</button>
          <div className="write-nav-end">
            {/* Visual echo of the field error, so a refusal is legible from
                the button too. aria-hidden: the fields already announce. */}
            {(thoughtError || contextError) && (
              <p className="write-nav-error" aria-hidden="true">{thoughtError ?? contextError}</p>
            )}
            {/* Deliberately NOT disabled. A dead button explains nothing; this
                one looks unready but still answers when you press it. */}
            <button type="submit" className={`btn btn-primary btn-continue${incomplete ? " is-waiting" : ""}`}>
              Continue to shape <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
