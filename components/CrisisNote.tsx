"use client";

import { CRISIS_SUPPORT_MESSAGE } from "@/lib/crisis";

/** Gentle, non-blocking support note shown only when crisis language appears. */
export default function CrisisNote() {
  return (
    <aside className="banner banner-support" role="note">
      <h3>{CRISIS_SUPPORT_MESSAGE.heading}</h3>
      <p>
        {CRISIS_SUPPORT_MESSAGE.body}{" "}
        {CRISIS_SUPPORT_MESSAGE.links.map((link, i) => (
          <span key={link.href}>
            {i > 0 && " · "}
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          </span>
        ))}
      </p>
    </aside>
  );
}
