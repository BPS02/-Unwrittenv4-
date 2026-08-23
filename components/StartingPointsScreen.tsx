"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TemplateGallery from "./TemplateGallery";
import { DRAFT_KEY, packExpiring } from "@/lib/draft-storage";
import { templatesByFamily } from "@/lib/templates";
import { DEFAULT_CONTROLS, EMPTY_INPUT, type Template } from "@/lib/types";

/**
 * The browse-templates screen. Every template is hand-curated (see
 * lib/templates.ts) and choosing one is instant: its feelings are selected
 * right away and one of its hand-written opening thoughts lands in the box.
 * No model writes anything here — there is nothing to wait for and nothing
 * to fail.
 */
export default function StartingPointsScreen() {
  const router = useRouter();
  /** Per-template pick counter, so choosing one again rotates its thought. */
  const attempts = useRef<Record<string, number>>({});

  function selectTemplate(template: Template) {
    const attempt = attempts.current[template.id] ?? 0;
    attempts.current[template.id] = attempt + 1;
    const thought =
      template.starterThoughts[attempt % template.starterThoughts.length] ??
      template.starterThoughts[0] ??
      "";

    sessionStorage.setItem(
      DRAFT_KEY,
      packExpiring({
        step: "write",
        reached: "write",
        mode: "template",
        input: {
          ...EMPTY_INPUT,
          thought,
          feelings: [...template.feelings],
          templateId: template.id,
        },
        controls: { ...DEFAULT_CONTROLS, ...template.suggested },
        variation: 0,
        song: null,
        songId: null,
        questions: [],
        answers: {},
      })
    );
    router.push("/create");
  }

  return (
    <section className="start-page">
      <div className="start-heading">
        <p className="eyebrow">STARTER TEMPLATES</p>
        <h1>Find a place to begin.</h1>
        <p>
          Browse by feeling. Pick the one closest to yours — it chooses the emotions and an
          opening thought for you, and every word of it is yours to change.
        </p>
        <div className="start-actions">
          <Link href="/" className="auth-skip">← Start with my own thought</Link>
        </div>
      </div>

      <TemplateGallery groups={templatesByFamily()} onSelect={selectTemplate} />
    </section>
  );
}
