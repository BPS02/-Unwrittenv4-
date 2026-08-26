# Grounded pipeline v12 — auditor A/B — 2026-08-26

## Setup

Single changed variable against the v12 baseline run: `unwritten-claims-audit`
staging v6 pins `anthropic/claude-sonnet-4.5` while draft and repair stay on
`deepseek/deepseek-v4-pro` (staging v6/v6). Text of all three prompts
unchanged. The harness log confirms the split served as configured.

| Configuration | Passes |
| --- | ---: |
| v12, DeepSeek audits DeepSeek | 1/6 |
| v12, Sonnet audits DeepSeek | **2/6** |

Survivors: `sm_02_silent_drive` and `sm_17_driving_roles`, both after repair.

## What the A/B proved

1. **The Sonnet auditor is better calibrated in both directions.**
   - It passed two fixtures the DeepSeek auditor blocked.
   - It *caught* `sm_05_tomorrow_call` — the DeepSeek-audit survivor — whose
     draft contains real inventions (`I set the phone down by the plate`,
     `a call I made too late`) the DeepSeek auditor had let through. The v12
     baseline's lone pass was partly an audit miss, not a clean song.
2. **Reconciliation converted a failure into a pass.** On `sm_17` attempt 2
   the Sonnet auditor's only flag was again the cited exact phrase; the
   deterministic check cleared it and the fixture passed with zero remaining
   flags — the exact scenario the contract was built for.
3. **The remaining problem is DeepSeek's drafts.** `sm_14_closed_diner` drew
   9–10 flags per attempt for invented props (jukebox light, vinyl seats,
   carved initials, a leaking roof); `sm_01` invented actions around the
   approved name. These are draft-side fabrications correctly caught.

## Decision

Keep Sonnet as the auditor. The draft side is now the open variable: the
full-Sonnet configuration has never run on the modern deterministic stack
(the v9 Sonnet run predates tempo/key defaulting, ending/fade normalization,
and reconciliation, and burned four repairs on since-eliminated defects).
Next controlled step: config-only staging push returning draft and repair to
`anthropic/claude-sonnet-4.5`, same six fixtures.

Production, the live app, and all Langfuse `production` labels remain
unchanged.
