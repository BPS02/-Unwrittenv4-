# Grounded pipeline v8 — deterministic normalization — 2026-08-26

## Controlled comparison

Pipeline v8 reused the same Langfuse staging v4 prompts as pipeline v7. The changed variable was deterministic mechanical normalization before each validation pass.

| Pipeline | Passes |
| --- | ---: |
| v7, model-only mechanical repair | 0/6 |
| v8, deterministic mechanical normalization | **1/6** |

No final v8 failure was caused by STYLE length, missing exact text, or unauthorized scope terms. The normalizer successfully moved final failures to the semantic audit layer.

## Remaining failures

- `sm_01_birthday_kitchen`: auditor rejected an approved exact phrase/name line.
- `sm_05_tomorrow_call`: unsupported desk placement and a new request to delay work.
- `sm_11_blanket_fort`: invented seating positions, permanence, reminder meaning, and renewed blanket-saving claim.
- `sm_14_closed_diner`: generic unsupported truth and persistence lines.
- `sm_17_driving_roles`: auditor rejected the approved exact phrase `you still tell me when to brake` despite its citation.

## Human review of survivor

| Story Map | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Average | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `sm_02_silent_drive` | 3 | 4 | 3 | 3 | 3 | 4 | 4 | 3.43 | Fail |

The song has a concrete hook and coherent arrangement, but adds unsupported `tonight`, uses generic truth/words language, and does not deepen the story enough in Verse 2.

## Decision

Deterministic normalization is retained. Production remains blocked.

Next: deterministically reconcile audit flags against cited exact-policy atoms so an auditor cannot reject text already proven exact and authorized. Semantic flags without that proof remain blocking.
