# Grounded pipeline v3 quality review — 2026-08-25

## Repeat-run stability

The fixed six-fixture v3 evaluation was repeated while preserving complete outputs for quality review.

| v3 run | Automated passes |
| --- | ---: |
| Initial complete run | 4/6 |
| Preserved-output repeat | 1/6 |

The repeat produced one first-pass survivor, `sm_02_silent_drive`. Five cases failed the grounding gates; no repaired song survived. This level of run-to-run variance blocks production independently of lyric quality.

## Human review

Passing requires every score to be at least 3, fidelity at least 4, and a 4.0 average.

| Story Map | Fidelity | Specificity | Progression | Chorus | Natural | Singable | STYLE | Average | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `sm_02_silent_drive` | 3 | 4 | 2 | 4 | 4 | 4 | 3 | 3.43 | Fail |

### Findings

- The hook `We left the radio off` is memorable, concrete, and singable.
- Verse 2 repeats the car, quiet, conversation, hand, dial, and silence material instead of advancing the approved change.
- `Now every drive's a quiet one` generalizes one final silent ride into an unsupported ongoing fact.
- `No song could carry what we lost` is generic and less personal than the approved details.
- STYLE calls for a fade even though fade-outs are excluded by default and the production brief should name an exact final sound.

## Decision

No song passes the human gate. Do not publish v3 prompts to Langfuse and do not connect the pipeline to the live app.

The next revision must:

1. Ban temporal generalization: one event cannot become `always`, `every`, `now`, or a continuing habit unless the source authorizes it.
2. Make Verse 2 use the approved change-over-time or present-state atom and avoid repeating Verse 1's concrete nouns.
3. Require chorus support lines to remain as specific as the hook rather than falling back to generic loss language.
4. Enforce the STYLE exclusions and exact ending mechanically.
5. Measure stability across repeated runs, not a single lucky six-case pass.
