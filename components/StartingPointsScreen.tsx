"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TemplateGallery from "./TemplateGallery";
import { DRAFT_KEY, packExpiring, unpackExpiring } from "@/lib/draft-storage";
import { DEFAULT_CONTROLS, EMPTY_INPUT } from "@/lib/types";
import type { StartingPointWire } from "@/lib/starting-points";

/** Generated tiles are kept for the session so a revisit costs nothing. */
const POINTS_CACHE_KEY = "liner-notes:starting-points:v1";

function errorMessageFrom(data: unknown, fallback: string): string {
  return data && typeof data === "object" && "error" in data && typeof data.error === "string"
    ? data.error
    : fallback;
}

interface StartingPointsScreenProps {
  /** The shipped ten — the fallback if generation fails, not the first paint. */
  initialPoints: StartingPointWire[];
}

export default function StartingPointsScreen({ initialPoints }: StartingPointsScreenProps) {
  const router = useRouter();
  /**
   * Empty until a set is ready. Showing the shipped ten while generation runs
   * meant a visitor could click one before their real tiles arrived — and the
   * grid would swap under their cursor a few seconds later. Better to hold the
   * screen for the few seconds it takes than to offer tiles we're replacing.
   */
  const [points, setPoints] = useState<StartingPointWire[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Surfaced failures — rate limits especially, which look like a dead app. */
  const [notice, setNotice] = useState<string | null>(null);
  /** Bumped per set, and per click, so nothing repeats itself. */
  const round = useRef(0);
  const attempts = useRef<Record<string, number>>({});
  const pendingRef = useRef<string | null>(null);

  /**
   * Fetches a set of tiles. Nothing clickable is on screen while this runs —
   * see the `points` comment above.
   *
   * On failure the shipped ten take over, so the visitor is never stranded on
   * a spinner: a stated fallback beats an empty gallery.
   */
  const loadPoints = useCallback(
    async (avoid: string[], fallback: StartingPointWire[]) => {
      setRefreshing(true);
      setNotice(null);
      const variation = ++round.current;
      try {
        const res = await fetch("/api/starting-points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ avoid, variation }),
        });
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          // Never swallow this. A silent failure here is indistinguishable
          // from "the AI stopped working".
          setNotice(
            errorMessageFrom(
              data,
              "Couldn’t write new starting points just now — here are ten to begin with."
            )
          );
          setPoints((current) => (current.length > 0 ? current : fallback));
          return;
        }
        const fresh = (data as { points?: StartingPointWire[] })?.points;
        if (Array.isArray(fresh) && fresh.length > 0) {
          setPoints(fresh);
          try {
            sessionStorage.setItem(POINTS_CACHE_KEY, packExpiring(fresh));
          } catch {
            // A full session store just means the next visit regenerates.
          }
        } else {
          setPoints((current) => (current.length > 0 ? current : fallback));
        }
      } catch {
        setNotice("Couldn’t reach the server — here are ten to begin with.");
        setPoints((current) => (current.length > 0 ? current : fallback));
      } finally {
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    // Generate ONCE per session, not per page view. Every call costs a
    // model request and a slot in the same hourly budget that lyrics, music
    // and questions draw on — re-firing on every visit (or every back
    // navigation) exhausts it before the visitor writes anything.
    const cached = unpackExpiring<StartingPointWire[]>(
      sessionStorage.getItem(POINTS_CACHE_KEY)
    );
    if (Array.isArray(cached) && cached.length > 0) {
      setPoints(cached);
      return;
    }
    void loadPoints([], initialPoints);
  }, [loadPoints, initialPoints]);

  function beginWith(point: StartingPointWire, thought: string) {
    sessionStorage.setItem(
      DRAFT_KEY,
      packExpiring({
        step: "write",
        reached: "write",
        mode: "template",
        input: {
          ...EMPTY_INPUT,
          thought,
          feelings: [...point.feelings],
          // Only the shipped ten have an id the server can resolve later.
          ...(point.builtIn ? { templateId: point.id } : {}),
        },
        controls: { ...DEFAULT_CONTROLS, ...point.suggested },
        variation: 0,
        song: null,
        songId: null,
        questions: [],
        answers: {},
      })
    );
    router.push("/create");
  }

  async function selectPoint(point: StartingPointWire) {
    if (pendingRef.current) return;
    pendingRef.current = point.id;
    setPendingId(point.id);
    const variation = attempts.current[point.id] ?? 0;
    attempts.current[point.id] = variation + 1;

    // Built-in tiles are resolved server-side by id; generated ones travel
    // back with the signature the server issued, and nothing else is trusted.
    const body = point.builtIn
      ? { templateId: point.id, variation }
      : {
          point: { theme: point.theme, tagline: point.tagline, feelings: point.feelings },
          token: point.token,
          variation,
        };

    try {
      const res = await fetch("/api/template-thought", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        // Do NOT drop them into an empty box and call it a fallback — that
        // reads as the feature silently breaking. Say what happened and
        // leave them where they are, able to try again or start their own.
        setNotice(
          errorMessageFrom(data, "Couldn’t write your opening line just now. Try again in a moment.")
        );
        return;
      }
      const written =
        data && typeof data === "object" && "thought" in data && typeof data.thought === "string"
          ? data.thought
          : "";
      beginWith(point, written);
    } catch {
      setNotice("Couldn’t reach the server. Try again in a moment.");
    } finally {
      pendingRef.current = null;
      setPendingId(null);
    }
  }

  // Waiting for the first set: hold the grid rather than offering tiles that
  // are about to be replaced.
  const waiting = points.length === 0 || refreshing;

  return (
    <section className="start-page">
      <div className="start-heading">
        <p className="eyebrow">TEN STARTING POINTS</p>
        <h1>Find a place to begin.</h1>
        <p>
          Pick the one closest to yours and we’ll write your first line — then change every word
          of it. Feelings are always optional.
        </p>
        <div className="start-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={waiting || pendingId !== null}
            // Explicit refresh always regenerates, cache or not.
            onClick={() => void loadPoints(points.map((p) => p.theme), initialPoints)}
          >
            {refreshing ? "Thinking of ten more…" : "↻ Ten different ones"}
          </button>
          <Link href="/" className="auth-skip">← Start with my own thought</Link>
        </div>
        {notice && (
          <p className="start-notice" role="status" aria-live="polite">
            {notice}
          </p>
        )}
      </div>

      {waiting ? (
        <div className="template-grid is-waiting" aria-busy="true">
          <p className="start-waiting" role="status" aria-live="polite">
            Writing ten starting points for you…
          </p>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="template-skeleton" aria-hidden="true">
              <span className="sk-glyph" />
              <span className="sk-title" />
              <span className="sk-line" />
              <span className="sk-chips" />
            </div>
          ))}
        </div>
      ) : (
        <TemplateGallery
          points={points}
          onSelect={(p) => void selectPoint(p)}
          pendingId={pendingId}
        />
      )}
    </section>
  );
}
