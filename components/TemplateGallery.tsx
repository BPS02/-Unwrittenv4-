"use client";

import type { StartingPointWire } from "@/lib/starting-points";

interface TemplateGalleryProps {
  points: StartingPointWire[];
  onSelect: (point: StartingPointWire) => void;
  /** Id of the tile whose opening line is currently being written. */
  pendingId?: string | null;
}

/**
 * The starting-point tiles. Clicking one asks the model to write its opening
 * line, so the tile has a busy state — the wait is a second or two and
 * silence would read as a dead click.
 */
export default function TemplateGallery({
  points,
  onSelect,
  pendingId = null,
}: TemplateGalleryProps) {
  const busy = pendingId !== null;
  return (
    <div className="template-grid" role="list" aria-label="Starting points">
      {points.map((point) => {
        const isPending = pendingId === point.id;
        return (
          <button
            key={point.id}
            type="button"
            role="listitem"
            className={`template-card${isPending ? " is-pending" : ""}`}
            // Only one can be in flight; the rest go quiet rather than queueing.
            disabled={busy && !isPending}
            aria-busy={isPending}
            onClick={() => onSelect(point)}
          >
            <span className="glyph" aria-hidden="true">
              {point.glyph}
            </span>
            <h3>{point.theme}</h3>
            <p className="tagline">{point.tagline}</p>
            <span
              className="feelings"
              aria-label={`Feelings: ${point.feelings.join(", ")}`}
            >
              {point.feelings.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </span>
            {isPending && (
              <span className="template-pending" role="status">
                Writing your opening…
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
