# Grounded pipeline v7 — Langfuse staging v4 — 2026-08-26

## Served prompts

- `unwritten-grounded-draft` v4, label `staging`
- `unwritten-grounded-repair` v4, label `staging`
- `unwritten-claims-audit` v4, label `staging`

## Result

| Metric | Result |
| --- | ---: |
| Complete passes | **0/6** |
| Repair attempts used | 6/6 |
| Passed after repair | 0/6 |

Final blockers:

- `sm_01_birthday_kitchen`: the stricter audit caught invented recipe failure, universal care, previously missed acts, and permanence language.
- `sm_02_silent_drive`: repair retained unauthorized `every` scope.
- `sm_05_tomorrow_call`: repair returned STYLE above 110 words.
- `sm_11_blanket_fort`: repair retained unauthorized `now` scope on a citation that did not authorize transition.
- `sm_14_closed_diner`: repair retained unauthorized `every` scope.
- `sm_17_driving_roles`: repair returned STYLE above 110 words.

## Decision

The stricter audit is useful, but the prompt-only mechanical repair strategy is rejected. Do not promote staging v4.

The next pipeline should apply deterministic mechanical normalization before spending the one model repair: remove only explicitly unauthorized scope terms from named lines, restore exact-policy text where unambiguous, and constrain STYLE length without deleting BPM, key, ending, or exclusions. The model repair should then focus on semantic invention and lyric quality.
