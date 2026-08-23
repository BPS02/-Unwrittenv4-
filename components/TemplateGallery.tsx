"use client";

import type { Template, TemplateFamily } from "@/lib/types";

interface TemplateGalleryProps {
  groups: Array<{ family: TemplateFamily; templates: Template[] }>;
  onSelect: (template: Template) => void;
}

/**
 * The starter templates, grouped under their emotion families. Everything is
 * hand-curated and selection is instant — no model call, no busy state:
 * clicking a card chooses its feelings and drops one of its hand-written
 * opening thoughts straight into the flow.
 */
export default function TemplateGallery({ groups, onSelect }: TemplateGalleryProps) {
  return (
    <div className="template-families">
      {groups.map(({ family, templates }) => (
        <section key={family} className="template-family" aria-label={family}>
          <h2 className="template-family-name">{family}</h2>
          <div className="template-grid" role="list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="listitem"
                className="template-card"
                onClick={() => onSelect(template)}
              >
                <span className="glyph" aria-hidden="true">
                  {template.glyph}
                </span>
                <h3>{template.theme}</h3>
                <p className="tagline">{template.tagline}</p>
                <span
                  className="feelings"
                  aria-label={`Feelings: ${template.feelings.join(", ")}`}
                >
                  {template.feelings.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
