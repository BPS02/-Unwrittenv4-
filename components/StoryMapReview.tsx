"use client";

import { useMemo, useState } from "react";
import { approveStoryMap, updateStoryMapPrivacy, updateStoryMapText } from "@/lib/story-map-approval";
import type { StoryMapExtractionFlag } from "@/lib/story-map-extraction";
import type { StoryMapV1 } from "@/lib/story-map";

interface StoryMapReviewProps {
  draft: StoryMapV1;
  flags: StoryMapExtractionFlag[];
  onChange: (draft: StoryMapV1) => void;
  onResolveFlag: (index: number) => void;
  onApprove: (approved: StoryMapV1) => void;
  onBack: () => void;
}

const FACT_FIELDS = [
  ["central_relationship", "Who or what this centers on"],
  ["central_place", "Where the memory lives"],
  ["central_memory", "The moment you described"],
  ["final_detail", "The detail worth returning to"],
] as const;

const INTERPRETIVE_FIELDS = [
  ["what_went_unsaid", "What may have gone unsaid"],
  ["change_over_time", "What seems to have changed"],
  ["chorus_message", "The idea the chorus may carry"],
] as const;

export default function StoryMapReview(props: StoryMapReviewProps) {
  const [privateText, setPrivateText] = useState(props.draft.must_not_use.join("\n"));
  /** Validation problems must be VISIBLE — a thrown schema error inside an
   *  event handler reads as a dead button, which is worse than any message. */
  const [problem, setProblem] = useState<string | null>(null);
  const contradictions = props.flags.filter((flag) => flag.type === "contradiction");
  const interpretationByField = useMemo(
    () => new Map((props.draft.interpretations ?? []).map((item) => [item.field, item])),
    [props.draft.interpretations]
  );

  function friendly(error: unknown, fallback: string): string {
    if (error instanceof Error && !error.name.includes("Zod")) return error.message;
    return fallback;
  }

  function changeField(field: keyof StoryMapV1["building_blocks"], value: string) {
    try {
      props.onChange(updateStoryMapText(props.draft, field, value));
      setProblem(null);
    } catch (error) {
      setProblem(friendly(error, "That detail is too long — keep it under 40 words."));
    }
  }

  function changePrivacy(names: boolean, places: boolean, text = privateText) {
    try {
      props.onChange(updateStoryMapPrivacy(props.draft, {
        names,
        places,
        mustNotUse: text.split("\n"),
      }));
      setProblem(null);
    } catch (error) {
      setProblem(
        friendly(error, "One private detail conflicts with a phrase you asked us to keep — remove one of them.")
      );
    }
  }

  function approve() {
    try {
      props.onApprove(approveStoryMap(
        updateStoryMapPrivacy(props.draft, {
          names: props.draft.permissions.names,
          places: props.draft.permissions.places,
          mustNotUse: privateText.split("\n"),
        }),
        props.flags
      ));
      setProblem(null);
    } catch (error) {
      setProblem(friendly(error, "One of the edited fields isn’t valid — shorten it and try again."));
    }
  }

  return (
    <div className="step-panel story-map-review">
      <header className="story-map-review-head">
        <p>YOUR STORY MAP</p>
        <h1>Here&apos;s what I heard.</h1>
        <span>What did I get right, what did I miss, what should stay private?</span>
      </header>

      {props.flags.length > 0 && (
        <section className="story-map-review-card story-map-review-flags" aria-labelledby="review-flags-title">
          <h2 id="review-flags-title">Things to clear up</h2>
          {props.flags.map((flag, index) => (
            <div key={`${flag.type}-${index}`} className="story-map-review-flag">
              <p>{flag.summary}</p>
              <small>Based on answers: {flag.answer_ids.join(", ") || "not specified"}</small>
              <button type="button" onClick={() => props.onResolveFlag(index)}>I fixed this</button>
            </div>
          ))}
        </section>
      )}

      <section className="story-map-review-card" aria-labelledby="review-facts-title">
        <h2 id="review-facts-title">What you told us</h2>
        <p className="story-map-review-note">These are treated as details from your answers, not guesses.</p>
        {FACT_FIELDS.map(([field, label]) => (
          <label key={field}>{label}
            <textarea value={props.draft.building_blocks[field]} rows={2} onChange={(event) => changeField(field, event.target.value)} />
          </label>
        ))}
      </section>

      <section className="story-map-review-card" aria-labelledby="review-guesses-title">
        <h2 id="review-guesses-title">What we inferred</h2>
        <p className="story-map-review-note">These are creative interpretations. Change or remove anything that does not feel true.</p>
        {INTERPRETIVE_FIELDS.map(([field, label]) => {
          const evidence = interpretationByField.get(`building_blocks.${field}` as const);
          return (
            <label key={field}>{label}
              <textarea value={props.draft.building_blocks[field]} rows={2} onChange={(event) => changeField(field, event.target.value)} />
              {evidence && <small>{evidence.confidence} confidence · answers {evidence.basis.join(", ")}</small>}
            </label>
          );
        })}
      </section>

      <section className="story-map-review-card" aria-labelledby="review-private-title">
        <h2 id="review-private-title">What should stay private?</h2>
        <label className="story-map-review-toggle">
          <input type="checkbox" checked={props.draft.permissions.names} onChange={(event) => changePrivacy(event.target.checked, props.draft.permissions.places)} />
          Names may appear in this song
        </label>
        <label className="story-map-review-toggle">
          <input type="checkbox" checked={props.draft.permissions.places} onChange={(event) => changePrivacy(props.draft.permissions.names, event.target.checked)} />
          Places may appear in this song
        </label>
        <label>Never use these details
          <textarea
            value={privateText}
            rows={4}
            placeholder="One private detail per line"
            onChange={(event) => setPrivateText(event.target.value)}
            onBlur={() => changePrivacy(props.draft.permissions.names, props.draft.permissions.places)}
          />
        </label>
      </section>

      <div className="story-map-review-actions">
        <button type="button" className="btn btn-secondary" onClick={props.onBack}>← Back to questions</button>
        <button type="button" className="btn btn-primary" disabled={contradictions.length > 0} onClick={approve}>Approve my Story Map →</button>
        {contradictions.length > 0 && <p>Clear up the conflicting answers before approving.</p>}
        {problem && <p role="alert" className="story-map-review-problem">{problem}</p>}
      </div>
    </div>
  );
}
